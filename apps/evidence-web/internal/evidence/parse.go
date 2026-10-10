package evidence

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"regexp"
	"strconv"
	"strings"
	"unicode/utf8"
)

const ParserVersion = "pan97-summary-criteria112-v1"
const MaxUpload = 16 << 20

var safeName = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$`)
var hashPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

type Manifest struct {
	Version int               `json:"version"`
	Title   string            `json:"title"`
	Summary string            `json:"summary"`
	Files   map[string]string `json:"files"`
}
type Source struct {
	File    string `json:"file"`
	Pointer string `json:"pointer"`
}
type Row struct {
	Task       string   `json:"task"`
	State      string   `json:"state"`
	RunID      *string  `json:"runId"`
	RawReward  *float64 `json:"rawReward"`
	ValidScore *float64 `json:"validScore"`
	Reason     *string  `json:"reason"`
	Source     Source   `json:"source"`
}
type Usage struct {
	Known   int64 `json:"known"`
	Unknown int64 `json:"unknown"`
	Input   int64 `json:"input"`
	Output  int64 `json:"output"`
}
type Overview struct {
	Rows                 []Row          `json:"rows"`
	Counts               map[string]int `json:"counts"`
	Total                int            `json:"total"`
	ValidScored          int            `json:"validScored"`
	ClassificationSource Source         `json:"classificationSource"`
	Usage                Usage          `json:"usage"`
	UsageSource          Source         `json:"usageSource"`
	UsageScope           string         `json:"usageScope"`
	Warnings             []string       `json:"warnings"`
}

func Hash(b []byte) string { s := sha256.Sum256(b); return hex.EncodeToString(s[:]) }

// Reject duplicate keys: pointers must have a single unambiguous source record.
func decodeJSON(b []byte, dest any) error {
	if !utf8.Valid(b) {
		return fmt.Errorf("invalid UTF-8")
	}
	d := json.NewDecoder(bytes.NewReader(b))
	d.UseNumber()
	var walk func() error
	walk = func() error {
		tok, err := d.Token()
		if err != nil {
			return err
		}
		delim, ok := tok.(json.Delim)
		if !ok {
			return nil
		}
		switch delim {
		case '{':
			seen := map[string]bool{}
			for d.More() {
				t, e := d.Token()
				if e != nil {
					return e
				}
				k, ok := t.(string)
				if !ok || seen[k] {
					return fmt.Errorf("duplicate or invalid object key")
				}
				seen[k] = true
				if e = walk(); e != nil {
					return e
				}
			}
		case '[':
			for d.More() {
				if e := walk(); e != nil {
					return e
				}
			}
		default:
			return fmt.Errorf("invalid JSON delimiter")
		}
		_, err = d.Token()
		return err
	}
	if err := walk(); err != nil {
		return err
	}
	if _, err := d.Token(); err != io.EOF {
		return fmt.Errorf("trailing JSON")
	}
	return json.Unmarshal(b, dest)
}
func ValidName(s string) bool { return safeName.MatchString(s) && !strings.Contains(s, "..") }
func ParseBundle(manifestBytes []byte, files map[string][]byte) (Manifest, Overview, error) {
	var m Manifest
	var o Overview
	if err := decodeJSON(manifestBytes, &m); err != nil {
		return m, o, fmt.Errorf("manifest.json: invalid JSON: %v", err)
	}
	if m.Version != 1 || !ValidName(m.Summary) || m.Summary == "manifest.json" || len(m.Title) < 1 || len(m.Title) > 160 || len(m.Files) < 1 || len(m.Files) > 32 {
		return m, o, fmt.Errorf("manifest.json: version/title/summary/files invalid")
	}
	if len(files) != len(m.Files) {
		return m, o, fmt.Errorf("manifest.json: supplied files do not match files map")
	}
	for name, expected := range m.Files {
		if !ValidName(name) || name == "manifest.json" {
			return m, o, fmt.Errorf("manifest.json: unsafe file name")
		}
		b, ok := files[name]
		if !ok {
			return m, o, fmt.Errorf("%s: missing file", name)
		}
		if !ValidHash(expected) || Hash(b) != expected {
			return m, o, fmt.Errorf("%s: SHA256 mismatch", name)
		}
	}
	b, ok := files[m.Summary]
	if !ok {
		return m, o, fmt.Errorf("%s: required summary missing", m.Summary)
	}
	var root map[string]json.RawMessage
	if err := decodeJSON(b, &root); err != nil {
		return m, o, fmt.Errorf("%s: invalid JSON: %v", m.Summary, err)
	}
	if string(root["issue"]) != "97" {
		return m, o, fmt.Errorf("%s /issue: expected 97", m.Summary)
	}
	var rawRows []map[string]json.RawMessage
	if err := json.Unmarshal(root["classifications"], &rawRows); err != nil || len(rawRows) != 89 {
		return m, o, fmt.Errorf("%s /classifications: expected 89 rows", m.Summary)
	}
	o.Counts = map[string]int{"success": 0, "valid_failure": 0, "unscored": 0, "unknown_interrupted": 0, "not_started": 0}
	o.Warnings = []string{}
	seen := map[string]bool{}
	for i, raw := range rawRows {
		var row Row
		encoded, _ := json.Marshal(raw)
		if err := json.Unmarshal(encoded, &row); err != nil {
			return m, o, fmt.Errorf("%s /classifications/%d: invalid row", m.Summary, i)
		}
		if row.Task == "" || seen[row.Task] {
			return m, o, fmt.Errorf("%s /classifications/%d/task: missing or duplicate", m.Summary, i)
		}
		seen[row.Task] = true
		if _, ok := o.Counts[row.State]; !ok {
			return m, o, fmt.Errorf("%s /classifications/%d/state: unsupported", m.Summary, i)
		}
		for _, k := range []string{"rawReward", "validScore"} {
			if _, ok := raw[k]; !ok {
				return m, o, fmt.Errorf("%s /classifications/%d/%s: missing", m.Summary, i, k)
			}
		}
		if (row.State == "success" && (row.ValidScore == nil || *row.ValidScore != 1)) || (row.State == "valid_failure" && (row.ValidScore == nil || *row.ValidScore != 0)) || ((row.State != "success" && row.State != "valid_failure") && row.ValidScore != nil) {
			return m, o, fmt.Errorf("%s /classifications/%d/validScore: inconsistent state", m.Summary, i)
		}
		o.Counts[row.State]++
		if row.ValidScore != nil {
			o.ValidScored++
		}
		row.Source = Source{m.Summary, "/classifications/" + strconv.Itoa(i)}
		o.Rows = append(o.Rows, row)
	}
	var seg struct {
		Tasks []struct {
			Accounting struct {
				Usage map[string]*int64 `json:"usage"`
			} `json:"accounting"`
		} `json:"tasks"`
	}
	if err := json.Unmarshal(root["segment7Final"], &seg); err != nil || len(seg.Tasks) != 1 {
		return m, o, fmt.Errorf("%s /segment7Final/tasks: expected single-task segment", m.Summary)
	}
	u := seg.Tasks[0].Accounting.Usage
	for _, k := range []string{"known", "unknown", "input", "output"} {
		if u[k] == nil || *u[k] < 0 {
			return m, o, fmt.Errorf("%s /segment7Final/tasks/0/accounting/usage/%s: missing or invalid", m.Summary, k)
		}
	}
	o.Usage = Usage{*u["known"], *u["unknown"], *u["input"], *u["output"]}
	o.Total = len(o.Rows)
	o.ClassificationSource = Source{m.Summary, "/classifications"}
	o.UsageSource = Source{m.Summary, "/segment7Final/tasks/0/accounting/usage"}
	o.UsageScope = "仅 segment7Final 的单题用量；不是累计用量。未知调用保留，不推算缺失 Token。"
	for name, b := range files {
		if name == m.Summary {
			continue
		}
		if !utf8.Valid(b) || (!strings.HasSuffix(name, ".txt") && !strings.HasSuffix(name, ".jsonl")) {
			o.Warnings = append(o.Warnings, name+": unsupported preview; original available for download")
			continue
		}
		if strings.HasSuffix(name, ".jsonl") {
			for _, line := range bytes.Split(b, []byte("\n")) {
				if len(bytes.TrimSpace(line)) == 0 {
					continue
				}
				var v any
				if decodeJSON(line, &v) != nil {
					o.Warnings = append(o.Warnings, name+": malformed JSONL; displayed as text, not parsed")
					break
				}
			}
		}
	}
	return m, o, nil
}
func PointerValue(content []byte, pointer string) (any, error) {
	var v any
	if err := decodeJSON(content, &v); err != nil {
		return nil, fmt.Errorf("file is not JSON")
	}
	if pointer == "" {
		return v, nil
	}
	if !strings.HasPrefix(pointer, "/") {
		return nil, fmt.Errorf("invalid JSON Pointer")
	}
	for _, part := range strings.Split(pointer[1:], "/") {
		part = strings.ReplaceAll(strings.ReplaceAll(part, "~1", "/"), "~0", "~")
		switch x := v.(type) {
		case map[string]any:
			var ok bool
			v, ok = x[part]
			if !ok {
				return nil, fmt.Errorf("pointer not found")
			}
		case []any:
			i, e := strconv.Atoi(part)
			if e != nil || i < 0 || i >= len(x) {
				return nil, fmt.Errorf("pointer not found")
			}
			v = x[i]
		default:
			return nil, fmt.Errorf("pointer not found")
		}
	}
	return v, nil
}

// ValidHash hides the fixed digest grammar; callers cannot replace a shared regexp.
func ValidHash(s string) bool { return hashPattern.MatchString(s) }
