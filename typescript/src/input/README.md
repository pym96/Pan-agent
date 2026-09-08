# Task input preparation

[attachments.ts](attachments.ts) validates the aggregate byte policy, discovers eligible names and captures one explicitly selected immutable UTF-8 snapshot. [task-envelope.ts](task-envelope.ts) validates/encodes/decodes the versioned task string without filesystem access. Dependencies are only this module and Node builtins.

[Design and contract](../../../docs/design/native-file-input.md) specify keys, byte-policy provenance, exact encoding and boundaries. Input preparation occurs above the unchanged session task-string seam; it does not change tool authority, Runtime or durable schemas.
