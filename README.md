# mcp-shell

MCP server that lets AI agents run shell commands through **your chosen shell** — not whatever the runtime defaults to.

On Windows, agents default to `powershell.exe`. This gives you `bash`, `bashw`, `zsh`, or any other shell instead.

---

## Quick Start

No config needed to start. The server guides you:

1. **`shell_doctor`** — discovers all shells on your machine
2. **`configure_shell`** — sets the active shell for the session
3. **`run_command`** / **`run_script`** — run commands through it
4. **`shell_info`** — full shell fingerprint (OS, TTY, capabilities, utilities, env)

To make the shell permanent, set `MCP_SHELL_CONFIG` in your environment (the server tells you the exact value after `configure_shell`).

---

## Install

No install step — Deno fetches and runs directly from GitHub.

### GitHub Copilot CLI

Add to `C:\Users\<you>\.copilot\mcp-config.json`:

```json
{
  "mcpServers": {
    "shell": {
      "command": "deno",
      "args": ["run", "--allow-env", "--allow-run", "--allow-read",
               "https://raw.githubusercontent.com/raisercostin/mcp-shell/main/src/main.ts"]
    }
  }
}
```

### Claude (claude CLI)

```bash
claude mcp add shell -- \
  deno run --allow-env --allow-run --allow-read \
  https://raw.githubusercontent.com/raisercostin/mcp-shell/main/src/main.ts
```

### VS Code Copilot

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "shell": {
      "command": "deno",
      "args": ["run", "--allow-env", "--allow-run", "--allow-read",
               "https://raw.githubusercontent.com/raisercostin/mcp-shell/main/src/main.ts"]
    }
  }
}
```

### Gemini CLI

Add to `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "shell": {
      "command": "deno",
      "args": ["run", "--allow-env", "--allow-run", "--allow-read",
               "https://raw.githubusercontent.com/raisercostin/mcp-shell/main/src/main.ts"]
    }
  }
}
```

### Codex CLI

Add to `~/.codex/config.json`:

```json
{
  "mcpServers": {
    "shell": {
      "command": "deno",
      "args": ["run", "--allow-env", "--allow-run", "--allow-read",
               "https://raw.githubusercontent.com/raisercostin/mcp-shell/main/src/main.ts"]
    }
  }
}
```

---

## Permanent Config (optional)

After running `configure_shell`, set the env var it gives you so the shell is pre-selected on every restart:

```bash
# Linux / macOS / bashw — add to .bashrc / .zshrc
export MCP_SHELL_CONFIG='{"executable":"/usr/bin/bash","argsPrefix":["-c"],"shell":"bash"}'

# Windows bashw — add to $PROFILE or agent env block
MCP_SHELL_CONFIG={"executable":"D:/path/bashw.exe","argsPrefix":["-c"],"shell":"bash"}
```

Or pass it directly:

```bash
deno run --allow-env --allow-run --allow-read src/main.ts \
  --shell-config '{"executable":"/usr/bin/bash","argsPrefix":["-c"],"shell":"bash"}'
```

---

## Tools

| Tool | Description |
|------|-------------|
| `shell_doctor` | Scan PATH + well-known paths, return all detected shells with versions |
| `configure_shell` | Set active shell by name (from doctor output). Session-scoped. |
| `shell_info` | Full fingerprint: OS, TTY, encoding, capabilities, utilities, env snapshot |
| `run_command` | Run a single command through the configured shell |
| `run_script` | Run a multi-line script through the configured shell |

---

## Tests

```bash
deno test --allow-env --allow-run --allow-read src/
```

39 tests across executor, config, multiconfig, doctor, info suites.
