package config_test

import (
	"pan-agent/evidence-web/internal/config"
	"strings"
	"testing"
	"time"
)

func TestProductConfiguration(t *testing.T) {
	for _, ns := range []string{"web119", "unrelated-namespace"} {
		c, e := config.Parse(nil, func(k string) string { return map[string]string{"DATABASE_URL": "fixture", "WEB_ISSUE": ns}[k] })
		if e != nil || c.Execution.Namespace != ns || c.Maintenance != time.Second {
			t.Fatal(c, e)
		}
		found := false
		for _, v := range c.Execution.Environment {
			if v == "WEB_MODE=product" {
				found = true
			}
		}
		if !found {
			t.Fatal("namespace selected legacy")
		}
	}
	for k, v := range map[string]string{"WEB_MODE": "web107", "WEB_ISSUE": "bad/name", "WEB_CACHE": "yes", "WEB_MAINTENANCE_INTERVAL": "0", "ANALYSIS_CPUS": "NaN"} {
		if _, e := config.Parse(nil, func(x string) string {
			if x == "DATABASE_URL" {
				return "fixture"
			}
			if x == k {
				return v
			}
			return ""
		}); e == nil {
			t.Fatal(k, "accepted")
		}
	}
	for _, v := range []string{"-1s", "inf", "61s"} {
		if _, e := config.Parse(nil, func(k string) string {
			if k == "DATABASE_URL" {
				return "fixture"
			}
			if k == "WEB_MAINTENANCE_INTERVAL" {
				return v
			}
			return ""
		}); e == nil {
			t.Fatal(v)
		}
	}
}

func TestLiveCredentialBoundary122(t *testing.T) {
	env := map[string]string{"DATABASE_URL": "fixture", "WEB_PROVIDER": "kimi", "WEB107_TASK_ROOT": "/tmp/tasks", "WEB107_EXECUTOR": "/tmp/executor/main.mjs", "PAN_ENTRY": "/tmp/pan/index.js", "PAN_IMAGE": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "KIMI_API_KEY": "SYNTHETIC-SECRET-122", "DATABASE_PASSWORD": "SYNTHETIC-DB"}
	get := func(k string) string { return env[k] }
	c, e := config.Parse([]string{"worker"}, get)
	if e != nil {
		t.Fatal(e)
	}
	if c.Execution.KimiKey != env["KIMI_API_KEY"] {
		t.Fatal("worker credential missing")
	}
	for _, v := range c.Execution.Environment {
		if strings.Contains(v, "SYNTHETIC") {
			t.Fatal("secret in persistable environment")
		}
	}
	c, e = config.Parse(nil, get)
	if e != nil || c.Execution.KimiKey != "" {
		t.Fatal("API must not receive credential")
	}
	delete(env, "KIMI_API_KEY")
	if _, e = config.Parse([]string{"worker"}, get); e == nil {
		t.Fatal("missing key fallback")
	}
	env["KIMI_API_KEY"] = "synthetic"
	for k, v := range map[string]string{"KIMI_ENDPOINT": "https://attacker.invalid", "KIMI_MODEL": "unsupported", "KIMI_REASONING": "low", "WEB_PROVIDER": "fallback"} {
		env[k] = v
		if _, e = config.Parse([]string{"worker"}, get); e == nil {
			t.Fatal("unsupported config", k)
		}
		delete(env, k)
	}
}
