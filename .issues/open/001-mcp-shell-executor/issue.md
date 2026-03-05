# Issue 001: MCP Shell Executor (bashw-first)

**ID**: 001  
**Slug**: mcp-shell-executor  
**Status**: new  
**Created**: 2026-03-05  
**Author**: raiser  

---

## Problem Statement

All major AI agent runtimes (Claude/Copilot, Codex, Gemini, Antigravity) detect and use the host OS default shell at startup. On Windows, this typically resolves to `powershell.exe` or `cmd.exe`, bypassing `bashw` (the pinned Git Bash / MinGW64 shim). This causes:

- POSIX commands (`ls`, `grep`, `find`, `sort`) resolving to Windows system binaries with different semantics
- Path model mismatches (`C:\foo` vs `/c/foo` vs `/mnt/c/foo`)
- Shell operator failures (`&&`, `||`, `2>&1`, heredocs)
- JBang smoke runs failing because they require `bashw -c 'jbang ...'`
- Silent shell drift — agent thinks it ran bash but ran PowerShell

Gemini partially solves this via a patched `GEMINI_SHELL_CONFIG` env var, but this is a brittle, per-tool hack that must be re-applied after every npm update. Claude/Copilot/Codex have no equivalent.

**Goal**: An MCP server that exposes a `run_command` (and optionally `run_script`) tool where the shell is **explicitly configured** — not detected from the OS — so any agent on any platform gets `bashw` (or any configured shell) every time.

---

## Requirements

### R1 — Explicit Shell Configuration (from `practice-tools.md`)
- The shell executable **must** be configurable via an absolute path (e.g., `D:\home\raiser-apps\shims\bashw.exe`)
- Default shell for this workspace: `bashw` (Git Bash / MinGW64 shim at `D:\home\raiser-apps\shims\bashw.exe`)
- `bashw` is set up via: `scoop shim add bashw "D:\home\raiser-apps\apps\git\current\usr\bin\bash.exe"`
- The MCP must use the configured shell regardless of what the host agent runtime detects

### R2 — Shell Invocation Style (from `practice-shell.md`, `practice-tools.md`)
- Commands must be invoked as: `<shell_executable> -c '<command>'`
- `argsPrefix` must be configurable (default: `["-c"]`) — mirrors the `GEMINI_SHELL_CONFIG` pattern
- Absolute path to executable is required (Node `spawn` fails with `ENOENT` on relative names or shimless names)
- The `.exe` extension must be included on Windows

