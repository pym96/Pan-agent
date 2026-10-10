package httpapi

import (
	"encoding/json"
	"io"
	"mime"
	"net/http"
	"pan-agent/evidence-web/internal/result"
	"pan-agent/evidence-web/internal/tasks"
)

func (a *app) createConversation(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	var in tasks.CreateConversationInput
	if !decodeBody(w, r, &in) {
		return
	}
	respond(w, a.commands.CreateConversation(r.Context(), owner, in))
}
func (a *app) appendQuestion(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	var in tasks.AppendQuestionInput
	if !decodeBody(w, r, &in) {
		return
	}
	respond(w, a.commands.AppendQuestion(r.Context(), owner, r.PathValue("id"), in))
}
func (a *app) control(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	var in tasks.ControlInput
	if !decodeBody(w, r, &in) {
		return
	}
	respond(w, a.commands.Control(r.Context(), owner, r.PathValue("id"), r.PathValue("task"), r.PathValue("action"), in))
}
func (a *app) resume(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	var in tasks.ResumeInput
	if !decodeBody(w, r, &in) {
		return
	}
	respond(w, a.commands.Resume(r.Context(), owner, r.PathValue("id"), r.PathValue("task"), in))
}
func (a *app) submitTask(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	var in tasks.SubmitTaskInput
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	d.DisallowUnknownFields()
	if d.Decode(&in) != nil || len(in.Question) < 1 || len(in.Question) > 4000 {
		fail(w, 400, "question required (1–4000 bytes)")
		return
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		fail(w, 400, "invalid JSON")
		return
	}
	respond(w, a.commands.SubmitTask(r.Context(), owner, r.PathValue("id"), in))
}
func (a *viewHandler) conversations(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	respond(w, a.queries.Conversations(r.Context(), owner, r.URL.Query().Get("bundleId")))
}
func (a *viewHandler) conversation(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	respond(w, a.queries.Conversation(r.Context(), owner, r.PathValue("id")))
}
func (a *viewHandler) taskList(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	respond(w, a.queries.TaskList(r.Context(), owner, r.PathValue("id"), r.Context().Value(validatedViewOwner{}) != nil))
}
func (a *viewHandler) task(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	respond(w, a.queries.Task(r.Context(), owner, r.PathValue("id")))
}
func (a *viewHandler) taskFile(w http.ResponseWriter, r *http.Request) {
	owner := a.owner(w, r)
	if owner == "" {
		return
	}
	respond(w, a.queries.TaskFile(r.Context(), owner, r.PathValue("id"), r.PathValue("name")))
}
func respond(w http.ResponseWriter, v result.Value) {
	if f, ok := v.Body.(result.File); ok {
		w.Header().Set("Content-Type", "application/octet-stream")
		w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": f.Name}))
		w.Header().Set("X-Content-SHA256", f.SHA)
		w.WriteHeader(status(v.Kind))
		w.Write(f.Content)
		return
	}
	send(w, status(v.Kind), v.Body)
}
func decodeBody(w http.ResponseWriter, r *http.Request, v any) bool {
	d := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8192))
	d.DisallowUnknownFields()
	if d.Decode(v) != nil {
		fail(w, 400, "invalid JSON")
		return false
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		fail(w, 400, "invalid JSON")
		return false
	}
	return true
}

func status(kind result.Kind) int {
	switch kind {
	case result.Success:
		return http.StatusOK
	case result.Created:
		return http.StatusCreated
	case result.Invalid:
		return http.StatusBadRequest
	case result.Unauthenticated:
		return http.StatusUnauthorized
	case result.Forbidden:
		return http.StatusForbidden
	case result.Missing:
		return http.StatusNotFound
	case result.Conflict:
		return http.StatusConflict
	case result.Unavailable:
		return http.StatusServiceUnavailable
	}
	return http.StatusInternalServerError
}
