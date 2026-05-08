package main

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const firebaseCertURL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

type config struct {
	port              string
	aiBackendURL      string
	databaseURL       string
	firebaseProjectID string
	authMode          string
	rateLimitPerMin   int
	requestTimeout    time.Duration
}

type server struct {
	config      config
	client      *http.Client
	auditor     *auditStore
	certCache   *firebaseCertCache
	rateLimiter *rateLimiter
	backendURL  *url.URL
}

type firebaseTokenClaims struct {
	Audience  string `json:"aud"`
	Issuer    string `json:"iss"`
	Subject   string `json:"sub"`
	ExpiresAt int64  `json:"exp"`
	IssuedAt   int64  `json:"iat"`
}

type jwtHeader struct {
	Algorithm string `json:"alg"`
	KeyID     string `json:"kid"`
}

type firebaseCertCache struct {
	mu        sync.Mutex
	certs     map[string]*rsa.PublicKey
	expiresAt time.Time
}

type rateLimiter struct {
	mu      sync.Mutex
	limit   int
	window  time.Duration
	entries map[string]*rateEntry
}

type rateEntry struct {
	count    int
	resetAt  time.Time
	lastSeen time.Time
}

type auditStore struct {
	pool *pgxpool.Pool
}

type auditEntry struct {
	RequestID string
	UID       string
	Endpoint  string
	Method    string
	IP        string
	Status    int
	UserAgent string
	LatencyMS int64
	Reason    string
}

func main() {
	cfg := loadConfig()
	backendURL, err := url.Parse(cfg.aiBackendURL)
	if err != nil {
		log.Fatalf("invalid AI_BACKEND_URL: %v", err)
	}

	auditor, err := newAuditStore(context.Background(), cfg.databaseURL)
	if err != nil {
		log.Fatalf("audit store: %v", err)
	}
	defer auditor.Close()

	app := &server{
		config: cfg,
		client: &http.Client{
			Timeout: cfg.requestTimeout,
		},
		auditor:     auditor,
		certCache:   &firebaseCertCache{},
		rateLimiter: newRateLimiter(cfg.rateLimitPerMin, time.Minute),
		backendURL:  backendURL,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", app.health)
	mux.HandleFunc("/", app.proxy)

	log.Printf("security gateway listening on :%s and proxying to %s", cfg.port, cfg.aiBackendURL)
	if err := http.ListenAndServe(":"+cfg.port, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func loadConfig() config {
	return config{
		port:              getenv("PORT", "8020"),
		aiBackendURL:      getenv("AI_BACKEND_URL", "http://127.0.0.1:8000"),
		databaseURL:       os.Getenv("DATABASE_URL"),
		firebaseProjectID: os.Getenv("FIREBASE_PROJECT_ID"),
		authMode:          strings.ToLower(getenv("SECURITY_AUTH_MODE", "dev")),
		rateLimitPerMin:   getenvInt("RATE_LIMIT_PER_MINUTE", 60),
		requestTimeout:    time.Duration(getenvInt("UPSTREAM_TIMEOUT_SECONDS", 8)) * time.Second,
	}
}

func getenv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getenvInt(key string, fallback int) int {
	value, err := strconv.Atoi(strings.TrimSpace(os.Getenv(key)))
	if err != nil || value <= 0 {
		return fallback
	}
	return value
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":              true,
		"service":         "daily-discipline-security-gateway",
		"auth_mode":       s.config.authMode,
		"rate_limit":      s.config.rateLimitPerMin,
		"audit_db":        s.auditor.Enabled(),
		"ai_backend_url":  s.config.aiBackendURL,
		"firebase_config": s.config.firebaseProjectID != "",
	})
}

func (s *server) proxy(w http.ResponseWriter, r *http.Request) {
	startedAt := time.Now()
	status := http.StatusOK
	reason := ""
	requestID := requestID(r)
	uid := ""
	ip := clientIP(r)

	defer func() {
		latency := time.Since(startedAt).Milliseconds()
		if err := s.auditor.Write(r.Context(), auditEntry{
			RequestID: requestID,
			UID:       uid,
			Endpoint:  r.URL.Path,
			Method:    r.Method,
			IP:        ip,
			Status:    status,
			UserAgent: r.UserAgent(),
			LatencyMS: latency,
			Reason:    reason,
		}); err != nil {
			log.Printf("audit write failed: %v", err)
		}
	}()

	authenticatedUID, err := s.authenticate(r)
	if err != nil {
		status = http.StatusUnauthorized
		reason = err.Error()
		writeError(w, status, "unauthorized")
		return
	}
	uid = authenticatedUID

	limitKey := uid
	if limitKey == "" {
		limitKey = ip
	}
	if !s.rateLimiter.Allow(limitKey) {
		status = http.StatusTooManyRequests
		reason = "rate limit exceeded"
		writeError(w, status, "rate limit exceeded")
		return
	}

	status, reason = s.forward(w, r, uid, requestID)
}

func (s *server) authenticate(r *http.Request) (string, error) {
	authHeader := r.Header.Get("Authorization")
	token := strings.TrimSpace(strings.TrimPrefix(authHeader, "Bearer "))

	if s.config.authMode == "dev" {
		if token == "" {
			return "dev-user", nil
		}
		if s.config.firebaseProjectID == "" {
			return "dev-user", nil
		}
	}

	if token == "" {
		return "", errors.New("missing bearer token")
	}
	if s.config.firebaseProjectID == "" {
		return "", errors.New("missing FIREBASE_PROJECT_ID")
	}

	return s.verifyFirebaseToken(r.Context(), token)
}

func (s *server) verifyFirebaseToken(ctx context.Context, token string) (string, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", errors.New("malformed token")
	}

	headerBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", errors.New("bad token header")
	}

	var header jwtHeader
	if err := json.Unmarshal(headerBytes, &header); err != nil {
		return "", errors.New("bad token header json")
	}
	if header.Algorithm != "RS256" || header.KeyID == "" {
		return "", errors.New("unsupported token signature")
	}

	publicKey, err := s.certCache.PublicKey(ctx, header.KeyID)
	if err != nil {
		return "", err
	}

	signedContent := parts[0] + "." + parts[1]
	signature, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return "", errors.New("bad token signature")
	}

	digest := sha256.Sum256([]byte(signedContent))
	if err := rsa.VerifyPKCS1v15(publicKey, crypto.SHA256, digest[:], signature); err != nil {
		return "", errors.New("invalid token signature")
	}

	claimBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", errors.New("bad token claims")
	}

	var claims firebaseTokenClaims
	if err := json.Unmarshal(claimBytes, &claims); err != nil {
		return "", errors.New("bad token claims json")
	}

	expectedIssuer := "https://securetoken.google.com/" + s.config.firebaseProjectID
	now := time.Now().Unix()
	switch {
	case claims.Audience != s.config.firebaseProjectID:
		return "", errors.New("token audience mismatch")
	case claims.Issuer != expectedIssuer:
		return "", errors.New("token issuer mismatch")
	case claims.Subject == "":
		return "", errors.New("token missing uid")
	case claims.ExpiresAt <= now:
		return "", errors.New("token expired")
	case claims.IssuedAt > now+60:
		return "", errors.New("token issued in future")
	}

	return claims.Subject, nil
}

