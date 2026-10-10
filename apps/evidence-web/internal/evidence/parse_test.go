package evidence

import (
	"encoding/json"
	"os"
	"testing"
)

func TestPinnedSummary(t *testing.T) {
	b, e := os.ReadFile("../../../../docs/evidence/terminal-bench-full-live-97-summary.json")
	if e != nil {
		t.Fatal(e)
	}
	if Hash(b) != "f67d6e22a5f229637bb90cccc5a2538f6aaa87225efb1b8a9cf182cac37828ab" {
		t.Fatal("fixture identity")
	}
	m, _ := json.Marshal(Manifest{1, "fixture", "summary.json", map[string]string{"summary.json": Hash(b)}})
	_, o, e := ParseBundle(m, map[string][]byte{"summary.json": b})
	if e != nil {
		t.Fatal(e)
	}
	want := map[string]int{"success": 18, "valid_failure": 5, "unscored": 20, "unknown_interrupted": 20, "not_started": 26}
	for k, v := range want {
		if o.Counts[k] != v {
			t.Fatalf("%s: %d", k, o.Counts[k])
		}
	}
	if o.ValidScored != 23 || o.Usage != (Usage{1, 1, 470, 161}) {
		t.Fatalf("wrong overview: %+v", o)
	}
	if o.Rows[0].ValidScore != nil {
		t.Fatal("unknown became zero")
	}
}
func TestUnambiguousSource(t *testing.T) {
	for _, b := range []string{`{"a":1,"a":2}`, `{"x":{"a":1,"a":2}}`, `{} {}`} {
		var v any
		if decodeJSON([]byte(b), &v) == nil {
			t.Fatal("ambiguous JSON accepted")
		}
	}
	v, e := PointerValue([]byte(`{"a/b":{"~x":[null,4]}}`), "/a~1b/~0x/0")
	if e != nil || v != nil {
		t.Fatalf("pointer/null: %v %v", v, e)
	}
}
