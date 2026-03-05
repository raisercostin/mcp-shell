// =============================================================================
// Types
// =============================================================================

export interface WhoAmI {
  model: string | null;
  agentRuntime: string | null;
  ide: string | null;
  os: string;
  shell: string | null;
  mcpTransport: "stdio" | "sse" | "unknown";
  configPaths: Record<string, string>;
}

// =============================================================================
// detectOs
// =============================================================================

export function detectOs(): string {
  const os = Deno.build.os;
  if (os === "windows") return "windows";
  if (os === "darwin") return "macos";
  if (os === "linux") return "linux";
  return os ?? "unknown";
}

// =============================================================================
// detectIde
// =============================================================================

export function detectIde(env: Record<string, string | undefined>): string | null {
  if (env["CURSOR_TRACE_ID"] || env["CURSOR_SESSION_ID"]) return "cursor";
  if (
    env["VSCODE_PID"] ||
    env["VSCODE_INJECTION"] ||
    env["VSCODE_IPC_HOOK"] ||
    env["TERM_PROGRAM"] === "vscode"
  ) return "vscode";
  if (env["JETBRAINS_REMOTE_DEV_LAUNCHER_NAME"] || env["IDEA_INITIAL_DIRECTORY"]) return "jetbrains";
  return null;
}

// =============================================================================
// detectAgentRuntime
// =============================================================================

export function detectAgentRuntime(env: Record<string, string | undefined>): string | null {
  if (env["GITHUB_ACTIONS"]) return "github-actions";
  if (env["COPILOT_CLI"] || env["GITHUB_COPILOT_TOKEN"] || env["COPILOT_AGENT_VERSION"]) return "copilot-cli";
  if (env["CURSOR_TRACE_ID"] || env["CURSOR_SESSION_ID"]) return "cursor";
  if (env["VSCODE_PID"] || env["VSCODE_INJECTION"] || env["VSCODE_IPC_HOOK"]) return "vscode-copilot";
  return null;
}

// =============================================================================
// detectConfigPaths — only returns paths that exist on disk
// =============================================================================

async function _fileExists(p: string): Promise<boolean> {
  try { return (await Deno.stat(p)).isFile; } catch { return false; }
}

export async function detectConfigPaths(): Promise<Record<string, string>> {
  const home = Deno.env.get("USERPROFILE") ?? Deno.env.get("HOME") ?? "";
  const appData = Deno.env.get("APPDATA") ?? "";
  const localAppData = Deno.env.get("LOCALAPPDATA") ?? "";
  const vscodePoratable = Deno.env.get("VSCODE_PORTABLE") ?? "";

  const candidates: Record<string, string[]> = {
    copilotCli: [
      `${home}/.copilot/mcp-config.json`,
    ],
    vscode: [
      vscodePoratable ? `${vscodePoratable}/user-data/User/mcp.json` : "",
      `${appData}/Code/User/mcp.json`,
      `${home}/.config/Code/User/mcp.json`,
      `${home}/Library/Application Support/Code/User/mcp.json`,
    ],
    vscodium: [
      `${appData}/VSCodium/User/mcp.json`,
      `${home}/.config/VSCodium/User/mcp.json`,
    ],
    cursor: [
      `${appData}/Cursor/User/mcp.json`,
      `${home}/.cursor/mcp.json`,
      `${home}/.config/Cursor/User/mcp.json`,
    ],
    claudeDesktop: [
      `${appData}/Claude/claude_desktop_config.json`,
      `${home}/Library/Application Support/Claude/claude_desktop_config.json`,
      `${home}/.config/Claude/claude_desktop_config.json`,
    ],
    continue: [
      `${home}/.continue/config.json`,
    ],
  };

  // Also check VSCODE_PORTABLE env (portable installs)
  if (vscodePoratable) {
    candidates["vscode"].unshift(`${vscodePoratable}/user-data/User/mcp.json`);
  }

  const result: Record<string, string> = {};
  for (const [key, paths] of Object.entries(candidates)) {
    for (const p of paths) {
      if (p && await _fileExists(p)) {
        result[key] = p;
        break;
      }
    }
  }
  return result;
}

// =============================================================================
// whoAmI
// =============================================================================

export async function whoAmI(currentShell?: string | null): Promise<WhoAmI> {
  const env = Deno.env.toObject();
  return {
    model: null, // cannot be determined from env alone
    agentRuntime: detectAgentRuntime(env),
    ide: detectIde(env),
    os: detectOs(),
    shell: currentShell ?? null,
    mcpTransport: "stdio", // MCP stdio servers are always stdio
    configPaths: await detectConfigPaths(),
  };
}

// =============================================================================
// formatWhoAmI
// =============================================================================

export function formatWhoAmI(info: WhoAmI): string {
  const lines: string[] = [];
  const s = (label: string, val: unknown) => lines.push(`${label.padEnd(20)} ${val ?? "(unknown)"}`);
  lines.push("=== Who Am I ===");
  s("OS:", info.os);
  s("IDE:", info.ide);
  s("Agent runtime:", info.agentRuntime);
  s("Model:", info.model);
  s("Shell:", info.shell);
  s("MCP transport:", info.mcpTransport);
  lines.push("\n=== MCP Config Files ===");
  if (Object.keys(info.configPaths).length === 0) {
    lines.push("  (none found)");
  } else {
    for (const [k, v] of Object.entries(info.configPaths)) {
      lines.push(`  ${k.padEnd(16)} ${v}`);
    }
  }
  return lines.join("\n");
}
