package httpapi

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"net/http/httptest"
	"pan-agent/evidence-web/internal/bundles"
	"pan-agent/evidence-web/internal/config"
	"pan-agent/evidence-web/internal/evidence"
	"pan-agent/evidence-web/internal/identity"
	"pan-agent/evidence-web/internal/result"
	"pan-agent/evidence-web/internal/tasks"
	"pan-agent/evidence-web/internal/taskview"
	"time"

	"github.com/jackc/pgx/v5"
)

type app struct {
	identity *identity.Store
	commands *tasks.Store
	queries  *taskview.Reader
	bundles  *bundles.Store
	views    *viewCache
	origin   string
	secure   bool
	web      string
}

func New(c config.Config, ids *identity.Store, commands *tasks.Store, queries *taskview.Reader, b *bundles.Store) http.Handler {
	return (&app{identity: ids, commands: commands, queries: queries, bundles: b, views: newViewCache(c.Cache), origin: c.Origin, secure: c.Secure, web: c.Web}).handler()
}

type validatedViewOwner struct{}

// Read routes/cache receive only session lookup and a read-only projection module.
// They cannot call a task lifecycle operation through their receiver or constructor.
type sessionReader interface {
	Owner(context.Context, string) (string, error)
}
type viewHandler struct {
	identity sessionReader
	queries  *taskview.Reader
	views    *viewCache
}

func send(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, msg string) {
	send(w, status, map[string]string{"error": msg})
}
func authenticate(ids sessionReader, w http.ResponseWriter, r *http.Request) string {
	if owner, ok := r.Context().Value(validatedViewOwner{}).(string); ok {
		return owner
	}
	c, e := r.Cookie("ew_session")
	if e != nil {
		fail(w, 401, "请先登录")
		return ""
	}
	var owner string
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	e = func() error { var err error; owner, err = ids.Owner(ctx, c.Value); return err }()
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
func (a *app) owner(w http.ResponseWriter, r *http.Request) string {
	return authenticate(a.identity, w, r)
}
func (a *viewHandler) owner(w http.ResponseWriter, r *http.Request) string {
	return authenticate(a.identity, w, r)
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
	token, status := a.identity.Login(r.Context(), in.Email, in.Password)
	if status == result.Unauthenticated {
		fail(w, 401, "账号或密码错误")
		return
	}
	if status == result.Unavailable {
		fail(w, 503, "无法创建会话")
		return
	}

	http.SetCookie(w, &http.Cookie{Name: "ew_session", Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: a.secure, MaxAge: 43200})
	send(w, 200, map[string]string{"email": in.Email})
}
func (a *app) logout(w http.ResponseWriter, r *http.Request) {
	if c, e := r.Cookie("ew_session"); e == nil {
		a.identity.Logout(r.Context(), c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: "ew_session", Value: "", Path: "/", MaxAge: -1, HttpOnly: true, SameSite: http.SameSiteStrictMode, Secure: a.secure})
	send(w, 200, map[string]bool{"ok": true})
}
func (a *app) upload(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, evidence.MaxUpload)
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
		if e != nil || !evidence.ValidName(name) {
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
	respond(w, a.bundles.Import(r.Context(), owner, manifest, files))
}
func (a *viewHandler) list(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	v := a.queries.BundleList(r.Context(), owner)
	respond(w, v)
}
func (a *viewHandler) detail(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	v := a.queries.BundleDetail(r.Context(), owner, r.PathValue("id"))
	respond(w, v)
}
func (a *viewHandler) file(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	v := a.queries.BundleFile(r.Context(), owner, r.PathValue("id"), r.PathValue("name"))
	if f, ok := v.Body.(result.File); ok {
		b, h, name := f.Content, f.SHA, f.Name

		if r.URL.Query().Has("pointer") {
			v, e := evidence.PointerValue(b, r.URL.Query().Get("pointer"))
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
	}
	respond(w, v)
}
func (a *app) handler() http.Handler {
	mux := http.NewServeMux()
	reader := &viewHandler{identity: a.identity, queries: a.queries, views: a.views}
	mux.HandleFunc("POST /api/login", a.login)
	mux.HandleFunc("POST /api/logout", a.logout)
	mux.HandleFunc("GET /api/me", func(w http.ResponseWriter, r *http.Request) {
		if owner := reader.owner(w, r); owner != "" {
			send(w, 200, map[string]string{"id": owner})
		}
	})
	mux.HandleFunc("POST /api/conversations/{id}/tasks/{task}/resume", a.resume)
	mux.HandleFunc("POST /api/conversations/{id}/tasks/{task}/{action}", a.control)
	mux.HandleFunc("POST /api/conversations", a.createConversation)
	mux.HandleFunc("GET /api/conversations", reader.conversations)
	mux.HandleFunc("GET /api/conversations/{id}", reader.conversation)
	mux.HandleFunc("POST /api/conversations/{id}/messages", a.appendQuestion)
	mux.HandleFunc("POST /api/bundles/{id}/tasks", a.submitTask)
	mux.HandleFunc("GET /api/bundles/{id}/tasks", reader.cachedView("list", reader.taskList))
	mux.HandleFunc("GET /api/tasks/{id}", reader.cachedView("task", reader.task))
	mux.HandleFunc("GET /api/tasks/{id}/files/{name}", reader.taskFile)
	mux.HandleFunc("GET /api/bundles", reader.list)
	mux.HandleFunc("POST /api/bundles", a.upload)
	mux.HandleFunc("GET /api/bundles/{id}", reader.detail)
	mux.HandleFunc("GET /api/bundles/{id}/files/{name}", reader.file)
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
		ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
		defer cancel()
		if a.views != nil && r.Method == "POST" {
			recorder := httptest.NewRecorder()
			mux.ServeHTTP(recorder, r.WithContext(ctx))
			if recorder.Code >= 200 && recorder.Code < 300 {
				if a.views.afterCommit != nil {
					a.views.afterCommit(ctx)
				}
				a.views.invalidate(ctx)
			}
			for k, v := range recorder.Header() {
				w.Header()[k] = v
			}
			w.WriteHeader(recorder.Code)
			w.Write(recorder.Body.Bytes())
			return
		}
		mux.ServeHTTP(w, r.WithContext(ctx))
	})
}
