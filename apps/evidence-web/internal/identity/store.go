package identity

import (
	"context"
	"errors"
	"pan-agent/evidence-web/internal/evidence"
	"pan-agent/evidence-web/internal/result"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Store struct{ db *pgxpool.Pool }

func New(db *pgxpool.Pool) *Store { return &Store{db: db} }
func (s *Store) Owner(ctx context.Context, token string) (string, error) {
	var uid string
	e := s.db.QueryRow(ctx, "SELECT account_id FROM ew_sessions WHERE token_hash=$1 AND expires_at>now()", evidence.Hash([]byte(token))).Scan(&uid)
	return uid, e
}
func (s *Store) Login(ctx context.Context, email, pw string) (string, result.Kind) {
	var uid, stored string
	e := s.db.QueryRow(ctx, "SELECT id,password_hash FROM ew_accounts WHERE email=$1", strings.ToLower(strings.TrimSpace(email))).Scan(&uid, &stored)
	if e != nil || bcrypt.CompareHashAndPassword([]byte(stored), []byte(pw)) != nil {
		return "", result.Unauthenticated
	}
	token := NewID()
	_, e = s.db.Exec(ctx, "INSERT INTO ew_sessions(token_hash,account_id,expires_at) VALUES($1,$2,$3)", evidence.Hash([]byte(token)), uid, time.Now().Add(12*time.Hour))
	if e != nil {
		return "", result.Unavailable
	}
	return token, result.Success
}
func (s *Store) Logout(ctx context.Context, token string) {
	s.db.Exec(ctx, "DELETE FROM ew_sessions WHERE token_hash=$1", evidence.Hash([]byte(token)))
}
func (s *Store) Invite(ctx context.Context, email, pw string) error {
	h, e := bcrypt.GenerateFromPassword([]byte(pw), bcrypt.DefaultCost)
	if e != nil {
		return errors.New("password hashing failed")
	}
	_, e = s.db.Exec(ctx, "INSERT INTO ew_accounts(id,email,password_hash) VALUES($1,$2,$3)", NewID(), email, string(h))
	if e != nil {
		return errors.New("account creation failed (account may already exist)")
	}
	return nil
}
