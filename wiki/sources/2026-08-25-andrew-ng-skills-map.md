# Andrew Ng: AI Engineering Skills Map and the "Building and Deploying AI Applications" follow-up

- Type: verified-learning-fact
- Verification: source-located
- Source:
  - Primary post shared by the user: <https://x.com/AndrewYNg/status/2090840747738374568> — captured verbatim on 2026-08-25 through the Twitter syndication endpoint: text "The most important skills in Building and Deploying AI Applications. <https://t.co/IyWIKLIzeM>", `created_at` 2026-08-21T16:37:34Z, author Andrew Ng (@AndrewYNg), `favorite_count` 11,769 at retrieval time. The shortened link expands to the long-form X Article <http://x.com/i/article/2090836273036763142>.
  - Secondary inspected source: <https://explainx.ai/blog/andrew-ng-ai-engineering-skills-map-august-2026> (Yash Thakker, explainx.ai; fetched 2026-08-25), which identifies the original Skills Map post as <https://x.com/AndrewYNg/status/2088302050706686198> (2026-08-14) and describes the 2026-08-21 article as a follow-up "Part 1" on the first skill.
  - Local private locator: `30-已有资产与参考/简历参考/2026-08-17-AI-Engineering-Skills-Map.md` — the user's adaptation of the 2026-08-14 Skills Map, registered 2026-08-17 with its original URL then unverified; this ingest resolves that open locator.
- Updated: 2026-08-25

## Verified facts

- On 2026-08-14 Andrew Ng published an "AI Engineering Skills Map" post identifying four skill clusters for developers, and on 2026-08-21 he published the long-form follow-up "The most important skills in Building and Deploying AI Applications", framed by the secondary source as a Part-1 deep dive on the first cluster.
- The four clusters, recorded identically in the local adaptation and the secondary summary:
  1. **Building and deploying AI applications** — because "when you prompt an LLM, you don't know what you'll get back", the core skill is running disciplined evals and error-analysis loops to govern unpredictable outputs; prompt engineering is only a small subcomponent of this cluster.
  2. **Software engineering fundamentals** — explicit trade-offs across cost, scalability, reliability, and speed, needed to steer coding agents rather than vibe-code blindly.
  3. **Using coding agents** — a distinct skill: context management, planning-versus-execution trade-offs, giving agents verifiers, and "knowing how much to intervene and how much to leave the agent alone".
  4. **Shaping the build** — as agents execute specs better, engineering shifts upstream to deciding what to build: "Engineers should no longer expect to be given a pixel-perfect design and asked only to implement it."
- The map's stated method is an analysis of 10,000+ job postings plus interviews with hiring managers and recruiters, a process Ng compared to running clustering on a large dataset. This is the author's self-description.
- The secondary summary's takeaway: three of the four skills concern judgment rather than code output, and the map applies to all developers, not only those with an "AI Engineer" title — Ng compares it to how every developer came to need cloud skills.

## Boundaries

- The X Article body itself is auth-walled (X returns HTTP 402 to unauthenticated fetch); every article-level claim beyond the verbatim tweet text and title comes from one secondary summary, not the primary text. The verification level therefore stays `source-located` and must not rise until the primary article body is inspected (for example, if the user pastes the full text in session, as was done for the Earendil source).
- The "10,000+ job postings" figure is the author's self-report; no methodology document was inspected, and it must not be used to derive Shanghai job-market probabilities.
- explainx.ai is a single secondary source, and the local adaptation derives from the same primary post, so their agreement is not triangulation. The 2026-08-14 original-post URL is identified only through the secondary source and has not been captured verbatim from X.
- The four-cluster map is a career-signal taxonomy, not Shanghai JD evidence and not a project fact; career-side use remains governed by the local adaptation file and the JD gates, and nothing here promotes any resume or Verified Project Fact.
- `favorite_count` is a point-in-time engagement figure at retrieval, retained only as provenance color.

## Links

- Career-side adaptation and evidence mapping: `../../../../30-已有资产与参考/简历参考/2026-08-17-AI-Engineering-Skills-Map.md`
- [Harness Engineering](../concepts/harness-engineering.md) — disciplined evals and error-analysis loops are harness-side responsibilities.
- [Distrust-driven verification](../concepts/distrust-driven-verification.md) — the verifier/eval emphasis in cluster 3 matches this concept.
- [Fixed-context DeepSeek action-protocol reliability](../experiments/2026-08-23-protocol-reliability-v1.md) — the project's concrete evals-and-error-analysis evidence lane for cluster 1.
- [Maximum-token sensitivity in Strict ReAct action generation](../experiments/2026-08-24-protocol-max-token-sensitivity.md)
