import type { ShellConfig } from "./executor.ts";

export type { ShellConfig };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Tool-preference overrides that can be embedded in the config file. */
export interface ToolPreferences {
  /** Preferred text editor command (e.g. "code", "vim") */
  editor?: string;
  /** Preferred pager (e.g. "bat", "less") */
  pager?: string;
  /** Preferred find tool (e.g. "fd", "find") */
  finder?: string;
  /** Preferred grep tool (e.g. "rg", "grep") */
  grep?: string;
  /** Preferred ls tool (e.g. "eza", "lsd", "ls") */
  ls?: string;
  /** Additional arbitrary overrides */
  [key: string]: string | undefined;
}

/**
 * Multi-shell configuration — the canonical on-disk format.
 * Single-shell JSON (old format) is wrapped into this shape on load.
 */
export interface MultiShellConfig {
  /** Key of the shell to use when no explicit shell is selected. */
  defaultShell: string;
  /** Named shell definitions. */
  shells: Record<string, ShellConfig>;
  /** Tool-preference overrides (optional). */
  preferences?: ToolPreferences;
}

// ---------------------------------------------------------------------------
// Load / validate
// ---------------------------------------------------------------------------

export function loadMultiConfig(raw: string): MultiShellConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid JSON in shell config: ${raw}`);
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Shell config must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  // Backward-compat: single-shell format (has "executable" at the top level)
  if (typeof obj["executable"] === "string") {
    const shell = typeof obj["shell"] === "string" ? obj["shell"] : "unknown";
    const argsPrefix = Array.isArray(obj["argsPrefix"])
      ? (obj["argsPrefix"] as string[])
      : [];
    return {
      defaultShell: shell,
      shells: {
        [shell]: { executable: obj["executable"] as string, argsPrefix, shell },
      },
    };
  }

  // Multi-shell format
  const shellsRaw = obj["shells"];
  if (
    typeof shellsRaw !== "object" ||
    shellsRaw === null ||
    Array.isArray(shellsRaw)
  ) {
    throw new Error('Shell config must have a "shells" object');
  }

  const shells: Record<string, ShellConfig> = {};
  for (const [name, entry] of Object.entries(shellsRaw as Record<string, unknown>)) {
    shells[name] = validateShellEntry(name, entry);
  }

  if (Object.keys(shells).length === 0) {
    throw new Error('"shells" map must not be empty');
  }

  const defaultShell = obj["defaultShell"];
  if (typeof defaultShell !== "string" || !defaultShell) {
    throw new Error('"defaultShell" must be a non-empty string');
  }
  if (!(defaultShell in shells)) {
    throw new Error(
      `"defaultShell" is "${defaultShell}" but no shell with that name exists in "shells". ` +
        `Available: ${Object.keys(shells).join(", ")}`,
    );
  }

  const preferences = obj["preferences"] as ToolPreferences | undefined;

  return { defaultShell, shells, preferences };
}

function validateShellEntry(name: string, raw: unknown): ShellConfig {
  if (typeof raw !== "object" || raw === null) {
    throw new Error(`Shell entry "${name}" must be an object`);
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj["executable"] !== "string" || !obj["executable"]) {
    throw new Error(`Shell "${name}" missing required field "executable"`);
  }
  if (!Array.isArray(obj["argsPrefix"])) {
    throw new Error(`Shell "${name}" missing required field "argsPrefix"`);
  }
  const shell = typeof obj["shell"] === "string" ? obj["shell"] : name;
  return {
    executable: obj["executable"] as string,
    argsPrefix: obj["argsPrefix"] as string[],
    shell,
  };
}

// ---------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------

export function getDefaultShell(cfg: MultiShellConfig): ShellConfig {
  return cfg.shells[cfg.defaultShell];
}

export function getShell(
  cfg: MultiShellConfig,
  name: string,
): ShellConfig | null {
  return cfg.shells[name] ?? null;
}

export function setDefaultShell(
  cfg: MultiShellConfig,
  name: string,
): MultiShellConfig {
  if (!(name in cfg.shells)) {
    throw new Error(
      `Cannot set default to "${name}": not found in shells. ` +
        `Available: ${Object.keys(cfg.shells).join(", ")}`,
    );
  }
  return { ...cfg, defaultShell: name };
}

// ---------------------------------------------------------------------------
// Config generation
// ---------------------------------------------------------------------------

/** Candidate shell descriptor used by the doctor and tests. */
export interface ShellCandidate {
  name: string;
  executable: string;
  argsPrefix: string[];
  shell: string;
}

const BASH_LIKE = new Set(["bash", "zsh", "fish", "sh", "mksh", "dash"]);

/**
 * Generate a MultiShellConfig JSON string from a list of detected candidates.
 * Prefers a bash-like shell as default when available.
 */
export function generateDefaultConfig(candidates: ShellCandidate[]): string {
  const shells: Record<string, ShellConfig> = {};
  for (const c of candidates) {
    shells[c.name] = { executable: c.executable, argsPrefix: c.argsPrefix, shell: c.shell };
  }

  // Pick default: first bash-like, otherwise first candidate
  const preferred = candidates.find((c) => BASH_LIKE.has(c.shell)) ?? candidates[0];

  const cfg: MultiShellConfig = {
    defaultShell: preferred.name,
    shells,
    preferences: {
      editor: undefined,
      pager: undefined,
      finder: undefined,
      grep: undefined,
      ls: undefined,
    },
  };

  return JSON.stringify(cfg, null, 2);
}
