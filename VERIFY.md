# Verification

Run from the repository root with Node.js 18 or newer. There is no package
installation step or automated test suite. The MCP server starts with
`node mcp/review-state.mjs` and communicates over stdio.

## Manifest changes

Check syntax and whitespace:

```sh
node --check mcp/review-state.mjs
git diff --check
```

Check that the root manifest, host manifests, and versioned marketplace entries
agree. Marketplace entries without a version stay unversioned.

```sh
node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => JSON.parse(readFileSync(path, 'utf8'));
const { version } = read('plugin.json');
assert.match(version, /^\d+\.\d+\.\d+$/);
for (const host of ['devin', 'claude', 'codex', 'cursor']) {
  assert.equal(read(`.${host}-plugin/plugin.json`).version, version, host);
}
for (const path of ['.claude-plugin/marketplace.json', '.agents/plugins/marketplace.json']) {
  const catalog = read(path);
  for (const plugin of catalog.plugins.filter(plugin => plugin.name === 'kstack')) {
    if ('version' in plugin) assert.equal(plugin.version, version, path);
  }
}
console.log(`Manifest versions agree: ${version}`);
NODE
```

With the Claude CLI installed, validate its plugin and marketplace:

```sh
claude plugin validate .claude-plugin/plugin.json
claude plugin validate .claude-plugin/marketplace.json
```

These checks cover manifest consistency and Claude validation. They do not
exercise installation or loading in the other hosts.
