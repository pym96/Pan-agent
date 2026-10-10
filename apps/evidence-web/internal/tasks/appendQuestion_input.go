package tasks

type AppendQuestionInput struct {
	Question  string `json:"question"`
	RequestID string `json:"requestId"`
}
