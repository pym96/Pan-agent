package main

import "testing"

func TestCursorWaitsForCompletePayload(t *testing.T) {
	f := frame{}
	for _, line := range []string{"id: 17", "event: text", `data: {"id":17,"task":"t","kind":"text","data":{"text":"hello"}}`} {
		v, e := f.Feed(line)
		if e != nil || v != nil {
			t.Fatal("partial frame committed", v, e)
		}
	}
	v, e := f.Feed("")
	if e != nil || v == nil || v.ID != 17 {
		t.Fatal(v, e)
	}
	if v, e = f.Feed(""); v != nil || e != nil {
		t.Fatal("duplicated frame")
	}
}
func TestRejectMismatchedPayload(t *testing.T) {
	f := frame{}
	f.Feed("id: 17")
	f.Feed(`data: {"id":18,"task":"t","kind":"text","data":{}}`)
	if _, e := f.Feed(""); e == nil {
		t.Fatal("ID mismatch accepted")
	}
}
