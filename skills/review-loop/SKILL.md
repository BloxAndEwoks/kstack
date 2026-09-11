---
name: review-loop
description: Normalize every review source on a PR — Devin Review, CodeRabbit, bugbots, human comments, the local review pass — into the finding schema, then drive each finding to a disposition (fix + cite SHA, refute with evidence, defer with a named trigger). Use when review comments land, when the user submits feedback, or before land.
---

# Review loop — findings to dispositions

Every review source speaks its own dialect. This skill is the normalizer and the
response protocol: pull everything, normalize to the finding schema, triage each,
respond on its own thread, and drive the set to zero pending.

## Step 1 — collect

```bash
gh api repos/{owner}/{repo}/pulls/{n}/comments        # inline review comments
gh api repos/{owner}/{repo}/issues/{n}/comments       # PR-level comments
gh pr view {n} --json reviews                          # review verdicts
```

Each source maps per `references/adapters/`: `devin-review.md` (the
`devin-review-comment` marker JSON), `coderabbit.md`, `raw-comments.md` (human and
unmarked bot comments). Human feedback attached mid-session counts too — it is
findings with `source: human`.

## Step 2 — normalize

Convert each comment to the finding schema (`references/finding-schema.md`):
`kind` (bug | security | flag), `severity` per kind (`severe`/`non-severe`;
`critical`/`high`/`medium`/`low`; `investigate`/`note`), `confidence`, `cwe` where
present, anchor (`path`, `start_line`, `end_line`, `side`), `based_on_repo_rules`,
`thread_id`, `source`. Store via the `kstack` MCP server (`finding_add`) or append
to `.kstack/review/<pr>.json`.

## Step 3 — triage each finding

Decide before touching code, in order:

1. **Accept → fix.** The finding reproduces or is plainly right. Fix it, commit,
   and reply on its thread: `Fixed in <sha>: <what changed>`. Disposition
   `fixed`, detail = the SHA.
2. **Refute → reply with evidence.** The finding is wrong or already handled. Reply
   with the concrete reason — the code path, the test, the invariant that covers
   it. Never churn code to appease a wrong finding; never dismiss without a reason
   a reviewer could check. Disposition `refuted`.
3. **Defer → named trigger.** Real but out of this unit's scope. Disposition
   `deferred` with a named trigger ("when X lands", "when load exceeds Y") — never
   a naked "later".
4. **Accept risk.** Deliberate non-fix with a written reason. Disposition
   `accepted-risk` — rare, and it always carries the reason.

Security findings get the reachability check first: a `security` finding without a
reachable path is a `flag/investigate`, not a bug — and a reachable one is never
deferred silently.

## Step 4 — respond and resolve

- Reply on each finding's own thread (`gh api .../comments/{id}/replies` for inline,
  issue comment for PR-level). The reply carries the disposition and its evidence.
- The `aside` convention: a comment marked `(aside)` is observation, not a request —
  record it, do not act.
- `finding_dispose` each finding in the store. When the source supports it
  (Devin Review re-review, GitHub resolve), mark the thread resolved only after the
  fixing commit is pushed.

## Done when

`review_state` (or the store file) shows zero `pending`. Report: counts by
disposition, the SHAs that carry fixes, the deferred triggers.
