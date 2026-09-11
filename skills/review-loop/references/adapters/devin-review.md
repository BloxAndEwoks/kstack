# Adapter: Devin Review

Devin Review posts inline PR comments carrying a JSON marker in an HTML comment.

## Marker format

```
<!-- devin-review-comment {"id":"BUG_pr-review-job-<uuid>_NNNN","file_path":"…","start_line":N,"end_line":N,"side":"RIGHT","based_on_repo_rules":false,"kind":"bug|security"} -->
```

## Field mapping

| marker / body | finding field |
|---|---|
| `id` prefix `BUG_` / `SEC_` | `kind`: `bug` / `security` (a `FLG_` prefix, if ever seen, maps to `flag`) |
| leading emoji 🔴 | bug `severe`; 🟡 → bug `non-severe` |
| leading emoji 🟥 | security `critical`/`high`; 🟨 → `medium` |
| `file_path`, `start_line`, `end_line`, `side` | `path`, `start_line`, `end_line`, `side` |
| `based_on_repo_rules` | verbatim |
| `**bold**` first line after the marker | `title` |
| remaining body | `body` |
| the comment's GraphQL/rest id | `thread_id` |
| `✅ **Resolved**:` replies from the review bot | `disposition: fixed` evidence |

## Notes

- Devin Review re-reviews on push: the same `id` may reappear with a `✅ Resolved`
  reply — that is the resolution signal, not a new finding.
- The PR-level bot comment ("I will automatically address comments…") is the
  babysit/monitor contract, not a finding. The `(aside)` opt-out convention applies
  to comments addressed to that monitor.
- Security findings may name a CWE in prose; extract it into `cwe` when present.
