# Playbook: docs

Prose artifacts: documentation, comments, READMEs, ADRs, runbooks. No behavior change.

1. **Read before writing.** The doc must match the code as it is today, not as
   remembered. For anything behavioral, check the source.
2. **Placement by convention.** Numbered doc spine, `docs/`, ADR directory — follow
   the repo's existing structure and naming. A new convention needs a stated reason.
3. **Facts, decisions, or pointers — not procedure duplication.** Document what the
   code cannot show: why, not what. Where the repo declares a single home for build
   procedure, docs point to it rather than restating it.
4. **Verify the claims.** Commands in docs get run once. Links and file references
   get checked. A doc that describes behavior the code no longer has is a defect,
   not documentation.
5. **`/kstack:open-pr`** → **`/kstack:review`** → **`/kstack:review-loop`** →
   **`/kstack:fix-ci`** as needed → **`/kstack:land`**.

**Reply:** what was documented, what was verified, open questions the doc surfaced.