func (c *firebaseCertCache) PublicKey(ctx context.Context, kid string) (*rsa.PublicKey, error) {
	c.mu.Lock()
	defer c.mu.Unlock()

	if c.certs != nil && time.Now().Before(c.expiresAt) {
		if key := c.certs[kid]; key != nil {
			return key, nil
		}
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, firebaseCertURL, nil)
	if err != nil {
		return nil, err
	}

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		return nil, fmt.Errorf("fetch firebase certs: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode >= 400 {
		return nil, fmt.Errorf("firebase certs status %d", response.StatusCode)
	}

	var pemByKey map[string]string
	if err := json.NewDecoder(response.Body).Decode(&pemByKey); err != nil {
		return nil, err
	}

	certs := make(map[string]*rsa.PublicKey)
	for certKid, pemValue := range pemByKey {
		block, _ := pem.Decode([]byte(pemValue))
		if block == nil {
			continue
		}
		cert, err := x509.ParseCertificate(block.Bytes)
		if err != nil {
			continue
		}
		if publicKey, ok := cert.PublicKey.(*rsa.PublicKey); ok {
			certs[certKid] = publicKey
		}
	}

	c.certs = certs
	c.expiresAt = time.Now().Add(10 * time.Minute)

	if key := c.certs[kid]; key != nil {
		return key, nil
	}
	return nil, errors.New("firebase token key not found")
}

func (s *server) forward(w http.ResponseWriter, r *http.Request, uid string, requestID string) (int, string) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeError(w, http.StatusBadRequest, "could not read request body")
		return http.StatusBadRequest, "read body failed"
	}

	target := *s.backendURL
	target.Path = singleJoiningSlash(s.backendURL.Path, r.URL.Path)
	target.RawQuery = r.URL.RawQuery

	upstreamRequest, err := http.NewRequestWithContext(
		r.Context(),
		r.Method,
		target.String(),
		bytes.NewReader(body),
	)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create upstream request")
		return http.StatusInternalServerError, "upstream request create failed"
	}

	copyHeaders(upstreamRequest.Header, r.Header)
	upstreamRequest.Header.Set("X-Authenticated-Uid", uid)
	upstreamRequest.Header.Set("X-Request-ID", requestID)

	response, err := s.client.Do(upstreamRequest)
	if err != nil {
		writeError(w, http.StatusBadGateway, "AI backend unavailable")
		return http.StatusBadGateway, "upstream unavailable"
	}
	defer response.Body.Close()

	copyHeaders(w.Header(), response.Header)
	w.Header().Set("X-Request-ID", requestID)
	w.WriteHeader(response.StatusCode)
	if _, err := io.Copy(w, response.Body); err != nil {
		return response.StatusCode, "response copy failed"
	}

	return response.StatusCode, ""
}

