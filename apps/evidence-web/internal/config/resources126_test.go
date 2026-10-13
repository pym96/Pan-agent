package config_test
import("testing";"strings";"pan-agent/evidence-web/internal/config")
func TestResourceProfileBinding126(t *testing.T){
 for _,v:=range []struct{path,hash string;bad bool}{{"/trusted/profile.json",strings.Repeat("a",64),false},{"relative",strings.Repeat("a",64),true},{"/trusted/profile.json","",true},{"",strings.Repeat("a",64),true}}{
  c,e:=config.Parse(nil,func(k string)string{return map[string]string{"DATABASE_URL":"fixture","WEB_RESOURCE_PROFILE":v.path,"WEB_RESOURCE_PROFILE_SHA256":v.hash}[k]})
  if (e!=nil)!=v.bad{t.Fatal(v,e)}
  if !v.bad&&!strings.Contains(strings.Join(c.Execution.Environment,"\n"),"WEB_RESOURCE_PROFILE="+v.path){t.Fatal("not forwarded")}
 }
}
