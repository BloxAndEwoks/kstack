---
name: run-commands
description: Set up agent run commands — the tasks in session Run buttons and worktree-creation hooks. Use on 'set up run commands' or a worktree setup need.
---

# Run commands

Run commands are workspace tasks the host exposes to agent sessions. The Devin
Desktop convention: `.vscode/tasks.json` entries with `"inAgents": true`, and
`"runOptions": { "runOn": "worktreeCreated" }` for setup steps that must run when a
new worktree is created.

```json
{
  "tasks": [
    { "label": "Install dependencies", "type": "shell", "command": "npm install",
      "inAgents": true, "runOptions": { "runOn": "worktreeCreated" } },
    { "label": "Start dev server", "type": "shell", "command": "npm run dev",
      "inAgents": true }
  ]
}
```

## Decision logic

1. **Read `.vscode/tasks.json` first.** `inAgents: true` entries already exist →
   this is a modify request; ask what to change.
2. **Infer the commands** from the workspace — `package.json`, `Makefile`,
   `pyproject.toml`, `Cargo.toml`, `go.mod`, `.nvmrc`, or the repo's procedure file.
   - Obvious setup command (`npm install`, `uv sync`) → `worktreeCreated`, no ask.
   - Obvious dev command (`npm run dev`) → `inAgents` only.
   - Ambiguous (several equally valid options, unfamiliar layout) → ask.
3. **Merge, never overwrite** unrelated existing tasks.
4. Confirm what was added and how to trigger it.

On hosts without a Run button the file is still useful — it is the worktree's
documented setup contract, and any agent can read it.
