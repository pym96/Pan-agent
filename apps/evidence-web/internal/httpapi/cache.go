package httpapi

import (
	"bufio"
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"pan-agent/evidence-web/internal/config"
	"pan-agent/evidence-web/internal/evidence"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/querylog"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

type viewCache struct {
	cfg                                config.Cache
	epoch, secret                      string
	start                              time.Time
	slots                              chan struct{}
	live, peak                         atomic.Int64
	brokenClock                        atomic.Bool
	beforeRead, afterRead, afterCommit func(context.Context)
	mu                                 sync.Mutex
	keys                               map[string]bool
}

func newViewCache(c config.Cache) *viewCache {
	return &viewCache{cfg: c, epoch: identity.NewID(), secret: identity.NewID(), start: time.Now(), slots: make(chan struct{}, c.Slots), keys: map[string]bool{}}
}

type viewEnvelope struct {
	Key    string          `json:"key"`
	Epoch  string          `json:"epoch"`
	Sample int64           `json:"sample"`
	Wall   int64           `json:"wall"`
	Body   json.RawMessage `json:"body"`
	MAC    string          `json:"mac"`
}

func (c *viewCache) signature(e viewEnvelope) string {
	e.MAC = ""
	b, _ := json.Marshal(e)
	h := hmac.New(sha256.New, []byte(c.secret))
	h.Write(b)
	return hex.EncodeToString(h.Sum(nil))
}
func (c *viewCache) stamp() (int64, int64, bool) {
	now := time.Now()
	mono := now.Sub(c.start)
	wall := now.UnixNano() - c.start.UnixNano()
	drift := wall - int64(mono)
	if drift > int64(100*time.Millisecond) || drift < -int64(100*time.Millisecond) {
		c.brokenClock.Store(true)
	}
	return int64(mono), now.UnixNano(), !c.brokenClock.Load()
}
func (c *viewCache) age(e viewEnvelope) (time.Duration, bool) {
	mono, wall, ok := c.stamp()
	m, w := mono-e.Sample, wall-e.Wall
	if !ok || m < 0 || w < 0 {
		return 0, false
	}
	if w > m {
		m = w
	}
	return time.Duration(m), time.Duration(m) < c.cfg.TTL
}
func (c *viewCache) key(owner, kind, obj, query string) string {
	return c.cfg.Namespace + ":" + c.epoch + ":public-v1:" + owner + ":" + kind + ":" + obj + ":" + evidence.Hash([]byte(query))
}

// One connection and one command, no pool wait/reconnect/retry. Deadline covers
// dial + write + bounded RESP read. Context cancellation closes the connection.
func (c *viewCache) redis(ctx context.Context, args ...string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, c.cfg.RedisTimeout)
	defer cancel()
	conn, e := (&net.Dialer{}).DialContext(ctx, "tcp", c.cfg.Address)
	if e != nil {
		return nil, e
	}
	defer conn.Close()
	stop := context.AfterFunc(ctx, func() { conn.Close() })
	defer stop()
	deadline, _ := ctx.Deadline()
	conn.SetDeadline(deadline)
	if e = ctx.Err(); e != nil {
		return nil, e
	}
	var b bytes.Buffer
	fmt.Fprintf(&b, "*%d\r\n", len(args))
	for _, arg := range args {
		fmt.Fprintf(&b, "$%d\r\n%s\r\n", len(arg), arg)
	}
	if _, e = io.Copy(conn, &b); e != nil {
		return nil, e
	}
	r := bufio.NewReader(io.LimitReader(conn, 8<<20))
	line, e := r.ReadString('\n')
	if e != nil {
		return nil, e
	}
	if len(line) > 128 {
		return nil, errors.New("invalid Redis header")
	}
	if strings.HasPrefix(line, "+") {
		return []byte(strings.TrimSuffix(line[1:], "\r\n")), ctx.Err()
	}
	if strings.HasPrefix(line, ":") {
		return []byte(strings.TrimSpace(line[1:])), ctx.Err()
	}
	if !strings.HasPrefix(line, "$") {
		return nil, errors.New("Redis rejected operation")
	}
	n, e := strconv.Atoi(strings.TrimSpace(line[1:]))
	if e != nil || n < -1 || n > 4<<20 {
		return nil, errors.New("invalid Redis length")
	}
	if n == -1 {
		return nil, nil
	}
	out := make([]byte, n+2)
	_, e = io.ReadFull(r, out)
	if e != nil || string(out[n:]) != "\r\n" {
		return nil, errors.New("invalid Redis body")
	}
	return out[:n], ctx.Err()
}
func (c *viewCache) lookup(ctx context.Context, key string) (viewEnvelope, string) {
	var v viewEnvelope
	b, e := c.redis(ctx, "GET", key)
	if e != nil {
		return v, "redis_error"
	}
	if len(b) == 0 {
		return v, "miss"
	}
	d := json.NewDecoder(bytes.NewReader(b))
	d.DisallowUnknownFields()
	if d.Decode(&v) != nil || v.Key != key || v.Epoch != c.epoch || !hmac.Equal([]byte(v.MAC), []byte(c.signature(v))) {
		return viewEnvelope{}, "miss"
	}
	// Decode accepts a stream prefix. The cache contract requires exactly one
	// complete envelope, with only JSON whitespace after it.
	var extra any
	if d.Decode(&extra) != io.EOF {
		return viewEnvelope{}, "miss"
	}
	if _, ok := c.age(v); !ok {
		return viewEnvelope{}, "miss"
	}
	return v, "hit"
}
func (c *viewCache) fill(ctx context.Context, v viewEnvelope) {
	age, ok := c.age(v)
	if !ok || ctx.Err() != nil {
		return
	}
	ttl := (c.cfg.TTL - age).Milliseconds()
	if ttl < 1 {
		return
	}
	v.MAC = c.signature(v)
	b, e := json.Marshal(v)
	if e == nil && len(b) < 4<<20 {
		_, e = c.redis(ctx, "SET", v.Key, string(b), "PX", strconv.FormatInt(ttl, 10))
		if e != nil {
			log.Print("cache fill unavailable")
		}
	}
}

