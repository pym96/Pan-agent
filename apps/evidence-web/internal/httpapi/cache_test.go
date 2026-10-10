package httpapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"pan-agent/evidence-web/internal/bundles"
	"pan-agent/evidence-web/internal/config"
	"pan-agent/evidence-web/internal/evidence"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/querylog"
	"pan-agent/evidence-web/internal/tasks"
	"pan-agent/evidence-web/internal/taskview"
	"pan-agent/evidence-web/internal/testfixture"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type fixtureApp struct {
	*app
	db *pgxpool.Pool
}

func testCacheConfig() (config.Cache, error) {
	c, e := config.Parse(nil, func(k string) string {
		if k == "DATABASE_URL" {
			return "fixture"
		}
		return os.Getenv(k)
	})
	return c.Cache, e
}
func cacheFixture(t *testing.T) (*fixtureApp, string, string) {
	t.Helper()
	db := testfixture.Database(t)
	cfg := db.Config()
	cfg.MaxConns = 8
	cfg.ConnConfig.Tracer = querylog.QueryTracer{}
	traced, e := pgxpool.NewWithConfig(context.Background(), cfg)
	if e != nil {
		t.Fatal(e)
	}
	db = traced
	t.Cleanup(traced.Close)
	addr := os.Getenv("WEB113_TEST_REDIS")
	if addr == "" {
		t.Skip("owned Redis required")
	}
	c := newViewCache(config.Cache{Enabled: true, Address: addr, Namespace: "web113-tests", TTL: 5 * time.Second, RedisTimeout: 100 * time.Millisecond, PGTimeout: 2 * time.Second, Slots: 4})
	tid := testfixture.Task(t, db, "conversation", 1)
	token := identity.NewID()
	_, e = db.Exec(context.Background(), "INSERT INTO ew_sessions VALUES($1,'account',now()+interval '1 hour')", evidence.Hash([]byte(token)))
	if e != nil {
		t.Fatal(e)
	}
	a := &fixtureApp{db: db, app: &app{identity: identity.New(db), commands: tasks.New(db, nil), queries: taskview.New(db), bundles: bundles.New(db), views: c, origin: "http://fixture", web: t.TempDir()}}
	return a, tid, token
}
func viewRequest(a *fixtureApp, tid, token string) *httptest.ResponseRecorder {
	r := httptest.NewRequest("GET", "http://fixture/api/tasks/"+tid, nil)
	if token != "" {
		r.AddCookie(&http.Cookie{Name: "ew_session", Value: token})
	}
	w := httptest.NewRecorder()
	a.handler().ServeHTTP(w, r)
	return w
}
func stateOf(w *httptest.ResponseRecorder) string {
	var v map[string]any
	json.Unmarshal(w.Body.Bytes(), &v)
	s, _ := v["state"].(string)
	return s
}
func TestCacheRealIsolationFreshness(t *testing.T) {
	a, tid, token := cacheFixture(t)
	c := a.views
	one := viewRequest(a, tid, token)
	two := viewRequest(a, tid, token)
	if one.Code != 200 || two.Header().Get("X-View-Cache") != "hit" || !bytes.Equal(one.Body.Bytes(), two.Body.Bytes()) {
		t.Fatalf("hit differs: %d %s", one.Code, two.Body.String())
	}
	if viewRequest(a, tid, "").Code != 401 || viewRequest(a, tid, "forged").Code != 401 {
		t.Fatal("anonymous/invalid token admitted")
	}
	b := identity.NewID()
	a.db.Exec(context.Background(), "INSERT INTO ew_accounts VALUES('b','b@test','unused');")
	a.db.Exec(context.Background(), "INSERT INTO ew_sessions VALUES($1,'b',now()+interval '1 hour')", evidence.Hash([]byte(b)))
	if viewRequest(a, tid, b).Code != 404 {
		t.Fatal("cross-account hit")
	}
	key := c.key("account", "task", tid, "")
	v, mode := c.lookup(context.Background(), key)
	if mode != "hit" {
		t.Fatal(mode)
	}
	for _, damage := range []string{"account", "schema", "body", "garbage"} {
		bad := v
		bad.Key += "-" + damage
		bad.MAC = c.signature(bad)
		raw, _ := json.Marshal(bad)
		if damage == "body" {
			bad = v
			bad.Body = []byte(`{"state":"forged"}`)
			raw, _ = json.Marshal(bad)
		}
		if damage == "garbage" {
			raw = []byte("broken")
		}
		c.redis(context.Background(), "SET", key, string(raw), "PX", "5000")
		w := viewRequest(a, tid, token)
		if w.Header().Get("X-View-Cache") != "miss" || stateOf(w) != "queued" {
			t.Fatal("invalid envelope trusted", damage)
		}
	}
	// Committed PG change without eviction must age out from the original sample.
	a.db.Exec(context.Background(), "UPDATE ew_tasks SET state='cancelled' WHERE id=$1", tid)
	if stateOf(viewRequest(a, tid, token)) != "queued" {
		t.Fatal("fixture not warm")
	}
	time.Sleep(5100 * time.Millisecond)
	if stateOf(viewRequest(a, tid, token)) != "cancelled" {
		t.Fatal("missed invalidation exceeded age bound")
	}
	// A signed expired envelope with artificially long Redis TTL cannot revive.
	old := v
	old.MAC = c.signature(old)
	raw, _ := json.Marshal(old)
	c.redis(context.Background(), "SET", key, string(raw), "PX", "60000")
	if stateOf(viewRequest(a, tid, token)) != "cancelled" {
		t.Fatal("long Redis TTL revives old view")
	}
	a.db.Exec(context.Background(), "DELETE FROM ew_sessions WHERE token_hash=$1", evidence.Hash([]byte(token)))
	if viewRequest(a, tid, token).Code != 401 {
		t.Fatal("logged-out session hit")
	}
	t.Log("real Redis hit, anonymous/A/B/logout, wrong binding/schema/MAC/corruption, missed invalidation and long-TTL expiry passed")
}
func TestCacheLateFillAndRestart(t *testing.T) {
	a, tid, token := cacheFixture(t)
	entered := make(chan struct{})
	release := make(chan struct{})
	var once sync.Once
	a.views.afterRead = func(ctx context.Context) {
		once.Do(func() {
			close(entered)
			select {
			case <-release:
			case <-ctx.Done():
			}
		})
	}
	done := make(chan *httptest.ResponseRecorder)
	go func() { done <- viewRequest(a, tid, token) }()
	<-entered
	a.db.Exec(context.Background(), "UPDATE ew_tasks SET state='cancelled' WHERE id=$1", tid)
	a.views.invalidate(context.Background())
	time.Sleep(700 * time.Millisecond)
	close(release)
	first := <-done
	if stateOf(first) != "queued" {
		t.Fatal("old read fixture")
	}
	a.views.afterRead = nil
	stale := viewRequest(a, tid, token)
	if stateOf(stale) != "queued" || stale.Header().Get("X-View-Cache") != "hit" {
		t.Fatal("late fill fixture")
	}
	time.Sleep(4500 * time.Millisecond)
	if stateOf(viewRequest(a, tid, token)) != "cancelled" {
		t.Fatal("late fill reset lifetime")
	}
	// New API identity never shares old time/signing state.
	a.views = newViewCache(a.views.cfg)
	if viewRequest(a, tid, token).Header().Get("X-View-Cache") != "miss" {
		t.Fatal("restart reused old clock")
	}
	a.views.brokenClock.Store(true)
	if viewRequest(a, tid, token).Code != 503 {
		t.Fatal("abnormal clock accepted")
	}
	t.Log("actual delayed old read after committed write/eviction did not renew age; API epoch and abnormal clock fail closed")
}
func TestCacheBoundedFallback(t *testing.T) {
	a, tid, token := cacheFixture(t)
	c := a.views
	c.cfg.Enabled = false
	entered := make(chan struct{}, 8)
	release := make(chan struct{})
	var actions atomic.Int64
	c.beforeRead = func(ctx context.Context) {
		entered <- struct{}{}
		select {
		case <-release:
		case <-ctx.Done():
		}
		if ctx.Err() == nil {
			actions.Add(1)
		}
	}
	var wg sync.WaitGroup
	out := make(chan int, 8)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); out <- viewRequest(a, tid, token).Code }()
	}
	for i := 0; i < 4; i++ {
		<-entered
	}
	for i := 0; i < 4; i++ {
		if viewRequest(a, tid, token).Code != 503 {
			t.Fatal("excess must reject")
		}
	}
	wg.Wait()
	close(out)
	for status := range out {
		if status != 503 {
			t.Fatal("timed-out barrier passed")
		}
	}
	if c.peak.Load() != 4 || c.live.Load() != 0 || actions.Load() != 0 {
		t.Fatal("slot leak or post-deadline action")
	}
	close(release)
	c.beforeRead = nil
	// Actual PG slow query, not a sleep mocked as SQL.
	c.beforeRead = func(ctx context.Context) {
		a.db.Exec(ctx, "SELECT pg_sleep(10)")
		if ctx.Err() == nil {
			actions.Add(1)
		}
	}
	start := time.Now()
	if viewRequest(a, tid, token).Code != 503 || time.Since(start) > 3*time.Second || actions.Load() != 0 {
		t.Fatal("PG deadline not effective")
	}
	c.beforeRead = nil
	c.beforeRead = func(ctx context.Context) { <-ctx.Done() }
	ctx, cancel := context.WithCancel(context.Background())
	r := httptest.NewRequest("GET", "http://fixture/api/tasks/"+tid, nil).WithContext(ctx)
	r.AddCookie(&http.Cookie{Name: "ew_session", Value: token})
	done := make(chan struct{})
	go func() { a.handler().ServeHTTP(httptest.NewRecorder(), r); close(done) }()
	time.Sleep(50 * time.Millisecond)
	cancel()
	<-done
	c.beforeRead = nil
	if c.live.Load() != 0 || viewRequest(a, tid, token).Code != 200 {
		t.Fatal("cancel leaked slots")
	}
	t.Log("8-query barrier peak=4, excess 503, two-second barrier/real PG sleep cancellation, HTTP cancellation, slot recovery passed")
}
func TestRedisDeadlineAndRecovery(t *testing.T) {
	a, tid, token := cacheFixture(t)
	c := a.views
	real := c.cfg.Address
	l, e := net.Listen("tcp", "127.0.0.1:0")
	if e != nil {
		t.Fatal(e)
	}
	defer l.Close()
	var accepted atomic.Int64
	var peers sync.WaitGroup
	acceptDone := make(chan struct{})
	go func() {
		defer close(acceptDone)
		for {
			conn, e := l.Accept()
			if e != nil {
				return
			}
			accepted.Add(1)
			peers.Add(1)
			go func() { defer peers.Done(); defer conn.Close(); io.Copy(io.Discard, conn) }()
		}
	}()
	c.cfg.Address = l.Addr().String()
	start := time.Now()
	w := viewRequest(a, tid, token)
	if w.Code != 200 || w.Header().Get("X-View-Cache") != "redis_error" || time.Since(start) > time.Second || accepted.Load() != 2 {
		t.Fatalf("timeout/retries %d %d", w.Code, accepted.Load())
	}
	l.Close()
	<-acceptDone
	peers.Wait()
	// exactly GET then optional SET, each bounded; closed port fallback.
	l.Close()
	if viewRequest(a, tid, token).Code != 200 {
		t.Fatal("closed Redis blocked PG")
	}
	c.cfg.Address = real
	viewRequest(a, tid, token)
	if viewRequest(a, tid, token).Header().Get("X-View-Cache") != "hit" {
		t.Fatal("Redis recovery not hit")
	}
	t.Log("hanging Redis sockets: exactly 2 attempts (GET/SET), deadline closes each; disconnect and restored real Redis passed")
}
func TestCachePublicAndConfiguration(t *testing.T) {
	for _, name := range []string{"WEB_CACHE_TTL", "WEB_REDIS_TIMEOUT", "WEB_PROJECTION_TIMEOUT", "WEB_PROJECTION_SLOTS", "WEB_CACHE"} {
		t.Run(name, func(t *testing.T) {
			t.Setenv(name, "0")
			if name == "WEB_CACHE" {
				t.Setenv(name, "invalid")
			}
			if _, e := testCacheConfig(); e == nil {
				t.Fatal("invalid configuration accepted")
			}
		})
	}
	b, _ := json.Marshal(publicView(map[string]any{"result": map[string]any{"artifacts": map[string]any{"details.csv": map[string]any{"base64": "PRIVATE-FILE", "sha256": "hash"}}}}))
	if strings.Contains(string(b), "PRIVATE-FILE") || !strings.Contains(string(b), "sha256") {
		t.Fatal("public file projection")
	}
	fmt.Println("public projection keeps artifact metadata, excludes file bodies")
}

