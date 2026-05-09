package main

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/subtle"
	"crypto/x509"
	"database/sql"
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

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/appcheck"
	"github.com/jackc/pgx/v5/pgxpool"
)

const firebaseCertURL = "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

type config struct {
	port              string
	aiBackendURL      string
	databaseURL       string
	firebaseProjectID string
	authMode          string
	appCheckMode      string
	adminToken        string
	allowedOrigins    []string
	rateLimitPerMin   int
	aiRateLimitPerMin int
	requestTimeout    time.Duration
}

type server struct {
	config      config
	client      *http.Client
	auditor     *auditStore
	certCache   *firebaseCertCache
	appCheck    *appcheck.Client
	rateLimiter *rateLimiter
	aiLimiter   *rateLimiter
	backendURL  *url.URL
}

type firebaseTokenClaims struct {
	Audience  string `json:"aud"`
	Issuer    string `json:"iss"`
	Subject   string `json:"sub"`
	ExpiresAt int64  `json:"exp"`
	IssuedAt  int64  `json:"iat"`
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

type auditSummary struct {
	AuditDB             bool           `json:"audit_db"`
	Window              string         `json:"window"`
	GeneratedAt         time.Time      `json:"generated_at"`
	TotalRequests       int64          `json:"total_requests"`
	FailedRequests      int64          `json:"failed_requests"`
	RateLimitedRequests int64          `json:"rate_limited_requests"`
	AvgLatencyMS        float64        `json:"avg_latency_ms"`
	TopEndpoints        []endpointStat `json:"top_endpoints"`
	SuspiciousIPs       []ipStat       `json:"suspicious_ips"`
	RecentFailures      []failureStat  `json:"recent_failures"`
}

type endpointStat struct {
	Endpoint     string  `json:"endpoint"`
	Count        int64   `json:"count"`
	FailedCount  int64   `json:"failed_count"`
	AvgLatencyMS float64 `json:"avg_latency_ms"`
}

type ipStat struct {
	IP          string    `json:"ip"`
	Count       int64     `json:"count"`
	FailedCount int64     `json:"failed_count"`
	LastSeen    time.Time `json:"last_seen"`
}

type failureStat struct {
	CreatedAt time.Time `json:"created_at"`
	UID       string    `json:"uid"`
	Endpoint  string    `json:"endpoint"`
	Method    string    `json:"method"`
	IP        string    `json:"ip"`
	Status    int       `json:"status"`
	Reason    string    `json:"reason"`
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

	appCheckClient, err := newAppCheckClient(context.Background(), cfg)
	if err != nil {
		log.Fatalf("app check: %v", err)
	}

	app := &server{
		config: cfg,
		client: &http.Client{
			Timeout: cfg.requestTimeout,
		},
		auditor:     auditor,
		certCache:   &firebaseCertCache{},
		appCheck:    appCheckClient,
		rateLimiter: newRateLimiter(cfg.rateLimitPerMin, time.Minute),
		aiLimiter:   newRateLimiter(cfg.aiRateLimitPerMin, time.Minute),
		backendURL:  backendURL,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", app.health)
	mux.HandleFunc("GET /admin", app.adminDashboard)
	mux.HandleFunc("GET /admin/audit-summary", app.adminAuditSummary)
	mux.HandleFunc("/", app.proxy)

	log.Printf("security gateway listening on :%s and proxying to %s", cfg.port, cfg.aiBackendURL)
	if err := http.ListenAndServe(":"+cfg.port, withCORS(mux, cfg.allowedOrigins)); err != nil {
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
		appCheckMode:      normalizeMode(getenv("APP_CHECK_MODE", "off"), []string{"off", "optional", "required"}, "off"),
		adminToken:        os.Getenv("ADMIN_DASHBOARD_TOKEN"),
		allowedOrigins:    parseCSV(getenv("SECURITY_ALLOWED_ORIGINS", "*")),
		rateLimitPerMin:   getenvInt("RATE_LIMIT_PER_MINUTE", 60),
		aiRateLimitPerMin: getenvInt("AI_RATE_LIMIT_PER_MINUTE", 20),
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

func normalizeMode(value string, allowed []string, fallback string) string {
	normalized := strings.ToLower(strings.TrimSpace(value))
	for _, option := range allowed {
		if normalized == option {
			return normalized
		}
	}
	return fallback
}

func parseCSV(value string) []string {
	parts := strings.Split(value, ",")
	items := make([]string, 0, len(parts))
	for _, part := range parts {
		item := strings.TrimSpace(part)
		if item != "" {
			items = append(items, item)
		}
	}
	if len(items) == 0 {
		return []string{"*"}
	}
	return items
}

func withCORS(next http.Handler, allowedOrigins []string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := allowedOrigin(r.Header.Get("Origin"), allowedOrigins); origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
		}
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Request-ID, X-Firebase-AppCheck, X-Admin-Token")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func allowedOrigin(origin string, allowedOrigins []string) string {
	for _, allowed := range allowedOrigins {
		if allowed == "*" {
			return "*"
		}
		if origin != "" && origin == allowed {
			return origin
		}
	}
	return ""
}

func (s *server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":              true,
		"service":         "daily-discipline-security-gateway",
		"auth_mode":       s.config.authMode,
		"app_check_mode":  s.config.appCheckMode,
		"rate_limit":      s.config.rateLimitPerMin,
		"ai_rate_limit":   s.config.aiRateLimitPerMin,
		"audit_db":        s.auditor.Enabled(),
		"admin_dashboard": s.config.adminToken != "",
		"ai_backend_url":  s.config.aiBackendURL,
		"firebase_config": s.config.firebaseProjectID != "",
		"allowed_origins": s.config.allowedOrigins,
	})
}

func (s *server) adminDashboard(w http.ResponseWriter, _ *http.Request) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(adminDashboardHTML))
}