// Keep file metadata/download links, never the embedded file bodies. Apply to
// both modes and every nested attempt. Private checkpoint state is never here.
func publicView(v any) any {
	switch x := v.(type) {
	case map[string]any:
		out := map[string]any{}
		for k, v := range x {
			if k == "base64" {
				continue
			}
			out[k] = publicView(v)
		}
		return out
	case []any:
		for i := range x {
			x[i] = publicView(x[i])
		}
		return x
	}
	return v
}
func (a *viewHandler) cachedView(kind string, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		c := a.views
		if c == nil {
			next(w, r)
			return
		}
		authCtx, auth := querylog.Audited(r.Context(), "authentication")
		owner := a.owner(w, r.WithContext(authCtx))
		if owner == "" {
			return
		}
		ownCtx, own := querylog.Audited(r.Context(), "ownership")
		ctx, cancel := context.WithTimeout(ownCtx, c.cfg.PGTimeout)
		allowed, e := a.queries.Allowed(ctx, owner, kind, r.PathValue("id"))
		cancel()
		if e != nil {
			fail(w, 503, "归属校验暂不可用")
			return
		}
		if !allowed {
			fail(w, 404, "对象不存在")
			return
		}
		key := c.key(owner, kind, r.PathValue("id"), r.URL.Query().Encode())
		c.mu.Lock()
		if len(c.keys) < 1024 {
			c.keys[key] = true
		}
		c.mu.Unlock()
		mode := "bypass"
		var v viewEnvelope
		defer func() {
			log.Printf("view-query auth=%d ownership=%d mode=%s", auth.Count.Load(), own.Count.Load(), mode)
		}()
		if c.cfg.Enabled {
			v, mode = c.lookup(r.Context(), key)
			if mode == "hit" {
				if age, ok := c.age(v); ok && r.Context().Err() == nil {
					w.Header().Set("X-View-Cache", mode)
					w.Header().Set("X-View-Age-Ms", strconv.FormatInt(age.Milliseconds(), 10))
					w.Header().Set("Content-Type", "application/json")
					w.Write(v.Body)
					return
				}
				mode = "miss"
			}
		}
		w.Header().Set("X-View-Cache", mode)
		select {
		case c.slots <- struct{}{}:
			defer func() { c.live.Add(-1); <-c.slots }()
		default:
			fail(w, 503, "公开查询繁忙，请稍后重试")
			return
		}
		n := c.live.Add(1)
		for p := c.peak.Load(); n > p; p = c.peak.Load() {
			if c.peak.CompareAndSwap(p, n) {
				break
			}
		}
		pctx, pcancel := context.WithTimeout(r.Context(), c.cfg.PGTimeout)
		defer pcancel()
		pctx, projection := querylog.Audited(pctx, "projection")
		pctx = context.WithValue(pctx, validatedViewOwner{}, owner)
		if c.beforeRead != nil {
			c.beforeRead(pctx)
		}
		if pctx.Err() != nil {
			fail(w, 503, "公开查询已超时或取消")
			return
		}
		v.Sample, v.Wall, _ = c.stamp()
		v.Key = key
		v.Epoch = c.epoch
		recorder := httptest.NewRecorder()
		next(recorder, r.WithContext(pctx))
		log.Printf("view-projection sql=%d live=%d peak=%d failed=%t", projection.Count.Load(), n, c.peak.Load(), projection.Failed.Load())
		if pctx.Err() != nil || projection.Failed.Load() {
			fail(w, 503, "公开查询暂不可用")
			return
		}
		if recorder.Code != 200 {
			w.WriteHeader(recorder.Code)
			w.Write(recorder.Body.Bytes())
			return
		}
		var body any
		if json.Unmarshal(recorder.Body.Bytes(), &body) != nil {
			fail(w, 503, "公开投影无效")
			return
		}
		v.Body, e = json.Marshal(publicView(body))
		if e != nil {
			fail(w, 503, "公开投影无效")
			return
		}
		if c.afterRead != nil {
			c.afterRead(pctx)
		}
		if pctx.Err() != nil {
			fail(w, 503, "公开查询已超时或取消")
			return
		}
		if _, ok := c.age(v); !ok {
			fail(w, 503, "公开查询快照已过期或时钟异常")
			return
		}
		// Select the authoritative response before optional best-effort fill. The
		// captured age includes all snapshot/serialization work, never SET time.
		w.Header().Set("Content-Type", "application/json")
		w.Write(v.Body)
		if c.cfg.Enabled {
			c.fill(r.Context(), v)
		}
	}
}

// A committed HTTP mutation is never reported failed because cache eviction
// failed. Worker writes have no Redis dependency and rely on the age bound.
// The bounded index is an optimization, not the freshness or authority oracle.
func (c *viewCache) invalidate(ctx context.Context) {
	if !c.cfg.Enabled {
		return
	}
	c.mu.Lock()
	args := []string{"DEL"}
	for k := range c.keys {
		args = append(args, k)
	}
	c.keys = map[string]bool{}
	c.mu.Unlock()
	if len(args) > 1 {
		if _, e := c.redis(ctx, args...); e != nil {
			log.Print("cache invalidation unavailable; PG commit retained")
		}
	}
}