func TestCacheControlUsesPG(t *testing.T) {
	a, tid, token := cacheFixture(t)
	if stateOf(viewRequest(a, tid, token)) != "queued" {
		t.Fatal("warm fixture")
	}
	a.db.Exec(context.Background(), "UPDATE ew_tasks SET state='completed',cleanup_confirmed=true WHERE id=$1", tid)
	if stateOf(viewRequest(a, tid, token)) != "queued" {
		t.Fatal("stale fixture")
	}
	request := func(action string) *httptest.ResponseRecorder {
		question := "replacement"
		if action == "cancel" {
			question = ""
		}
		r := httptest.NewRequest("POST", "http://fixture/api/conversations/conversation/tasks/"+tid+"/"+action, strings.NewReader(`{"requestId":"`+identity.NewID()+`","question":"`+question+`"}`))
		r.Header.Set("Origin", "http://fixture")
		r.AddCookie(&http.Cookie{Name: "ew_session", Value: token})
		w := httptest.NewRecorder()
		a.handler().ServeHTTP(w, r)
		return w
	}
	if request("replace").Code != 409 {
		t.Fatal("stale queued view authorized replacement")
	}
	// Broken Redis eviction cannot turn committed cancellation into failure.
	a.db.Exec(context.Background(), "UPDATE ew_tasks SET state='queued' WHERE id=$1", tid)
	a.views.cfg.Address = "127.0.0.1:1"
	w := request("cancel")
	if w.Code != 200 || !strings.Contains(w.Body.String(), "cancelled") {
		t.Fatal("committed cancel misreported", w.Body.String())
	}
	var state string
	a.db.QueryRow(context.Background(), "SELECT state FROM ew_tasks WHERE id=$1", tid).Scan(&state)
	if state != "cancelled" {
		t.Fatal("PG intent missing")
	}
	t.Log("cached queued state could not replace PG-completed task; successful PG cancel survives Redis invalidation failure")
}