### R3 — Path Model (from `practice-tools.md`, `practice-shell.md`)
- Forward slashes (`/`) must work inside commands (MinGW64 accepts them)
- Server must NOT mangle paths — pass commands verbatim to the configured shell
- No silent path conversion between Windows (`C:\`) and POSIX (`/c/`) styles

### R4 — Binary Collision Prevention (from `practice-tools.md`)
- `bashw` resolves the correct `find`, `sort`, `grep` etc. from MinGW64, not `C:\Windows\System32`
- The MCP does not need to handle PATH itself — the configured shell owns PATH
- Using `which -a <cmd>` from within the shell is the verification method

### R5 — Shell Drift Prevention (from `practice-shell.md`, `open-issues.md`)
- No fallback to `powershell.exe`, `cmd.exe`, or `wsl.exe` if the configured shell fails to start
- If the shell binary is not found, fail loudly with a clear error — never silently fall back
- Every command execution must go through the same configured shell (no per-command overrides unless explicitly designed)

### R6 — Configuration Format (from `practice-gemini-shell-patch.md`)
- Config should be expressible as a JSON/YAML structure, modeled on the proven `GEMINI_SHELL_CONFIG` shape:
  ```json
  {
    "executable": "D:/home/raiser-apps/shims/bashw.exe",
    "argsPrefix": ["-c"],
    "shell": "bash"
  }
  ```
- Config location priority (from `practice-agentconfig.md` layered config model):
  1. MCP server startup argument / CLI flag (highest)
  2. `.agentconfig` or `.gene/` project config
  3. Environment variable (`MCP_SHELL_CONFIG`)
  4. Hard-coded safe default (none — fail if not configured)

### R7 — MCP Tool Interface
- Tool name: `run_command`
- Input: `{ "command": "<shell command string>" }`
- Output: `{ "stdout": "...", "stderr": "...", "exit_code": 0 }`
- Optional tool: `run_script` — accepts a multi-line script body
- Working directory: configurable; default to MCP server's cwd or a configured `workdir`

### R8 — Platform Portability (from `practice-shell.md` — multiple scenarios)
- Must work on any OS where the configured shell binary exists
- On Linux/macOS: configured shell would be `/bin/bash` or `/usr/bin/zsh` etc.
- On Windows: `bashw.exe`, `pwsh.exe`, or `wsl.exe` as configured
- No Windows-only code paths in the MCP server itself

### R9 — Non-Interactive / Headless Safety (from `practice-headless-session.md`)
- Commands must run with bounded timeouts (configurable, default: 30s)
- No TTY allocation — pure stdin/stdout/stderr capture
- Treat stty/TTY probe warnings from the shell as non-fatal

### R10 — Stop on Error (from `practice-workflow.md`)
- If shell subprocess fails to start: return error immediately, do not retry silently
- Non-zero exit codes must be surfaced in the response (not swallowed)
- Stderr always captured and returned even on success

---

## Context / Background

### Why `bashw`? (from `practice-tools.md` + `practice-shell.md`)
`bashw` is a Scoop shim that pins to a specific Git Bash (MinGW64) binary:
```
scoop shim add bashw "D:\home\raiser-apps\apps\git\current\usr\bin\bash.exe"
```
It provides:
- Consistent `/c/` mount points (MSYS-style)
- Integration with Scoop-installed Linux utilities (`rsync`, `ssh`, `find`, `grep`)
- No dependency on `WSL` or `Cygwin` path models
- Reproducibility: same binary every run, no PATH-based resolution ambiguity

### The Gemini Precedent (from `practice-gemini-shell-patch.md`)
Gemini CLI was patched to respect `GEMINI_SHELL_CONFIG`:
```json
{"executable":"D:\\home\\raiser-apps\\shims\\bashw.exe","argsPrefix":["-c"],"shell":"bash"}
```
Lessons learned from that patch:
- Absolute paths with `.exe` extension are mandatory
- JSON must be valid (backslash-escape in env vars is painful)
- The patched code gets wiped on every `npm update` — a persistent MCP is better
- Other agents (Claude, Codex, Copilot) have no equivalent patching mechanism

### The Shell Context Awareness Open Issue (from `open-issues.md`)
> **Problem**: Agents on Windows frequently drift between PowerShell and POSIX (Bash) syntax.  
> **Status**: Mitigated via `GEMINI_SHELL_CONFIG`, but requires persistent awareness.

This MCP is the proper, agent-agnostic solution to that open issue.

### Preferred Shell Matrix (from `practice-shell.md`)
| Scenario | Shell |
|----------|-------|
| Windows daily use | `bashw` |
| Windows system/admin tasks | `pwsh` |
| Linux-heavy pipelines on Windows | WSL bash |
| Legacy compatibility | `cmd` |

---

## Acceptance Criteria

1. `run_command({ "command": "ls --version" })` returns GNU coreutils output, not PowerShell error
2. `run_command({ "command": "which -a find" })` returns MinGW64 path, not `C:\Windows\System32\find.exe`
3. `run_command({ "command": "jbang foo.java" })` works (equivalent to `bashw -c 'jbang foo.java'`)
4. `run_command({ "command": "echo $0" })` returns `bash` (not `powershell` or `cmd`)
5. If `bashw.exe` path is wrong, MCP returns a clear `ENOENT`-style error — no fallback
6. MCP is usable from Claude/Copilot, Codex, and Gemini as an MCP server
7. Config survives `npm update` (no patching of node_modules required)

---

## Comments

- **2026-03-05 (raiser)**: Created. This is the root cause of persistent shell drift across all agent sessions. A stable MCP is better than per-agent patching.
