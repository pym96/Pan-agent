package main

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
)

// A cursor advances only after a complete, validated frame (including its blank delimiter).
type frame struct {
	id   int64
	data string
}
type deliveredEvent struct {
	ID   int64           `json:"id"`
	Task string          `json:"task"`
	Kind string          `json:"kind"`
	Data json.RawMessage `json:"data"`
}

func (f *frame) Feed(line string) (*deliveredEvent, error) {
	if strings.HasPrefix(line, "id: ") {
		id, e := strconv.ParseInt(strings.TrimPrefix(line, "id: "), 10, 64)
		if e != nil || id <= 0 {
			return nil, errors.New("invalid SSE ID")
		}
		f.id = id
		return nil, nil
	}
	if strings.HasPrefix(line, "data: ") {
		if len(f.data)+len(line) > 65536 {
			return nil, errors.New("SSE frame exceeds bound")
		}
		if f.data != "" {
			f.data += "\n"
		}
		f.data += strings.TrimPrefix(line, "data: ")
		return nil, nil
	}
	if line != "" || f.data == "" {
		return nil, nil
	}
	var event deliveredEvent
	e := json.Unmarshal([]byte(f.data), &event)
	id := f.id
	f.id = 0
	f.data = ""
	if e != nil || event.ID != id || id <= 0 || event.Kind == "" || event.Task == "" || len(event.Data) == 0 {
		return nil, errors.New("invalid SSE payload")
	}
	return &event, nil
}
