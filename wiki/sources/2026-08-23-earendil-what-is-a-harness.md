# Earendil: What is a harness (four-component framing)

- Type: verified-learning-fact
- Verification: source-located
- Source: <https://earendil.com/posts/what-is-a-harness/> (Earendil Inc. product blog, published 2026-08-20; fetched 2026-08-23; the user had earlier pasted the full text in session for comparison)
- Updated: 2026-08-23

## Verified facts

The article argues that a harness "turns a model into an agent" and generally does four things:

1. **System prompt** — a set of instructions "injected into the conversation together with every prompt", likened to first-day instructions for a new employee: not internalized into the model, but followed during the work. The article cites the widely publicized Claude Opus 4.5 "soul document" as the more embedded, training-time counterpart.
2. **Tools** — capabilities written in code that the model can call (web search, code writing/execution, email composition). The article stresses that the harness describes and provides tools but usually does not dictate when or how the model uses them; the model decides.
3. **Agentic loop** — narrated through an email-research example: the model interprets the request, searches, reviews results against the original prompt, decides on its own to search again, builds a spreadsheet via the code tool, compares the output against the prompt, and only then composes the email; the self-assessed decision to act again is "the first clear example of the loop". A linked "Pi session" is offered as a live example.
4. **Translation layer across models** — lets one harness work with models from different providers, and lets a harness mix models within a loop when different models excel at different tasks.

- The article extends the translation layer into a normative argument: portable harnesses "take power and leverage away from the AI labs and into the hands of end users" — users can run local harnesses, swap between Anthropic/OpenAI/open-weight models, compare results and costs in one place, and keep local session records, thereby retaining agency and freedom.

## Boundaries

- This is a vendor product blog (Earendil builds agent products); its four-component framing is a pedagogical decomposition, not a standard. Anthropic's narrow usage, by contrast, places tools and the environment as adjacent layers the harness routes to rather than parts of the harness itself.
- The agency/power argument in section IV is the author's normative position, not an empirical result.
- The "soul document" reference is the article's characterization of a third-party artifact and was not independently inspected here.

## Links

- [Anthropic: official harness definitions](2026-08-23-anthropic-harness-definitions.md)
- [Harness Engineering fact](../concepts/harness-engineering.md)
- [SWE-agent paper](2026-08-20-swe-agent-paper.md) (tool-layer interface design)
- [ReAct paper](2026-08-20-react-paper.md) (loop structure)
