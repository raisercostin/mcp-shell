#!/usr/bin/env -S deno run --allow-env --allow-run
/**
 * MCP Shell Executor — entry point
 *
 * Usage:
 *   deno run --allow-env --allow-run src/main.ts
 *
 * Config (required — one of):
 *   MCP_SHELL_CONFIG='{"executable":"D:/path/bashw.exe","argsPrefix":["-c"],"shell":"bash"}'
 *   --shell-config '{"executable":"D:/path/bashw.exe","argsPrefix":["-c"],"shell":"bash"}'
 *
 * See issue 001 and practice-gemini-shell-patch.md for context.
 */
import { startServer } from "./server.ts";

// Parse --shell-config from argv
const shellConfigArg = (() => {
  const idx = Deno.args.indexOf("--shell-config");
  return idx >= 0 ? Deno.args[idx + 1] : undefined;
})();

await startServer({ shellConfig: shellConfigArg });