func singleJoiningSlash(basePath string, requestPath string) string {
	baseHasSlash := strings.HasSuffix(basePath, "/")
	requestHasSlash := strings.HasPrefix(requestPath, "/")
	switch {
	case baseHasSlash && requestHasSlash:
		return basePath + requestPath[1:]
	case !baseHasSlash && !requestHasSlash:
		return basePath + "/" + requestPath
	default:
		return basePath + requestPath
	}
}

func copyHeaders(destination http.Header, source http.Header) {
	for key, values := range source {
		if isHopByHopHeader(key) {
			continue
		}
		for _, value := range values {
			destination.Add(key, value)
		}
	}
}

func isHopByHopHeader(key string) bool {
	switch strings.ToLower(key) {
	case "connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade":
		return true
	default:
		return false
	}
}

func newRateLimiter(limit int, window time.Duration) *rateLimiter {
	return &rateLimiter{
		limit:   limit,
		window:  window,
		entries: make(map[string]*rateEntry),
	}
}

func (r *rateLimiter) Allow(key string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()

	now := time.Now()
	entry := r.entries[key]
	if entry == nil || now.After(entry.resetAt) {
		r.entries[key] = &rateEntry{
			count:    1,
			resetAt:  now.Add(r.window),
			lastSeen: now,
		}
		r.cleanup(now)
		return true
	}

	entry.count++
	entry.lastSeen = now
	return entry.count <= r.limit
}

func (r *rateLimiter) cleanup(now time.Time) {
	for key, entry := range r.entries {
		if now.Sub(entry.lastSeen) > 5*r.window {
			delete(r.entries, key)
		}
	}
}

func newAuditStore(ctx context.Context, databaseURL string) (*auditStore, error) {
	if strings.TrimSpace(databaseURL) == "" {
		log.Println("DATABASE_URL not set; audit logs will be written to stdout only")
		return &auditStore{}, nil
	}

	pool, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		return nil, err
	}

	store := &auditStore{pool: pool}
	if err := store.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}

	return store, nil
}

func (a *auditStore) Enabled() bool {
	return a != nil && a.pool != nil
}

func (a *auditStore) Close() {
	if a != nil && a.pool != nil {
		a.pool.Close()
	}
}

func (a *auditStore) migrate(ctx context.Context) error {
	if !a.Enabled() {
		return nil
	}

	_, err := a.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS security_audit_logs (
			id BIGSERIAL PRIMARY KEY,
			request_id TEXT NOT NULL,
			uid TEXT,
			endpoint TEXT NOT NULL,
			method TEXT NOT NULL,
			ip INET,
			status INTEGER NOT NULL,
			user_agent TEXT,
			latency_ms INTEGER NOT NULL,
			reason TEXT,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);
		CREATE INDEX IF NOT EXISTS idx_security_audit_logs_created_at ON security_audit_logs (created_at DESC);
		CREATE INDEX IF NOT EXISTS idx_security_audit_logs_uid ON security_audit_logs (uid);
		CREATE INDEX IF NOT EXISTS idx_security_audit_logs_ip ON security_audit_logs (ip);
		CREATE INDEX IF NOT EXISTS idx_security_audit_logs_endpoint ON security_audit_logs (endpoint);
	`)
	return err
}

func (a *auditStore) Write(ctx context.Context, entry auditEntry) error {
	if !a.Enabled() {
		log.Printf(
			"audit request_id=%s uid=%s method=%s endpoint=%s ip=%s status=%d latency_ms=%d reason=%s",
			entry.RequestID,
			entry.UID,
			entry.Method,
			entry.Endpoint,
			entry.IP,
			entry.Status,
			entry.LatencyMS,
			entry.Reason,
		)
		return nil
	}

	_, err := a.pool.Exec(
		ctx,
		`
		INSERT INTO security_audit_logs (
			request_id,
			uid,
			endpoint,
			method,
			ip,
			status,
			user_agent,
			latency_ms,
			reason
		)
		VALUES ($1, $2, $3, $4, NULLIF($5, '')::inet, $6, $7, $8, $9)
		`,
		entry.RequestID,
		nullIfEmpty(entry.UID),
		entry.Endpoint,
		entry.Method,
		entry.IP,
		entry.Status,
		entry.UserAgent,
		entry.LatencyMS,
		nullIfEmpty(entry.Reason),
	)
	return err
}

func requestID(r *http.Request) string {
	if existing := strings.TrimSpace(r.Header.Get("X-Request-ID")); existing != "" {
		return existing
	}

	var bytes [16]byte
	if _, err := rand.Read(bytes[:]); err != nil {
		return strconv.FormatInt(time.Now().UnixNano(), 36)
	}
	return hex.EncodeToString(bytes[:])
}

func clientIP(r *http.Request) string {
	forwardedFor := r.Header.Get("X-Forwarded-For")
	if forwardedFor != "" {
		return strings.TrimSpace(strings.Split(forwardedFor, ",")[0])
	}
	if realIP := strings.TrimSpace(r.Header.Get("X-Real-IP")); realIP != "" {
		return realIP
	}

	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func nullIfEmpty(value string) any {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{
		"ok":    false,
		"error": message,
	})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("write response: %v", err)
	}
}
