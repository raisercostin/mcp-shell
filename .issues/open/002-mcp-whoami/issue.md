# Issue 002: shell_whoami — detect current agent/model/IDE environment

**ID**: 002  
**Slug**: mcp-whoami  
**Status**: new  
**Created**: 2026-03-05  
**Author**: raiser  

---

## Problem Statement

When an MCP tool runs, it has no standard way to know *who* is calling it: which AI model, which agent runtime, which IDE plugin, which OS/shell. This makes context-aware behaviour (e.g. auto-install, tailored responses) impossible.

---

## Goal

Add a `shell_whoami` tool that fingerprints the calling environment and returns structured info. Two files, TDD:

- `whoami.ts` — detection logic + `formatWhoAmI()`
- `whoami.test.ts` — unit tests

---

## Exported Shape

```ts
interface WhoAmI {
  model: string | null;           // e.g. "claude-sonnet-4.6", "gpt-4o"
  agentRuntime: string | null;    // e.g. "copilot-cli", "vscode-copilot", "cursor", "continue"
  ide: string | null;             // e.g. "vscode", "jetbrains", "terminal"
  os: string;                     // e.g. "windows", "linux", "macos"
  shell: string | null;           // currently configured shell name
  mcpTransport: "stdio" | "sse" | "unknown";
  configPaths: Record<string, string>; // { copilotCli: "~/.copilot/mcp-config.json", vscode: "...mcp.json", ... }
}
```

---

## Detection Strategy

Env var sniffing (in priority order):

| Env var / signal | Inferred agent/IDE |
|---|---|
| `VSCODE_*` vars present | VS Code |
| `CURSOR_*` vars present | Cursor |
| `GITHUB_COPILOT_*` | Copilot CLI |
| `JETBRAINS_*` | JetBrains IDE |
| `TERM_PROGRAM=vscode` | VS Code terminal |
| `CI=true` + `GITHUB_ACTIONS` | GitHub Actions |
| process parent name inspection | fallback |

Config path discovery:
- Copilot CLI: `~/.copilot/mcp-config.json`
- VS Code portable: detect `VSCODE_PORTABLE` or well-known data dirs
- VS Code standard: `~/AppData/Roaming/Code/User/mcp.json` (Win), `~/.config/Code/User/mcp.json` (Linux)
- Cursor: `~/.cursor/mcp.json`
- Claude Desktop: `~/AppData/Roaming/Claude/claude_desktop_config.json`

---

## Acceptance Criteria

1. `shell_whoami` returns a non-null `os` field always
2. `configPaths` lists all paths that actually exist on disk (not speculative)
3. `agentRuntime` correctly identifies VS Code Copilot when called from VS Code
4. `formatWhoAmI()` returns human-readable multi-line string
5. All unit tests pass without network access

---

## Dependencies

- Prerequisite for Issue 003 (mcp-install): install needs `configPaths` from whoami

---

## Comments

- **2026-03-05 (raiser)**: Created. Foundation for context-aware MCP install.
