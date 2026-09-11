# Adapter: raw comments (no bot structure)

Unmarked comments — `gh api repos/{o}/{r}/pulls/{n}/comments` entries with no known
marker — normalize minimally:

- `source`: `human` if the author is a person, the bot's login otherwise.
- `kind`: `flag`/`investigate` by default; `bug` when the comment asserts a defect;
  `security` when it asserts a vulnerability.
- `severity`: `non-severe` for bugs unless the comment argues reachability;
  `investigate`/`note` for flags.
- `id`: `RAW_<comment_id>`.
- `thread_id`: the comment's id (replies go via `.../comments/{id}/replies`).
- `disposition`: `pending`.

The default posture for a raw comment is *read it as a human's question*: if it is
a question, answer it on the thread and dispose `refuted`→no — dispose `dismissed`
only when it truly asks nothing. Questions get answers, not dispositions; the
disposition field records that it was handled on-thread.
