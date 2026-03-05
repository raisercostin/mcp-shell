# Issue 003: shell_install — install MCP server into current agent config

**ID**: 003  
**Slug**: mcp-install  
**Status**: new  
**Created**: 2026-03-05  
**Author**: raiser  
**Depends on**: 002 (mcp-whoami)

---

## Problem Statement

Installing an MCP server today requires manually editing JSON config files in locations that vary by agent, IDE, and OS. There is no equivalent of `scoop install <app>` or `npm install -g <pkg>` — a single command that registers an MCP server into all relevant configs for the current environment.

---

## Goal

Add a `shell_install` tool (and/or CLI entry point) that, given a single URL or package identifier, installs an MCP server into the correct config file(s) for the detected environment.

```
# Conceptual usage from any agent:
shell_install("https://raw.githubusercontent.com/raisercostin/mcp-shell/main/shell.ts")
```

---

## Behaviour

1. Call `shell_whoami` to detect environment and discover config file paths
2. Parse existing config (if present)
3. Add/update the server entry (idempotent — re-running is safe)
4. Write updated config back
5. Return a summary: which files were updated, what entry was written

---

## Config Entry Generation

Infer the correct entry shape from the URL/identifier:

| URL pattern | Command | Args |
|---|---|---|
| `*.ts` (Deno) | `deno` | `run --allow-env --allow-run --allow-read [--reload] <url>` |
| `npm:<pkg>` | `npx` | `<pkg>` |
| `uvx:<pkg>` | `uvx` | `<pkg>` |

`--reload` added automatically for remote URLs (cache busting).

---

## Exported Shape

```ts
interface InstallResult {
  configPath: string;
  serverName: string;
  entry: Record<string, unknown>;
  wasUpdated: boolean;    // true if entry already existed and was changed
  wasCreated: boolean;    // true if entry is new
}

async function installMcp(url: string, options?: { name?: string; env?: Record<string,string> }): Promise<InstallResult[]>
```

---

## Implementation

Two files, TDD:

- `install.ts` — `installMcp()`, `generateEntry()`, `writeConfig()`
- `install.test.ts` — unit tests (use temp dirs, no real config mutation)

---

## Acceptance Criteria

1. Running `shell_install` with a `.ts` URL adds a valid `deno run` entry to VS Code `mcp.json`
2. Running again is idempotent (no duplicate entries)
3. Existing entries in the config file are preserved
4. Works for Copilot CLI (`mcp-config.json`) and VS Code (`mcp.json`) at minimum
5. Returns clear error if no supported agent config found
6. All unit tests pass using temp dirs (no side effects on real configs)

---

## Comments

- **2026-03-05 (raiser)**: Created. Depends on whoami (002) for config path discovery. Single-URL install is the north star UX — as easy as `scoop install`.