func TestCacheCrashChild(t *testing.T) {
	if os.Getenv("WEB113_CHILD") != "1" {
		t.Skip("subprocess only")
	}
	cfg, e := pgxpool.ParseConfig(os.Getenv("WEB113_CHILD_DSN"))
	if e != nil {
		t.Fatal(e)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = os.Getenv("WEB113_CHILD_SCHEMA")
	cfg.ConnConfig.Tracer = querylog.QueryTracer{}
	cfg.MaxConns = 8
	db, e := pgxpool.NewWithConfig(context.Background(), cfg)
	if e != nil {
		t.Fatal(e)
	}
	c := newViewCache(config.Cache{Enabled: true, Address: os.Getenv("WEB113_TEST_REDIS"), Namespace: "web113-crash", TTL: 5 * time.Second, RedisTimeout: 100 * time.Millisecond, PGTimeout: 2 * time.Second, Slots: 4})
	if os.Getenv("WEB113_CHILD_HOLD") == "1" {
		c.afterCommit = func(context.Context) {
			os.WriteFile(os.Getenv("WEB113_CHILD_MARK")+".committed", []byte("PG committed, before eviction"), 0600)
			select {}
		}
	}
	a := &fixtureApp{db: db, app: &app{identity: identity.New(db), commands: tasks.New(db, nil), queries: taskview.New(db), bundles: bundles.New(db), views: c}}
	server := httptest.NewServer(a.handler())
	a.origin = server.URL
	os.WriteFile(os.Getenv("WEB113_CHILD_MARK"), []byte(server.URL), 0600)
	select {}
}
func TestCacheCommittedProcessCrash(t *testing.T) {
	a, tid, token := cacheFixture(t)
	exe, e := os.Executable()
	if e != nil {
		t.Fatal(e)
	}
	start := func(hold bool) (*exec.Cmd, string, string) {
		mark := filepath.Join(t.TempDir(), "ready")
		cmd := exec.Command(exe, "-test.run=^TestCacheCrashChild$")
		value := "0"
		if hold {
			value = "1"
		}
		cmd.Env = append(os.Environ(), "WEB113_CHILD=1", "WEB113_CHILD_DSN="+os.Getenv("WEB112_TEST_DATABASE_URL"), "WEB113_CHILD_SCHEMA="+a.db.Config().ConnConfig.RuntimeParams["search_path"], "WEB113_CHILD_MARK="+mark, "WEB113_CHILD_HOLD="+value)
		if e := cmd.Start(); e != nil {
			t.Fatal(e)
		}
		t.Cleanup(func() { cmd.Process.Kill(); cmd.Wait() })
		for i := 0; i < 200; i++ {
			if b, e := os.ReadFile(mark); e == nil {
				return cmd, string(b), mark
			}
			time.Sleep(10 * time.Millisecond)
		}
		t.Fatal("child startup timeout")
		return nil, "", ""
	}
	request := func(url, method, path string) *http.Response {
		r, _ := http.NewRequest(method, url+path, strings.NewReader(`{"requestId":"crash-control","question":""}`))
		r.Header.Set("Origin", url)
		r.AddCookie(&http.Cookie{Name: "ew_session", Value: token})
		resp, _ := (&http.Client{Timeout: 5 * time.Second}).Do(r)
		return resp
	}
	child, url, mark := start(true)
	for i := 0; i < 2; i++ {
		r := request(url, "GET", "/api/tasks/"+tid)
		if r == nil || r.StatusCode != 200 {
			t.Fatal("warm child")
		}
		io.Copy(io.Discard, r.Body)
		r.Body.Close()
	}
	done := make(chan struct{})
	go func() {
		r := request(url, "POST", "/api/conversations/conversation/tasks/"+tid+"/cancel")
		if r != nil {
			r.Body.Close()
		}
		close(done)
	}()
	found := false
	for i := 0; i < 200; i++ {
		if _, e := os.Stat(mark + ".committed"); e == nil {
			found = true
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if !found {
		t.Fatal("commit barrier not reached")
	}
	child.Process.Kill()
	child.Wait()
	<-done
	var state string
	a.db.QueryRow(context.Background(), "SELECT state FROM ew_tasks WHERE id=$1", tid).Scan(&state)
	if state != "cancelled" {
		t.Fatal("PG commit lost")
	}
	_, next, _ := start(false)
	r := request(next, "GET", "/api/tasks/"+tid)
	if r == nil {
		t.Fatal("restart missing")
	}
	defer r.Body.Close()
	body, _ := io.ReadAll(r.Body)
	if r.Header.Get("X-View-Cache") != "miss" || !strings.Contains(string(body), `"state":"cancelled"`) {
		t.Fatal("restart returned stale pre-crash value")
	}
	t.Log("real API child SIGKILL at PG-commit/pre-eviction barrier; warm Redis retained, restarted API returned committed PG cancellation")
}

func TestRealRedisPauseEightQueries(t *testing.T) {
	a, tid, token := cacheFixture(t)
	c := a.views
	if _, e := c.redis(context.Background(), "CLIENT", "PAUSE", "800", "ALL"); e != nil {
		t.Fatal(e)
	}
	entered := make(chan struct{}, 4)
	c.beforeRead = func(ctx context.Context) { entered <- struct{}{}; <-ctx.Done() }
	var wg sync.WaitGroup
	results := make(chan int, 4)
	for i := 0; i < 4; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); results <- viewRequest(a, tid, token).Code }()
	}
	for i := 0; i < 4; i++ {
		<-entered
	}
	var excess sync.WaitGroup
	for i := 0; i < 4; i++ {
		excess.Add(1)
		go func() {
			defer excess.Done()
			if w := viewRequest(a, tid, token); w.Code != 503 || w.Header().Get("X-View-Cache") != "redis_error" {
				t.Errorf("real paused Redis excess: %d %s", w.Code, w.Header().Get("X-View-Cache"))
			}
		}()
	}
	excess.Wait()
	wg.Wait()
	close(results)
	for code := range results {
		if code != 503 {
			t.Fatal("PG barrier timeout")
		}
	}
	c.beforeRead = nil
	if c.live.Load() != 0 || c.peak.Load() != 4 {
		t.Fatal("pause slot bound")
	}
	viewRequest(a, tid, token)
	if viewRequest(a, tid, token).Header().Get("X-View-Cache") != "hit" {
		t.Fatal("real Redis recovery")
	}
	t.Log("real Redis CLIENT PAUSE; eight concurrent queries, four PG slots, four excess 503, deadline release and recovered hit")
}

