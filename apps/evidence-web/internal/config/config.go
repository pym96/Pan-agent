package config

import (
	"errors"
	"fmt"
	"math"
	"net"
	"net/url"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
)

type Cache struct {
	Enabled                      bool
	Address, Namespace           string
	TTL, RedisTimeout, PGTimeout time.Duration
	Slots                        int
}

func cacheConfig(get func(string) string) (Cache, error) {
	c := Cache{Address: get("WEB_REDIS_ADDR"), Namespace: get("WEB_CACHE_NAMESPACE"), TTL: 5 * time.Second, RedisTimeout: 100 * time.Millisecond, PGTimeout: 2 * time.Second, Slots: 4}
	switch get("WEB_CACHE") {
	case "", "0":
	case "1":
		c.Enabled = true
	default:
		return c, errors.New("WEB_CACHE must be 0 or 1")
	}
	if c.Namespace == "" {
		c.Namespace = "evidence-web"
	}
	if len(c.Namespace) > 100 || strings.ContainsAny(c.Namespace, " \r\n") {
		return c, errors.New("invalid cache namespace")
	}
	for _, x := range []struct {
		name string
		dst  *time.Duration
		max  time.Duration
	}{{"WEB_CACHE_TTL", &c.TTL, 5 * time.Second}, {"WEB_REDIS_TIMEOUT", &c.RedisTimeout, 100 * time.Millisecond}, {"WEB_PROJECTION_TIMEOUT", &c.PGTimeout, 2 * time.Second}} {
		if v := get(x.name); v != "" {
			d, e := time.ParseDuration(v)
			if e != nil || d <= 0 || d > x.max {
				return c, fmt.Errorf("invalid %s", x.name)
			}
			*x.dst = d
		}
	}
	if v := get("WEB_PROJECTION_SLOTS"); v != "" {
		n, e := strconv.Atoi(v)
		if e != nil || n < 1 || n > 4 {
			return c, errors.New("invalid WEB_PROJECTION_SLOTS")
		}
		c.Slots = n
	}
	if c.Enabled {
		host, _, e := net.SplitHostPort(c.Address)
		ip := net.ParseIP(host)
		if e != nil || ip == nil || !ip.IsLoopback() {
			return c, errors.New("Redis must use an explicit loopback address")
		}
	}
	return c, nil
}

type Execution struct {
	Namespace, Root, Entry string
	Mode, KimiKey          string
	Environment            []string
}
type Config struct {
	DSN, Command, Address, Origin, Web, Email, Password string
	Secure                                              bool
	Cache                                               Cache
	Execution                                           Execution
	Maintenance                                         time.Duration
}

