import type { ShellConfig } from "./executor.ts";

export type { ShellConfig };

export interface LoadConfigOptions {
  /** Raw JSON string, e.g. from a --shell-config CLI flag. Takes priority over env var. */
  shellConfig?: string;
}

/**
 * Load and validate shell configuration.
 *
 * Priority (highest first):
 *   1. options.shellConfig  (CLI arg)
 *   2. MCP_SHELL_CONFIG env var
 *
 * Throws if no config is found, JSON is invalid, or required fields are missing.
 * Never falls back to a default shell — explicit config is mandatory (R5).
 */
export function loadConfig(options: LoadConfigOptions = {}): ShellConfig {
  const raw = options.shellConfig ?? Deno.env.get("MCP_SHELL_CONFIG");

  if (!raw) {
    throw new Error(
      "No shell configuration found. " +
        "Provide --shell-config '<json>' or set MCP_SHELL_CONFIG env var. " +
        "Example: {\"executable\":\"D:/path/bashw.exe\",\"argsPrefix\":[\"-c\"],\"shell\":\"bash\"}",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in shell config: ${raw}`);
  }

  return validateConfig(parsed);
}

function validateConfig(raw: unknown): ShellConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("Shell config must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;

  if (typeof obj["executable"] !== "string" || !obj["executable"]) {
    throw new Error(
      'Shell config missing required field "executable" (absolute path to shell binary)',
    );
  }
  if (!Array.isArray(obj["argsPrefix"])) {
    throw new Error(
      'Shell config missing required field "argsPrefix" (must be an array, e.g. ["-c"])',
    );
  }
  const shell = typeof obj["shell"] === "string" ? obj["shell"] : "unknown";

  return {
    executable: obj["executable"] as string,
    argsPrefix: obj["argsPrefix"] as string[],
    shell,
  };
}
