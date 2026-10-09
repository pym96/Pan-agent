package main

import (
	"context"
	"crypto/rand"
	"embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

//go:embed migrations/*.sql
var migrations embed.FS

type app struct {
	db     *pgxpool.Pool
	origin string
	secure bool
	web    string
}

func id() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic("randomness unavailable")
	}
	return hex.EncodeToString(b)
}
func send(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, msg string) {
	send(w, status, map[string]string{"error": msg})
}
func (a *app) owner(w http.ResponseWriter, r *http.Request) string {
	c, e := r.Cookie("ew_session")
	if e != nil {
		fail(w, 401, "请先登录")
		return ""
	}
	var owner string
	e = a.db.QueryRow(r.Context(), "SELECT account_id FROM ew_sessions WHERE token_hash=$1 AND expires_at>now()", hash([]byte(c.Value))).Scan(&owner)
	if e != nil {
		if !errors.Is(e, pgx.ErrNoRows) {
			fail(w, 503, "服务暂不可用")
		} else {
			fail(w, 401, "会话已失效")
		}
		return ""
	}
	return owner
}
func (a *app) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if e := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&in); e != nil || len(in.Password) > 72 {
		fail(w, 400, "登录输入无效")
		return
	}
	var uid, pw string
	e := a.db.QueryRow(r.Context(), "SELECT id,password_hash FROM ew_accounts WHERE email=$1", strings.ToLower(strings.TrimSpace(in.Email))).Scan(&uid, &pw)
	if e != nil || bcrypt.CompareHashAndPassword([]byte(pw), []byte(in.Password)) != nil {
		fail(w, 401, "账号或密码错误")
		return
	}
	token := id()
	_, e = a.db.Exec(r.Context(), "INSERT INTO ew_sessions(token_hash,account_id,expires_at) VALUES($1,$2,$3)", hash([]byte(token)), uid, time.Now().Add(12*time.Hour))
	if e != nil {
		fail(w, 503, "无法创建会话")
		return
	}
	http.SetCookie(w, &http.Cookie{Name: "ew_session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: a.secure, MaxAge: 43200})
	send(w, 200, map[string]string{"email": in.Email})
}
func (a *app) logout(w http.ResponseWriter, r *http.Request) {
	if c, e := r.Cookie("ew_session"); e == nil {
		_, _ = a.db.Exec(r.Context(), "DELETE FROM ew_sessions WHERE token_hash=$1", hash([]byte(c.Value)))
	}
	http.SetCookie(w, &http.Cookie{Name: "ew_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: a.secure})
	send(w, 200, map[string]bool{"ok": true})
}
func (a *app) upload(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload)
	reader, e := r.MultipartReader()
	if e != nil {
		fail(w, 400, "需要 multipart manifest/files")
		return
	}
	files := map[string][]byte{}
	var manifest []byte
	parts := 0
	for {
		p, e := reader.NextPart()
		if e == io.EOF {
			break
		}
		if e != nil {
			fail(w, 400, "上传无效或超过16MiB")
			return
		}
		parts++
		if parts > 33 {
			fail(w, 400, "文件数超过32个附件及manifest")
			return
		}
		// Parse raw filename ourselves: multipart.FileName strips directory components.
		_, params, e := mime.ParseMediaType(p.Header.Get("Content-Disposition"))
		name := params["filename"]
		if e != nil || !validName(name) {
			fail(w, 400, "文件名不安全；仅允许简单文件名，不能包含路径")
			return
		}
		data, e := io.ReadAll(p)
		if e != nil {
			fail(w, 400, "上传无效或超过16MiB")
			return
		}
		if name == "manifest.json" {
			if manifest != nil {
				fail(w, 400, "manifest.json: duplicate file")
				return
			}
			manifest = data
		} else {
			if _, ok := files[name]; ok {
				fail(w, 400, "duplicate file: "+name)
				return
			}
			files[name] = data
		}
	}
	if manifest == nil {
		fail(w, 400, "manifest.json: missing required file")
		return
	}
	m, o, e := parseBundle(manifest, files)
	if e != nil {
		fail(w, 400, e.Error())
		return
	}
	overview, _ := json.Marshal(o)
	bundle := id()
	tx, e := a.db.Begin(r.Context())
	if e != nil {
		fail(w, 503, "导入存储暂不可用")
		return
	}
	defer tx.Rollback(r.Context())
	_, e = tx.Exec(r.Context(), "INSERT INTO ew_bundles(id,account_id,title,summary_name,parser_version,overview) VALUES($1,$2,$3,$4,$5,$6)", bundle, owner, m.Title, m.Summary, parserVersion, overview)
	if e == nil {
		files["manifest.json"] = manifest
		for name, data := range files {
			_, e = tx.Exec(r.Context(), "INSERT INTO ew_files(bundle_id,name,sha256,content) VALUES($1,$2,$3,$4)", bundle, name, hash(data), data)
			if e != nil {
				break
			}
		}
	}
	if e != nil {
		fail(w, 503, "导入未保存，请稍后再试")
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		fail(w, 503, "导入状态未确认，请检查列表")
		return
	}
	send(w, 201, map[string]string{"id": bundle})
}
func (a *app) list(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	rows, e := a.db.Query(r.Context(), "SELECT id,title,created_at FROM ew_bundles WHERE account_id=$1 ORDER BY created_at DESC", owner)
	if e != nil {
		fail(w, 503, "无法读取列表")
		return
	}
	defer rows.Close()
	out := []any{}
	for rows.Next() {
		var id, title string
		var created time.Time
		if e = rows.Scan(&id, &title, &created); e != nil {
			fail(w, 503, "无法读取列表")
			return
		}
		out = append(out, map[string]any{"id": id, "title": title, "createdAt": created})
	}
	if rows.Err() != nil {
		fail(w, 503, "无法读取列表")
		return
	}
	send(w, 200, out)
}
func (a *app) detail(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	var title, summary, parser string
	var overview json.RawMessage
	e := a.db.QueryRow(r.Context(), "SELECT title,summary_name,parser_version,overview FROM ew_bundles WHERE id=$1 AND account_id=$2", r.PathValue("id"), owner).Scan(&title, &summary, &parser, &overview)
	if e != nil {
		fail(w, 404, "证据包不存在")
		return
	}
	rows, e := a.db.Query(r.Context(), "SELECT name,sha256,octet_length(content) FROM ew_files WHERE bundle_id=$1 ORDER BY name", r.PathValue("id"))
	if e != nil {
		fail(w, 503, "无法读取文件列表")
		return
	}
	defer rows.Close()
	files := []any{}
	for rows.Next() {
		var name, h string
		var size int
		if e = rows.Scan(&name, &h, &size); e != nil {
			fail(w, 503, "无法读取文件列表")
			return
		}
		files = append(files, map[string]any{"name": name, "sha256": h, "bytes": size})
	}
	if rows.Err() != nil {
		fail(w, 503, "无法读取文件列表")
		return
	}
	send(w, 200, map[string]any{"id": r.PathValue("id"), "title": title, "summary": summary, "parser": parser, "overview": overview, "files": files})
}
func (a *app) file(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	var b []byte
	var h string
	name := r.PathValue("name")
	e := a.db.QueryRow(r.Context(), "SELECT f.content,f.sha256 FROM ew_files f JOIN ew_bundles b ON b.id=f.bundle_id WHERE b.id=$1 AND b.account_id=$2 AND f.name=$3", r.PathValue("id"), owner, name).Scan(&b, &h)
	if e != nil {
		fail(w, 404, "文件不存在")
		return
	}
	if r.URL.Query().Has("pointer") {
		v, e := pointerValue(b, r.URL.Query().Get("pointer"))
		if e != nil {
			fail(w, 400, e.Error())
			return
		}
		send(w, 200, map[string]any{"file": name, "sha256": h, "pointer": r.URL.Query().Get("pointer"), "value": v, "label": "导入报告记录；未重新验证原始运行"})
		return
	}
	if r.URL.Query().Has("preview") {
		if len(b) > 1<<20 {
			fail(w, 400, "文件过大，请下载查看")
			return
		}
		send(w, 200, map[string]any{"file": name, "sha256": h, "text": string(b)})
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": name}))
	w.Header().Set("X-Content-SHA256", h)
	_, _ = w.Write(b)
}
func (a *app) handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/login", a.login)
	mux.HandleFunc("POST /api/logout", a.logout)
	mux.HandleFunc("GET /api/me", func(w http.ResponseWriter, r *http.Request) {
		if owner := a.owner(w, r); owner != "" {
			send(w, 200, map[string]string{"id": owner})
		}
	})
	mux.HandleFunc("GET /api/bundles", a.list)
	mux.HandleFunc("POST /api/bundles", a.upload)
	mux.HandleFunc("GET /api/bundles/{id}", a.detail)
	mux.HandleFunc("GET /api/bundles/{id}/files/{name}", a.file)
	mux.Handle("GET /", http.FileServer(http.Dir(a.web)))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
		if r.Method != "GET" && r.Method != "HEAD" {
			if r.Header.Get("Origin") != a.origin {
				fail(w, 403, "来源校验失败")
				return
			}
		}
		mux.ServeHTTP(w, r)
	})
}
func run() error {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		return fmt.Errorf("DATABASE_URL is required")
	}
	ctx := context.Background()
	cfg, e := pgxpool.ParseConfig(dsn)
	if e != nil {
		return fmt.Errorf("DATABASE_URL configuration invalid")
	}
	cfg.MaxConns = 4
	db, e := pgxpool.NewWithConfig(ctx, cfg)
	if e != nil {
		return fmt.Errorf("database configuration invalid")
	}
	defer db.Close()
	ping, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	if db.Ping(ping) != nil {
		return fmt.Errorf("database unavailable")
	}
	sql, _ := migrations.ReadFile("migrations/001.sql")
	if _, e = db.Exec(ctx, string(sql)); e != nil {
		return fmt.Errorf("database migration failed")
	}
	if len(os.Args) > 1 && os.Args[1] == "account" {
		email := strings.ToLower(strings.TrimSpace(os.Getenv("ACCOUNT_EMAIL")))
		pw := os.Getenv("ACCOUNT_PASSWORD")
		if !strings.Contains(email, "@") || len(pw) < 12 || len(pw) > 72 {
			return fmt.Errorf("ACCOUNT_EMAIL and ACCOUNT_PASSWORD (12-72 bytes) required")
		}
		h, e := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
		if e != nil {
			return fmt.Errorf("password hashing failed")
		}
		_, e = db.Exec(ctx, "INSERT INTO ew_accounts(id,email,password_hash) VALUES($1,$2,$3)", id(), email, string(h))
		if e != nil {
			return fmt.Errorf("account creation failed (account may already exist)")
		}
		fmt.Println("invited account created")
		return nil
	}
	addr := os.Getenv("LISTEN_ADDR")
	if addr == "" {
		addr = "127.0.0.1:8106"
	}
	origin := os.Getenv("APP_ORIGIN")
	if origin == "" {
		origin = "http://" + addr
	}
	u, e := url.Parse(origin)
	if e != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return fmt.Errorf("APP_ORIGIN invalid")
	}
	web := os.Getenv("WEB_DIR")
	if web == "" {
		web = "web/dist"
	}
	a := &app{db: db, origin: origin, secure: u.Scheme == "https", web: web}
	s := &http.Server{Addr: addr, Handler: a.handler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 30 * time.Second, WriteTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 1 << 16}
	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(done)
	go func() {
		<-done
		c, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = s.Shutdown(c)
	}()
	log.Print("evidence-web listening on ", addr)
	e = s.ListenAndServe()
	if errors.Is(e, http.ErrServerClosed) {
		return nil
	}
	return fmt.Errorf("HTTP listener failed")
}
func main() {
	if e := run(); e != nil {
		log.Print(e)
		os.Exit(1)
	}
}
