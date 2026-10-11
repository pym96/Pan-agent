package taskview

import (
	"context"
	"encoding/json"
	"pan-agent/evidence-web/internal/testfixture"
	"testing"
)

func TestMissingUsageStaysUnknown122(t *testing.T) {
	db := testfixture.Database(t)
	tid := testfixture.Task(t, db, "usage122", 1)
	ctx := context.Background()
	for _, s := range []string{`{"type":"model.turn_started","runId":"r","turn":1}`, `{"type":"model.turn_settled","runId":"r","turn":1,"usage":{"status":"reported","value":{"input":7}}}`, `{"type":"model.turn_started","runId":"r","turn":2}`} {
		if _, e := db.Exec(ctx, "INSERT INTO ew_task_events(task_id,event) VALUES($1,$2)", tid, json.RawMessage(s)); e != nil {
			t.Fatal(e)
		}
	}
	v := New(db).checkpointAccounting(ctx, tid)
	if v["known"] != 1 || v["unknown"] != 1 || v["input"] != nil || v["output"] != nil || v["cacheRead"] != nil {
		t.Fatal(v)
	}
	if v["knownSubtotals"].(map[string]float64)["input"] != 7 {
		t.Fatal("lost known subtotal")
	}
}