func Parse(args []string, get func(string) string) (Config, error) {
	c := Config{DSN: get("DATABASE_URL"), Address: get("LISTEN_ADDR"), Origin: get("APP_ORIGIN"), Web: get("WEB_DIR"), Maintenance: time.Second}
	if len(args) > 1 {
		return c, errors.New("one command only")
	}
	if len(args) == 1 {
		c.Command = args[0]
	}
	if c.Command != "" && c.Command != "worker" && c.Command != "account" {
		return c, errors.New("unknown command")
	}
	if mode := get("WEB_MODE"); mode != "" && mode != "product" {
		return c, errors.New("WEB_MODE must be product")
	}
	if c.DSN == "" {
		return c, errors.New("DATABASE_URL is required")
	}
	if c.Address == "" {
		c.Address = "127.0.0.1:8106"
	}
	if c.Origin == "" {
		c.Origin = "http://" + c.Address
	}
	if c.Web == "" {
		c.Web = "web/dist"
	}
	u, e := url.Parse(c.Origin)
	if e != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") {
		return c, errors.New("APP_ORIGIN invalid")
	}
	c.Secure = u.Scheme == "https"
	if c.Cache, e = cacheConfig(get); e != nil {
		return c, e
	}
	if v := get("WEB_MAINTENANCE_INTERVAL"); v != "" {
		c.Maintenance, e = time.ParseDuration(v)
		if e != nil || c.Maintenance <= 0 || c.Maintenance > time.Minute {
			return c, errors.New("maintenance interval must be >0 and <=1m")
		}
	}
	x := Execution{Mode: get("WEB_PROVIDER"), Namespace: get("WEB_ISSUE"), Root: get("WEB107_TASK_ROOT"), Entry: get("WEB107_EXECUTOR")}
	if x.Mode == "" {
		x.Mode = "offline-faux"
	}
	if x.Mode != "offline-faux" && x.Mode != "kimi" {
		return c, errors.New("WEB_PROVIDER must be offline-faux or kimi")
	}
	if x.Mode == "kimi" {
		if v := get("KIMI_MODEL"); v != "" && v != "k3-256k" {
			return c, errors.New("unsupported Kimi model")
		}
		if v := get("KIMI_REASONING"); v != "" && v != "high" {
			return c, errors.New("unsupported Kimi reasoning")
		}
		if get("KIMI_ENDPOINT") != "" {
			return c, errors.New("Kimi endpoint is fixed")
		}
		if c.Command == "worker" {
			x.KimiKey = get("KIMI_API_KEY")
			if strings.TrimSpace(x.KimiKey) == "" {
				return c, errors.New("KIMI_API_KEY required for Kimi worker")
			}
		}
	}
	if x.Namespace == "" {
		x.Namespace = "evidence-web"
	}
	if !regexp.MustCompile(`^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$`).MatchString(x.Namespace) {
		return c, errors.New("invalid resource namespace")
	}
	if c.Command == "worker" || x.Root != "" || x.Entry != "" {
		if !filepath.IsAbs(x.Root) || !filepath.IsAbs(x.Entry) || !filepath.IsAbs(get("PAN_ENTRY")) || !regexp.MustCompile(`^sha256:[a-f0-9]{64}$`).MatchString(get("PAN_IMAGE")) {
			return c, errors.New("worker requires absolute task root/executor/Pan entry and pinned PAN_IMAGE")
		}
	}
	for _, v := range []struct {
		key string
		max float64
	}{{"ANALYSIS_CPUS", 2}, {"ANALYSIS_MEMORY_GIB", 4}} {
		if raw := get(v.key); raw != "" {
			n, e := strconv.ParseFloat(raw, 64)
			if e != nil || math.IsNaN(n) || math.IsInf(n, 0) || n < 1 || n > v.max {
				return c, fmt.Errorf("invalid %s", v.key)
			}
		}
	}
	keys := []string{"PATH", "DOCKER_HOST", "DOCKER_CONFIG", "PAN_ENTRY", "PAN_IMAGE", "WEB107_TASK_ROOT", "WEB107_SCENARIO", "ANALYSIS_CPUS", "ANALYSIS_MEMORY_GIB", "WEB_FAUX_BARRIER", "WEB_RESULT_BARRIER", "WEB_TOOL_BARRIER", "WEB_CHECKPOINT_MODE", "WEB_CHECKPOINT_FAULT", "WEB_OPERATION_MODE", "WEB_OPERATION_FAULT", "WEB_ADMISSION_FAULT"}
	for _, k := range keys {
		if v := get(k); v != "" {
			x.Environment = append(x.Environment, k+"="+v)
		}
	}
	x.Environment = append(x.Environment, "WEB_ISSUE="+x.Namespace, "WEB_MODE=product", "WEB_PROVIDER="+x.Mode)
	c.Execution = x
	c.Email = strings.ToLower(strings.TrimSpace(get("ACCOUNT_EMAIL")))
	c.Password = get("ACCOUNT_PASSWORD")
	if c.Command == "account" && (!strings.Contains(c.Email, "@") || len(c.Password) < 12 || len(c.Password) > 72) {
		return c, errors.New("ACCOUNT_EMAIL and ACCOUNT_PASSWORD (12-72 bytes) required")
	}
	return c, nil
}
