package config_test

import (
	"pan-agent/evidence-web/internal/config"
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
