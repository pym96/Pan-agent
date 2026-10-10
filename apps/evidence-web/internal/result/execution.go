package result

type ExecutionReply struct {
	Kind   string `json:"kind"`
	Result struct {
		Status string `json:"status"`
	} `json:"result"`
	Artifacts map[string]struct {
		SHA    string `json:"sha256"`
		Base64 string `json:"base64"`
	} `json:"artifacts"`
	Cleanup bool `json:"cleanupConfirmed"`
}
