# 3Blue1Brown: cross-entropy, compression, and LLM training

- Type: verified-learning-fact
- Verification: source-located
- Source: <https://www.youtube.com/watch?v=GlYgs6v2YfU> (viewed via subtitle transcript on 2026-08-19); references the "language trees with gzip" compression-clustering paper
- Updated: 2026-08-19

## Verified facts

- A ~2000s-era paper showed language phylogenetic trees and authorship attribution can be recovered using only gzip co-compression distance: append a fragment of document B to A, compress, and compare against compressing A alone.
- Optimal symbol codes assign about -log2(p) bits per symbol (Shannon information content); cross-entropy H(P,Q) is the average bits per symbol when a code optimized for distribution Q meets reality P.
- Key property: for fixed P, cross-entropy is minimized exactly when Q = P, and the minimum equals the entropy of P.
- LLM pretraining loss is the average negative log-probability the model assigns to the true next token. The video argues the logarithm is forced: requiring the average loss to be minimized exactly when the model distribution matches the data statistics constrains the per-example penalty to be logarithmic (constrained-optimization/contour-tangency argument).
- Distillation trains the small model's full distribution against the large model's full distribution via cross-entropy — richer than one-hot targets (chess commentary vs. watching game records analogy).
- KL divergence = cross-entropy minus entropy; interpretable as bits wasted per symbol by a mismatched code; asymmetric, not a true distance. For a fixed target distribution, minimizing cross-entropy and minimizing KL are gradient-equivalent.

## Boundaries

- This is a pedagogical video; the gzip paper's distance is an empirical cross-entropy estimate, and gzip is not Shannon-optimal.
- The video's compression framing establishes properties of the training loss, not claims about harness or agent-layer design.
- The companion discussion in this session (harness rules as lossy compression of task statistics under a context budget) is the assistant's interpretation and is deliberately not admitted as a Wiki fact; it has no independent verification path yet.

## Links

- [Hung-yi Lee Harness Engineering lecture](2026-08-17-harness-engineering-lecture.md)
- [Harness Engineering fact](../concepts/harness-engineering.md)
- [DPO and preference-optimization terminology](2026-08-18-dpo-preference-optimization.md)