func TestCacheCompleteJSONEnvelope(t *testing.T) {
	for _, tc := range []struct {
		name, suffix string
		hit          bool
	}{
		{"no_suffix", "", true},
		{"legal_whitespace", " \t\r\n", true},
		{"illegal_suffix", "\nTHIS_IS_NOT_JSON", false},
		{"second_object", "\n{}", false},
		{"second_scalar", "\nnull", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			a, tid, token := cacheFixture(t)
			original := viewRequest(a, tid, token)
			if original.Code != 200 {
				t.Fatal("initial projection failed")
			}
			key := a.views.key("account", "task", tid, "")
			raw, err := a.views.redis(context.Background(), "GET", key)
			if err != nil || len(raw) == 0 {
				t.Fatal("real Redis fixture missing", err)
			}
			if _, err = a.views.redis(context.Background(), "SET", key, string(raw)+tc.suffix, "PX", "5000"); err != nil {
				t.Fatal(err)
			}
			// Change PG without eviction: a hit returns the old signed value; a miss
			// must actually read and return the new authoritative projection.
			if _, err = a.db.Exec(context.Background(), "UPDATE ew_tasks SET state='cancelled' WHERE id=$1", tid); err != nil {
				t.Fatal(err)
			}
			got := viewRequest(a, tid, token)
			wantMode, wantState := "miss", "cancelled"
			if tc.hit {
				wantMode, wantState = "hit", "queued"
			}
			t.Logf("status=%d cache=%s state=%s", got.Code, got.Header().Get("X-View-Cache"), stateOf(got))
			if got.Code != 200 || got.Header().Get("X-View-Cache") != wantMode || stateOf(got) != wantState {
				t.Fatalf("want %s/%s", wantMode, wantState)
			}
		})
	}
}
