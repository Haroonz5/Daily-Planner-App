package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

type taskEvent struct {
	UserHash        string `json:"user_hash"`
	TaskID          string `json:"task_id,omitempty"`
	EventType       string `json:"event_type"`
	Title           string `json:"title"`
	Date            string `json:"date"`
	Time            string `json:"time"`
	Priority        string `json:"priority"`
	Completed       bool   `json:"completed"`
	Status          string `json:"status"`
	DurationMinutes int    `json:"duration_minutes,omitempty"`
	CreatedAt       string `json:"created_at"`
}

type bucketStats struct {
	Bucket          string  `json:"bucket"`
	TaskCount       int     `json:"task_count"`
	CompletedCount  int     `json:"completed_count"`
	CompletionRate  float64 `json:"completion_rate"`
	HighPriorityRun int     `json:"high_priority_count"`
}

type server struct {
	dataFile string
	mu       sync.Mutex
}

func main() {
	port := getenv("PORT", "8010")
	dataFile := getenv("STATS_DATA_FILE", "data/task-events.jsonl")

	app := &server{dataFile: dataFile}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", app.health)
	mux.HandleFunc("POST /v1/events", app.createEvent)
	mux.HandleFunc("GET /v1/completion-rate", app.completionRate)

	log.Printf("stats aggregator listening on :%s", port)
	if err := http.ListenAndServe(":"+port, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func getenv(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *server) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":       true,
		"service":  "daily-discipline-stats-aggregator",
		"dataFile": s.dataFile,
	})
}

func (s *server) createEvent(w http.ResponseWriter, r *http.Request) {
	var event taskEvent
	if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if err := normalizeEvent(&event); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := s.appendEvent(event); err != nil {
		log.Printf("append event: %v", err)
		writeError(w, http.StatusInternalServerError, "could not store event")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"ok": true,
	})
}

func normalizeEvent(event *taskEvent) error {
	event.UserHash = strings.TrimSpace(event.UserHash)
	event.EventType = strings.TrimSpace(event.EventType)
	event.Title = strings.TrimSpace(event.Title)
	event.Date = strings.TrimSpace(event.Date)
	event.Priority = strings.TrimSpace(event.Priority)
	event.Status = strings.TrimSpace(event.Status)

	if event.UserHash == "" {
		return errors.New("user_hash is required")
	}
	if event.EventType == "" {
		event.EventType = "completed"
	}
	if event.Date == "" {
		return errors.New("date is required")
	}
	if event.Priority == "" {
		event.Priority = "Medium"
	}
	if event.Status == "" {
		event.Status = "pending"
	}
	if event.CreatedAt == "" {
		event.CreatedAt = time.Now().UTC().Format(time.RFC3339)
	}

	return nil
}

func (s *server) appendEvent(event taskEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if err := os.MkdirAll(filepath.Dir(s.dataFile), 0o755); err != nil {
		return err
	}

	file, err := os.OpenFile(s.dataFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
	if err != nil {
		return err
	}
	defer file.Close()

	encoded, err := json.Marshal(event)
	if err != nil {
		return err
	}

	_, err = file.Write(append(encoded, '\n'))
	return err
}

func (s *server) completionRate(w http.ResponseWriter, r *http.Request) {
	startDate := r.URL.Query().Get("start_date")
	endDate := r.URL.Query().Get("end_date")

	events, err := s.readEvents()
	if err != nil {
		log.Printf("read events: %v", err)
		writeError(w, http.StatusInternalServerError, "could not read events")
		return
	}

	buckets := aggregateEvents(events, startDate, endDate)
	writeJSON(w, http.StatusOK, map[string]any{
		"buckets": buckets,
		"total":   len(events),
	})
}

func (s *server) readEvents() ([]taskEvent, error) {
	file, err := os.Open(s.dataFile)
	if errors.Is(err, os.ErrNotExist) {
		return []taskEvent{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var events []taskEvent
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		var event taskEvent
		if err := json.Unmarshal(scanner.Bytes(), &event); err == nil {
			events = append(events, event)
		}
	}

	return events, scanner.Err()
}

func aggregateEvents(events []taskEvent, startDate string, endDate string) []bucketStats {
	order := []string{"early morning", "morning", "afternoon", "evening", "unscheduled"}
	stats := make(map[string]*bucketStats)

	for _, bucket := range order {
		stats[bucket] = &bucketStats{Bucket: bucket}
	}

	for _, event := range events {
		if startDate != "" && event.Date < startDate {
			continue
		}
		if endDate != "" && event.Date > endDate {
			continue
		}

		bucket := timeBucket(event.Time)
		current := stats[bucket]
		current.TaskCount++

		if event.Completed || event.Status == "completed" {
			current.CompletedCount++
		}
		if event.Priority == "High" {
			current.HighPriorityRun++
		}
	}

	result := make([]bucketStats, 0, len(order))
	for _, bucket := range order {
		current := stats[bucket]
		if current.TaskCount > 0 {
			current.CompletionRate = float64(current.CompletedCount) / float64(current.TaskCount) * 100
		}
		result = append(result, *current)
	}

	return result
}

func timeBucket(value string) string {
	parsed, err := time.Parse("3:04 PM", strings.ToUpper(strings.TrimSpace(value)))
	if err != nil {
		return "unscheduled"
	}

	minutes := parsed.Hour()*60 + parsed.Minute()
	switch {
	case minutes < 9*60:
		return "early morning"
	case minutes < 12*60:
		return "morning"
	case minutes < 17*60:
		return "afternoon"
	default:
		return "evening"
	}
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
