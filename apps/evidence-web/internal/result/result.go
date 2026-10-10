package result

// Kind expresses a domain outcome. Only httpapi maps it to an HTTP status.
type Kind uint8

const (
	Success Kind = iota + 1
	Created
	Invalid
	Unauthenticated
	Forbidden
	Missing
	Conflict
	Unavailable
)

type Value struct {
	Kind Kind
	Body any
}

func OK(kind Kind, body any) Value         { return Value{kind, body} }
func Fail(kind Kind, message string) Value { return Value{kind, map[string]string{"error": message}} }

type File struct {
	Name, SHA string
	Content   []byte
}
