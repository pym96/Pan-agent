package identity

import (
	"crypto/rand"
	"encoding/hex"
)

func NewID() string {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		panic("randomness unavailable")
	}
	return hex.EncodeToString(b)
}
