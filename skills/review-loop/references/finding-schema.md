# The finding schema

Every review source — Devin Review, CodeRabbit, bugbots, human comments, the local
`review` pass — normalizes into one shape. The shape is modeled on Devin Review's
wire protocol so nothing downstream needs to know which bot (or human) spoke.

## The finding

```jsonc
{
  "id": "BUG_<source-job>_<seq>",          // stable id; prefix by kind (BUG, SEC, FLG, SMP)
  "source": "devin-review | coderabbit | bugbot | human | self-review",
  "kind": "bug | security | flag | simplify",
  "severity": "<per kind, below>",
  "confidence": "high | medium | low",      // reviewer's own confidence
  "cwe": "CWE-89",                          // security findings only, when known
  "category": "injection | auth | secrets | ssrf-traversal | deserialization | validation | other",  // security only
  "based_on_repo_rules": false,             // true when the finding cites the repo's own rules
  "path": "apps/web/lib/x.ts",
  "start_line": 223, "end_line": 223,
  "side": "RIGHT",                          // RIGHT | LEFT (removed side)
  "title": "Rule proposals never reach correction",
  "body": "Any `rule` proposal is rejected by …",
  "remediation": "…",                        // suggested fix, when the source gives one
  "thread_id": "PRRC_…",                    // the PR comment thread it lives on
  "mechanism": "wrong-model | missing-fact | missing-guard | null",  // triage fills this
  "disposition": "pending | fixed | refuted | deferred | accepted-risk | dismissed",
  "disposition_detail": "<sha | reason | named trigger>",
  "created_at": "…", "resolved_at": "…"
}
```

## Kind × severity matrix

| kind | severities | meaning |
|---|---|---|
| `bug` | `severe`, `non-severe` | Actionable errors. `severe` = high-confidence defect reachable today, fix before merge. `non-severe` = still worth review. |
| `security` | `critical`, `high`, `medium`, `low` | Vulnerabilities in the CWE categories: injection, broken auth/access control, secrets exposure, SSRF/path traversal, insecure deserialization, missing input validation. Always carries `cwe` when classifiable and a reachable-path argument. |
| `flag` | `investigate`, `note` | `investigate` = potential issue worth a human look. `note` = informational, no action required. |
| `simplify` | `required`, `note` | A cleaner architecture for the same behavior. `required` = complexity this diff adds when a cleaner shape is available; fixed or refuted before land. `note` = existing debt, deferred with a named trigger. Never fails a pass on its own. |

Severity emoji on GitHub posts, matching Devin Review's convention:
`severe`/`critical`/`high` → 🔴 (bug) / 🟥 (security); `non-severe`/`medium` →
🟡/🟨; `low`/`note`/`investigate` → 🔵.

## The wire format for GitHub

When posting a finding as a PR comment, embed the normalized marker so the finding
round-trips machine-readably — same convention Devin Review uses:

```markdown
<!-- kstack-finding {"id":"BUG_local-review_0001","kind":"bug","severity":"severe","confidence":"high","based_on_repo_rules":false,"file_path":"…","start_line":N,"end_line":N,"side":"RIGHT"} -->

🔴 **Title**

Body… Remediation…
```

## Mechanism — classify before remedying

Triage assigns every accepted finding a mechanism, the taxonomy that separates
understanding a problem from whack-a-mole:

| mechanism | meaning | the fix |
|---|---|---|
| `wrong-model` | the design is wrong — the finding is a symptom | redesign; never a note, never a patch |
| `missing-fact` | the code lacks a fact it needs | carry the fact at the layer that first has it; never a local guess |
| `missing-guard` | design right, fact present, boundary check absent | the one case a local fix is correct |

`deferred` is never a legal disposition for `wrong-model`.

## Dispositions and the response protocol

`pending` is the only open state. Every finding reaches exactly one terminal
disposition:

| disposition | when | the thread gets |
|---|---|---|
| `fixed` | the finding reproduced / was plainly right | reply `Fixed in <sha>: …` |
| `refuted` | wrong or already covered | reply with checkable evidence — never a bare dismissal |
| `deferred` | real, out of this unit's scope | reply naming the trigger that reopens it |
| `accepted-risk` | deliberate non-fix | reply with the reason; rare |
| `dismissed` | duplicate or superseded | reply naming what supersedes it |

A finding is `resolved` only when its disposition is terminal **and** the response
is posted on its thread.

## Repo rules as review input

Reviewers (human or agent) read the repo's `AGENTS.md`, `REVIEW.md`, and
`CONTRIBUTING.md` first. A finding that enforces one of those rules sets
`based_on_repo_rules: true` — that flag is how the repo's own conventions compound
into review coverage without being re-stated per PR.