func (s *server) adminAuditSummary(w http.ResponseWriter, r *http.Request) {
	if err := s.requireAdminToken(r); err != nil {
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	}

	summary, err := s.auditor.Summary(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "audit summary unavailable")
		return
	}

	writeJSON(w, http.StatusOK, summary)
}

func (s *server) requireAdminToken(r *http.Request) error {
	if strings.TrimSpace(s.config.adminToken) == "" {
		return errors.New("admin token not configured")
	}

	token := strings.TrimSpace(r.Header.Get("X-Admin-Token"))
	if token == "" {
		token = strings.TrimSpace(r.URL.Query().Get("token"))
	}

	// I compare admin tokens in constant time so this dashboard does not leak
	// useful timing clues if someone probes it from outside the app.
	if subtle.ConstantTimeCompare([]byte(token), []byte(s.config.adminToken)) != 1 {
		return errors.New("invalid admin token")
	}

	return nil
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

	if err := s.verifyAppCheck(r); err != nil {
		status = http.StatusUnauthorized
		reason = err.Error()
		writeError(w, status, "app check failed")
		return
	}

	limitKey := uid
	if limitKey == "" {
		limitKey = ip
	}
	limiter := s.rateLimiter
	if isAIHeavyEndpoint(r.URL.Path) {
		limiter = s.aiLimiter
	}
	if !limiter.Allow(limitKey) {
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

func newAppCheckClient(ctx context.Context, cfg config) (*appcheck.Client, error) {
	if cfg.appCheckMode == "off" {
		return nil, nil
	}
	if cfg.firebaseProjectID == "" {
		if cfg.appCheckMode == "required" {
			return nil, errors.New("APP_CHECK_MODE=required needs FIREBASE_PROJECT_ID")
		}
		log.Println("APP_CHECK_MODE is optional but FIREBASE_PROJECT_ID is empty; skipping App Check verification")
		return nil, nil
	}

	// I used the official Firebase Admin SDK here so production can verify
	// X-Firebase-AppCheck tokens before proxying expensive AI requests.
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: cfg.firebaseProjectID})
	if err != nil {
		if cfg.appCheckMode == "required" {
			return nil, err
		}
		log.Printf("App Check optional mode disabled because Firebase app init failed: %v", err)
		return nil, nil
	}

	client, err := app.AppCheck(ctx)
	if err != nil {
		if cfg.appCheckMode == "required" {
			return nil, err
		}
		log.Printf("App Check optional mode disabled because client init failed: %v", err)
		return nil, nil
	}
	return client, nil
}

func (s *server) verifyAppCheck(r *http.Request) error {
	if s.config.appCheckMode == "off" {
		return nil
	}

	token := strings.TrimSpace(r.Header.Get("X-Firebase-AppCheck"))
	if token == "" {
		if s.config.appCheckMode == "required" {
			return errors.New("missing app check token")
		}
		return nil
	}
	if s.appCheck == nil {
		if s.config.appCheckMode == "required" {
			return errors.New("app check verifier unavailable")
		}
		return nil
	}

	if _, err := s.appCheck.VerifyToken(token); err != nil {
		return fmt.Errorf("invalid app check token: %w", err)
	}
	return nil
}

