#!/usr/bin/env -S deno run --allow-env --allow-run --allow-read
/**
 * mcp-shell — entry point
 *
 * Config (optional — if omitted, call shell_list then shell_config at runtime):
 *   MCP_SHELL_CONFIG='{"executable":"/usr/bin/bash","argsPrefix":["-c"],"shell":"bash"}'
 *   --shell-config '{"executable":"/usr/bin/bash","argsPrefix":["-c"],"shell":"bash"}'
 */
import { startServer, type ShellConfig } from "./shell.ts";

function tryLoadConfig(): ShellConfig | undefined {
  const raw = (() => {
    const idx = Deno.args.indexOf("--shell-config");
    return idx >= 0 ? Deno.args[idx + 1] : Deno.env.get("MCP_SHELL_CONFIG");
  })();
  if (!raw) return undefined;
  try {
    const obj = JSON.parse(raw) as Record<string, unknown>;
    if (typeof obj.executable === "string" && Array.isArray(obj.argsPrefix)) {
      return { executable: obj.executable, argsPrefix: obj.argsPrefix as string[], shell: (obj.shell as string) ?? "unknown" };
    }
  } catch { /* invalid JSON — ignore, start unconfigured */ }
  return undefined;
}

await startServer(tryLoadConfig());
