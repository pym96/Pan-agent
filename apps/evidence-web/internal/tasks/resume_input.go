package tasks

type ResumeInput struct {
	RequestID    string `json:"requestId"`
	CheckpointID string `json:"checkpointId"`
}
