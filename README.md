# mcp-shell

MCP stdio server that runs commands through **your chosen shell**, not the agent's default.

Solves the Windows problem: agents default to `powershell.exe`, this gives you `bash` (bashw/MinGW64), `zsh`, or any other shell.

## Prerequisites

**[Deno](https://deno.com)** — the only dependency.

```bash
irm https://deno.land/install.ps1 | iex        # Windows
curl -fsSL https://deno.land/install.sh | sh   # macOS/Linux
```

## Tools

| Tool | Description |
|------|-------------|
| `shell_list` | List all detected shells (PATH + well-known paths) with versions |
| `shell_config` | Set active shell by name from `shell_list` output |
| `shell_status` | Full shell fingerprint: OS, TTY, encoding, capabilities, utilities, env |
| `shell_run` | Run a command or multi-line script through the configured shell |

No config needed to start — call `shell_list` then `shell_config` at runtime.
To persist, set `MCP_SHELL_CONFIG` (the value is shown after `shell_config`).

## Install

### GitHub Copilot CLI

`C:\Users\<you>\.copilot\mcp-config.json`:
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

### VS Code Copilot

`~/.vscode/User/mcp.json` (or `.vscode/mcp.json` in project):
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

### Claude

```bash
claude mcp add shell -- deno run --allow-env --allow-run --allow-read \
  https://raw.githubusercontent.com/raisercostin/mcp-shell/main/src/main.ts
```

### Gemini / Codex

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

## Permanent Config (optional)

```bash
export MCP_SHELL_CONFIG='{"executable":"/usr/bin/bash","argsPrefix":["-c"],"shell":"bash"}'
# Windows: {"executable":"D:/path/bashw.exe","argsPrefix":["-c"],"shell":"bash"}
```

## Tests

```bash
deno test --allow-env --allow-run --allow-read src/
```