func isAIHeavyEndpoint(path string) bool {
	switch path {
	case "/v1/parse-tasks",
		"/v1/reality-check",
		"/v1/reschedule",
		"/v1/task-breakdown",
		"/v1/daily-feedback",
		"/v1/pattern-feedback",
		"/v1/weekly-review",
		"/v1/routine-coach":
		return true
	default:
		return false
	}
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

func (a *auditStore) Summary(ctx context.Context) (auditSummary, error) {
	summary := auditSummary{
		AuditDB:     a.Enabled(),
		Window:      "24h",
		GeneratedAt: time.Now().UTC(),
	}

	if !a.Enabled() {
		return summary, nil
	}

	var avgLatency sql.NullFloat64
	if err := a.pool.QueryRow(
		ctx,
		`
		SELECT
			COUNT(*),
			COUNT(*) FILTER (WHERE status >= 400),
			COUNT(*) FILTER (WHERE status = 429),
			AVG(latency_ms)
		FROM security_audit_logs
		WHERE created_at >= NOW() - INTERVAL '24 hours'
		`,
	).Scan(
		&summary.TotalRequests,
		&summary.FailedRequests,
		&summary.RateLimitedRequests,
		&avgLatency,
	); err != nil {
		return summary, err
	}
	if avgLatency.Valid {
		summary.AvgLatencyMS = avgLatency.Float64
	}

	endpointRows, err := a.pool.Query(
		ctx,
		`
		SELECT endpoint, COUNT(*), COUNT(*) FILTER (WHERE status >= 400), AVG(latency_ms)
		FROM security_audit_logs
		WHERE created_at >= NOW() - INTERVAL '24 hours'
		GROUP BY endpoint
		ORDER BY COUNT(*) DESC
		LIMIT 8
		`,
	)
	if err != nil {
		return summary, err
	}
	defer endpointRows.Close()

	for endpointRows.Next() {
		var stat endpointStat
		var avg sql.NullFloat64
		if err := endpointRows.Scan(
			&stat.Endpoint,
			&stat.Count,
			&stat.FailedCount,
			&avg,
		); err != nil {
			return summary, err
		}
		if avg.Valid {
			stat.AvgLatencyMS = avg.Float64
		}
		summary.TopEndpoints = append(summary.TopEndpoints, stat)
	}
	if err := endpointRows.Err(); err != nil {
		return summary, err
	}

	ipRows, err := a.pool.Query(
		ctx,
		`
		SELECT COALESCE(ip::text, 'unknown'), COUNT(*), COUNT(*) FILTER (WHERE status >= 400), MAX(created_at)
		FROM security_audit_logs
		WHERE created_at >= NOW() - INTERVAL '24 hours'
		GROUP BY ip
		HAVING COUNT(*) FILTER (WHERE status >= 400) > 0 OR COUNT(*) >= 20
		ORDER BY COUNT(*) FILTER (WHERE status >= 400) DESC, COUNT(*) DESC
		LIMIT 8
		`,
	)
	if err != nil {
		return summary, err
	}
	defer ipRows.Close()

	for ipRows.Next() {
		var stat ipStat
		if err := ipRows.Scan(
			&stat.IP,
			&stat.Count,
			&stat.FailedCount,
			&stat.LastSeen,
		); err != nil {
			return summary, err
		}
		summary.SuspiciousIPs = append(summary.SuspiciousIPs, stat)
	}
	if err := ipRows.Err(); err != nil {
		return summary, err
	}

	failureRows, err := a.pool.Query(
		ctx,
		`
		SELECT created_at, COALESCE(uid, ''), endpoint, method, COALESCE(ip::text, ''), status, COALESCE(reason, '')
		FROM security_audit_logs
		WHERE created_at >= NOW() - INTERVAL '24 hours'
		  AND status >= 400
		ORDER BY created_at DESC
		LIMIT 12
		`,
	)
	if err != nil {
		return summary, err
	}
	defer failureRows.Close()

	for failureRows.Next() {
		var stat failureStat
		if err := failureRows.Scan(
			&stat.CreatedAt,
			&stat.UID,
			&stat.Endpoint,
			&stat.Method,
			&stat.IP,
			&stat.Status,
			&stat.Reason,
		); err != nil {
			return summary, err
		}
		summary.RecentFailures = append(summary.RecentFailures, stat)
	}
	if err := failureRows.Err(); err != nil {
		return summary, err
	}

	return summary, nil
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

const adminDashboardHTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Daily Discipline Security</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #07111f; color: #e5eefb; }
    body { margin: 0; min-height: 100vh; background: radial-gradient(circle at top right, rgba(59,130,246,.24), transparent 34rem), #07111f; }
    main { width: min(1120px, calc(100vw - 32px)); margin: 0 auto; padding: 48px 0; }
    header { display: flex; align-items: flex-end; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
    h1 { margin: 0; font-size: clamp(32px, 6vw, 64px); letter-spacing: -0.06em; line-height: .92; }
    p { color: #9fb0c8; line-height: 1.6; }
    button { border: 0; border-radius: 999px; padding: 12px 18px; background: #60a5fa; color: #06101e; font-weight: 900; cursor: pointer; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; }
    .card { border: 1px solid rgba(148,163,184,.18); border-radius: 24px; padding: 18px; background: rgba(15,23,42,.72); box-shadow: 0 24px 70px rgba(0,0,0,.24); backdrop-filter: blur(18px); }
    .metric { font-size: 36px; font-weight: 950; letter-spacing: -0.05em; margin-top: 8px; }
    .label { color: #9fb0c8; font-size: 12px; font-weight: 900; letter-spacing: .1em; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 13px; }
    th, td { padding: 10px 8px; border-bottom: 1px solid rgba(148,163,184,.15); text-align: left; vertical-align: top; }
    th { color: #9fb0c8; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; }
    .wide { grid-column: 1 / -1; }
    .error { color: #fca5a5; font-weight: 800; }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <p class="label">Security gateway</p>
        <h1>Audit Dashboard</h1>
        <p>Request volume, failures, rate limits, suspicious IPs, and recent blocked calls from the Go gateway.</p>
      </div>
      <button id="refresh">Refresh</button>
    </header>
    <section id="status" class="card">Loading audit summary...</section>
    <section id="metrics" class="grid" style="margin-top:14px"></section>
  </main>
  <script>
    const statusEl = document.querySelector('#status');
    const metricsEl = document.querySelector('#metrics');
    const fmt = new Intl.NumberFormat();

    async function getToken() {
      let token = localStorage.getItem('dailyDisciplineAdminToken');
      if (!token) {
        token = prompt('Admin dashboard token');
        if (token) localStorage.setItem('dailyDisciplineAdminToken', token);
      }
      return token || '';
    }

    function table(title, rows, columns) {
      const head = columns.map((col) => '<th>' + col.label + '</th>').join('');
      const body = rows.length
        ? rows.map((row) => '<tr>' + columns.map((col) => '<td>' + (row[col.key] ?? '') + '</td>').join('') + '</tr>').join('')
        : '<tr><td colspan="' + columns.length + '">No rows in this window.</td></tr>';
      return '<article class="card wide"><p class="label">' + title + '</p><table><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></article>';
    }

    async function loadSummary() {
      statusEl.textContent = 'Loading audit summary...';
      try {
        const token = await getToken();
        const response = await fetch('/admin/audit-summary', { headers: { 'X-Admin-Token': token } });
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        statusEl.innerHTML = '<strong>Window:</strong> ' + data.window + ' · <strong>Generated:</strong> ' + new Date(data.generated_at).toLocaleString() + ' · <strong>Audit DB:</strong> ' + (data.audit_db ? 'connected' : 'stdout only');
        metricsEl.innerHTML = [
          metric('Requests', data.total_requests),
          metric('Failures', data.failed_requests),
          metric('Rate limited', data.rate_limited_requests),
          metric('Avg latency', Math.round(data.avg_latency_ms) + 'ms'),
          table('Top endpoints', data.top_endpoints || [], [
            { key: 'endpoint', label: 'Endpoint' },
            { key: 'count', label: 'Count' },
            { key: 'failed_count', label: 'Failed' },
            { key: 'avg_latency_ms', label: 'Avg ms' },
          ]),
          table('Suspicious IPs', data.suspicious_ips || [], [
            { key: 'ip', label: 'IP' },
            { key: 'count', label: 'Count' },
            { key: 'failed_count', label: 'Failed' },
            { key: 'last_seen', label: 'Last seen' },
          ]),
          table('Recent failures', data.recent_failures || [], [
            { key: 'created_at', label: 'Time' },
            { key: 'uid', label: 'UID' },
            { key: 'endpoint', label: 'Endpoint' },
            { key: 'status', label: 'Status' },
            { key: 'reason', label: 'Reason' },
          ]),
        ].join('');
      } catch (error) {
        statusEl.innerHTML = '<span class="error">Could not load dashboard.</span><p>' + String(error.message || error) + '</p>';
      }
    }

    function metric(label, value) {
      return '<article class="card"><p class="label">' + label + '</p><div class="metric">' + (typeof value === 'number' ? fmt.format(value) : value) + '</div></article>';
    }

    document.querySelector('#refresh').addEventListener('click', loadSummary);
    loadSummary();
  </script>
</body>
</html>`

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
