# Durable artifacts — when each earns its file

The repo's record layer is three committed things: `.kstack/ledger.jsonl` (one
row per landed unit — automatic), `VERIFY.md` (the verification contract —
self-maintaining), and `AGENTS.md` (repo profile — distilled lessons). Below
that sit **optional, on-demand documents** from `templates/` — each exists only
when its trigger fires. Nothing here is a required step in a unit.

| Artifact | Template | Write it when | Never when |
|----------|----------|---------------|------------|
| **PRD** | `templates/PRD.template.md` → `docs/prd-<slug>.md` | The unit is feature-level: multiple consumer-visible requirements, acceptance journeys, or scope that needs an owner-visible "what we're building" before code | The unit is a fix, chore, or single requirement — the PR body carries it |
| **ADR** | `templates/ADR.template.md` → `docs/adr-<nn>-<slug>.md` | The unit changes architecture, dependencies, deployment, data model, or security posture — a decision future-you will want the rejected alternatives for | The decision is local and reversible — a commit message suffices |
| **Ops note** | `templates/ops-note.template.md` → `docs/ops-<slug>.md` | A procedure humans run repeatedly (deploy steps, incident response, environment topology) that exceeds a one-line machine constraint | It's a single constraint — that belongs in `AGENTS.md` |
| **Probe / premortem** | your `premortem` skill | The cost of being wrong is high: new state, a new boundary, a migration, a public contract | Routine units — the review-loop's mechanism triage already catches mechanism errors |

## Deferred work

Two granularities, two homes:

- **A deferred finding** (this PR should have fixed it but we accept the risk
  now) → `finding_dispose` with `deferred("named trigger")` — lives in the
  store, lands in the ledger row, visible via `jq` forever.
- **A deferred product scope** (a whole feature/PRD postponed) → the PRD
  template with `Status: deferred` + a named trigger, or a GitHub issue —
  whichever the repo already uses for backlog. Don't invent a third place.

## The rule underneath

An artifact earns its file when a future session would be measurably worse
without it. Every document above is *retrievable* knowledge — the question each
one answers is asked weeks later by someone who wasn't there. If the answer
lives fine in the PR body, the ledger row, or `AGENTS.md`, the file doesn't
earn itself.
