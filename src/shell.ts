import { Server } from "npm:@modelcontextprotocol/sdk@1.7.0/server/index.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk@1.7.0/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "npm:@modelcontextprotocol/sdk@1.7.0/types.js";

// =============================================================================
// Types
// =============================================================================

/** Shell configuration — mirrors the GEMINI_SHELL_CONFIG shape */
export interface ShellConfig {
  executable: string;
  argsPrefix: string[];
  shell: string;
}

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface DetectedShell {
  name: string;
  executable: string;
  shell: string;
  argsPrefix: string[];
  version: string;
}

export interface TtyInfo {
  stdin: boolean;
  stdout: boolean;
  stderr: boolean;
}

export interface ColorInfo {
  count: number;
  truecolor: boolean;
  ansi256: boolean;
}

export interface ProcessInfo {
  pid: number | null;
  ppid: number | null;
  shlvl: number | null;
}

export interface ShellInfo {
  shellType: string;
  shellBinary: string;
  shellVersion: string;
  shellVersionFull: string;
  osName: string;
  osVersion: string;
  osKernel: string;
  isWSL: boolean;
  isContainer: boolean;
  isCI: boolean;
  isInteractive: boolean;
  isTty: TtyInfo;
  termSize: { cols: number; rows: number } | null;
  termType: string;
  termProgram: string;
  colors: ColorInfo;
  ansiEscapes: boolean;
  encoding: string;
  supportsUtf8: boolean;
  locale: string;
  localeAll: string;
  pathSeparator: string;
  fileSeparator: string;
  lineEnding: "LF" | "CRLF" | "CR" | "unknown";
  heredocSupport: boolean;
  arraySupport: boolean;
  processSubstitution: boolean;
  ansiCQuoting: boolean;
  erexitActive: boolean;
  process: ProcessInfo;
  maxFileDescriptors: number | null;
  tmpDir: string;
  utilities: Record<string, string | null>;
  jvm: Record<string, string> | null;
  env: Record<string, string>;
}

export interface ToolPreferences {
  editor?: string;
  pager?: string;
  finder?: string;
  grep?: string;
  ls?: string;
  [key: string]: string | undefined;
}

export interface MultiShellConfig {
  defaultShell: string;
  shells: Record<string, ShellConfig>;
  preferences?: ToolPreferences;
}

export interface ShellCandidate {
  name: string;
  executable: string;
  argsPrefix: string[];
  shell: string;
}

// =============================================================================
// shell_run — execute a command
// =============================================================================

export async function runCommand(config: ShellConfig, command: string): Promise<CommandResult> {
  const cmd = new Deno.Command(config.executable, {
    args: [...config.argsPrefix, command],
    stdout: "piped",
    stderr: "piped",
  });

  let output: Deno.CommandOutput;
  try {
    output = await cmd.output();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("os error 2") || msg.includes("No such file") || msg.includes("File not found") || msg.includes("ENOENT")) {
      throw new Error(`ENOENT: shell not found: ${config.executable}`);
    }
    throw err;
  }

  const decoder = new TextDecoder();
  return {
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
    exitCode: output.code,
  };
}

// =============================================================================
// Config loading (for MCP_SHELL_CONFIG env var / --shell-config arg)
// =============================================================================

export interface LoadConfigOptions {
  shellConfig?: string;
}

export function loadConfig(options: LoadConfigOptions = {}): ShellConfig {
  const raw = options.shellConfig ?? Deno.env.get("MCP_SHELL_CONFIG");
  if (!raw) {
    throw new Error(
      "No shell configuration found. " +
      "Provide --shell-config '<json>' or set MCP_SHELL_CONFIG env var.",
    );
  }
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`Invalid JSON in shell config: ${raw}`); }
  return _validateShellConfig(parsed);
}

function _validateShellConfig(raw: unknown): ShellConfig {
  if (typeof raw !== "object" || raw === null) throw new Error("Shell config must be a JSON object");
  const obj = raw as Record<string, unknown>;
  if (typeof obj["executable"] !== "string" || !obj["executable"])
    throw new Error('Shell config missing required field "executable"');
  if (!Array.isArray(obj["argsPrefix"]))
    throw new Error('Shell config missing required field "argsPrefix"');
  return {
    executable: obj["executable"] as string,
    argsPrefix: obj["argsPrefix"] as string[],
    shell: typeof obj["shell"] === "string" ? obj["shell"] : "unknown",
  };
}

// =============================================================================
// Multi-shell config
// =============================================================================

export function loadMultiConfig(raw: string): MultiShellConfig {
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error(`Invalid JSON in shell config: ${raw}`); }
  if (typeof parsed !== "object" || parsed === null) throw new Error("Shell config must be a JSON object");
  const obj = parsed as Record<string, unknown>;

  // Backward-compat: single-shell format
  if (typeof obj["executable"] === "string") {
    const shell = typeof obj["shell"] === "string" ? obj["shell"] : "unknown";
    const argsPrefix = Array.isArray(obj["argsPrefix"]) ? (obj["argsPrefix"] as string[]) : [];
    return { defaultShell: shell, shells: { [shell]: { executable: obj["executable"] as string, argsPrefix, shell } } };
  }

  const shellsRaw = obj["shells"];
  if (typeof shellsRaw !== "object" || shellsRaw === null || Array.isArray(shellsRaw))
    throw new Error('Shell config must have a "shells" object');

  const shells: Record<string, ShellConfig> = {};
  for (const [name, entry] of Object.entries(shellsRaw as Record<string, unknown>)) {
    shells[name] = _validateShellEntry(name, entry);
  }
  if (Object.keys(shells).length === 0) throw new Error('"shells" map must not be empty');

  const defaultShell = obj["defaultShell"];
  if (typeof defaultShell !== "string" || !defaultShell) throw new Error('"defaultShell" must be a non-empty string');
  if (!(defaultShell in shells))
    throw new Error(`"defaultShell" is "${defaultShell}" but not in shells. Available: ${Object.keys(shells).join(", ")}`);

  return { defaultShell, shells, preferences: obj["preferences"] as ToolPreferences | undefined };
}

function _validateShellEntry(name: string, raw: unknown): ShellConfig {
  if (typeof raw !== "object" || raw === null) throw new Error(`Shell entry "${name}" must be an object`);
  const obj = raw as Record<string, unknown>;
  if (typeof obj["executable"] !== "string" || !obj["executable"]) throw new Error(`Shell "${name}" missing "executable"`);
  if (!Array.isArray(obj["argsPrefix"])) throw new Error(`Shell "${name}" missing "argsPrefix"`);
  return {
    executable: obj["executable"] as string,
    argsPrefix: obj["argsPrefix"] as string[],
    shell: typeof obj["shell"] === "string" ? obj["shell"] : name,
  };
}

export function getDefaultShell(cfg: MultiShellConfig): ShellConfig { return cfg.shells[cfg.defaultShell]; }
export function getShell(cfg: MultiShellConfig, name: string): ShellConfig | null { return cfg.shells[name] ?? null; }
export function setDefaultShell(cfg: MultiShellConfig, name: string): MultiShellConfig {
  if (!(name in cfg.shells))
    throw new Error(`Cannot set default to "${name}": not found. Available: ${Object.keys(cfg.shells).join(", ")}`);
  return { ...cfg, defaultShell: name };
}

const _BASH_LIKE = new Set(["bash", "zsh", "fish", "sh", "mksh", "dash"]);

export function generateDefaultConfig(candidates: ShellCandidate[]): string {
  const shells: Record<string, ShellConfig> = {};
  for (const c of candidates) shells[c.name] = { executable: c.executable, argsPrefix: c.argsPrefix, shell: c.shell };
  const preferred = candidates.find((c) => _BASH_LIKE.has(c.shell)) ?? candidates[0];
  return JSON.stringify({ defaultShell: preferred.name, shells, preferences: {} }, null, 2);
}

// =============================================================================
// shell_list — detect available shells
// =============================================================================

interface _Probe {
  name: string; shell: string; argsPrefix: string[];
  pathName?: string; localPaths?: string[];
  versionArgs: string[]; versionRe: RegExp;
}

const _PROBES: _Probe[] = [
  { name: "bashw", shell: "bash", argsPrefix: ["-c"],
    localPaths: ["D:/home/raiser-apps/shims/bashw.exe",
      `${Deno.env.get("USERPROFILE") ?? ""}/scoop/shims/bashw.exe`,
      `${Deno.env.get("HOME") ?? ""}/scoop/shims/bashw.exe`],
    versionArgs: ["--version"], versionRe: /version\s+([\d.]+[\w()-]*)/i },
  { name: "bash", shell: "bash", argsPrefix: ["-c"], pathName: "bash",
    localPaths: ["C:/Program Files/Git/usr/bin/bash.exe","C:/msys64/usr/bin/bash.exe","/usr/bin/bash","/bin/bash"],
    versionArgs: ["--version"], versionRe: /version\s+([\d.]+[\w()-]*)/i },
  { name: "git-bash", shell: "bash", argsPrefix: ["-c"],
    localPaths: ["C:/Program Files/Git/bin/bash.exe","C:/Program Files (x86)/Git/bin/bash.exe"],
    versionArgs: ["--version"], versionRe: /version\s+([\d.]+[\w()-]*)/i },
  { name: "zsh", shell: "zsh", argsPrefix: ["-c"], pathName: "zsh",
    localPaths: ["/usr/bin/zsh","/bin/zsh","/usr/local/bin/zsh"],
    versionArgs: ["--version"], versionRe: /zsh\s+([\d.]+)/i },
  { name: "fish", shell: "fish", argsPrefix: ["-c"], pathName: "fish",
    localPaths: ["/usr/bin/fish","/usr/local/bin/fish"],
    versionArgs: ["--version"], versionRe: /fish,?\s+version\s+([\d.]+)/i },
  { name: "pwsh", shell: "pwsh", argsPrefix: ["-Command"], pathName: "pwsh",
    localPaths: ["C:/Program Files/PowerShell/7/pwsh.exe",
      `${Deno.env.get("ProgramFiles") ?? ""}/PowerShell/7/pwsh.exe`],
    versionArgs: ["-NoProfile","-Command","$PSVersionTable.PSVersion.ToString()"], versionRe: /^([\d.]+)/ },
  { name: "powershell", shell: "powershell", argsPrefix: ["-Command"], pathName: "powershell",
    localPaths: [`${Deno.env.get("SystemRoot") ?? "C:/Windows"}/System32/WindowsPowerShell/v1.0/powershell.exe`],
    versionArgs: ["-NoProfile","-Command","$PSVersionTable.PSVersion.ToString()"], versionRe: /^([\d.]+)/ },
  { name: "cmd", shell: "cmd", argsPrefix: ["/c"], pathName: "cmd",
    localPaths: [`${Deno.env.get("SystemRoot") ?? "C:/Windows"}/System32/cmd.exe`],
    versionArgs: ["/c","ver"], versionRe: /(\d+\.\d+[\.\d]*)/ },
  { name: "sh", shell: "sh", argsPrefix: ["-c"], pathName: "sh",
    localPaths: ["/bin/sh","/usr/bin/sh"],
    versionArgs: ["--version"], versionRe: /version\s+([\d.]+[\w()-]*)/i },
];

async function _fileExists(p: string): Promise<boolean> {
  try { return (await Deno.stat(p)).isFile; } catch { return false; }
}

async function _resolveExe(probe: _Probe): Promise<string | null> {
  if (probe.pathName) {
    for (const finder of ["where", "which"]) {
      try {
        const cmd = new Deno.Command(finder, { args: [probe.pathName], stdout: "piped", stderr: "null" });
        const out = await cmd.output();
        if (out.success) {
          const first = new TextDecoder().decode(out.stdout).split(/\r?\n/)[0].trim();
          if (first) return first;
        }
      } catch { /* ignore */ }
    }
  }
  for (const lp of probe.localPaths ?? []) {
    if (lp && await _fileExists(lp)) return lp;
  }
  return null;
}

async function _getVersion(exe: string, probe: _Probe): Promise<string> {
  try {
    const cmd = new Deno.Command(exe, { args: probe.versionArgs, stdout: "piped", stderr: "piped" });
    const out = await cmd.output();
    const combined = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
    const m = combined.match(probe.versionRe);
    return m ? m[1] : combined.split(/\r?\n/)[0].trim().slice(0, 60) || "unknown";
  } catch { return "unknown"; }
}

export async function detectShells(): Promise<DetectedShell[]> {
  const found: DetectedShell[] = [];
  await Promise.all(_PROBES.map(async (probe) => {
    const exe = await _resolveExe(probe);
    if (!exe) return;
    const version = await _getVersion(exe, probe);
    found.push({ name: probe.name, executable: exe, shell: probe.shell, argsPrefix: probe.argsPrefix, version });
  }));
  found.sort((a, b) => _PROBES.findIndex(p => p.name === a.name) - _PROBES.findIndex(p => p.name === b.name));
  return found;
}

export function formatDetectedShells(shells: DetectedShell[]): string {
  if (shells.length === 0) return "No shells detected.";
  const lines = ["Detected shells:\n"];
  for (const s of shells) {
    lines.push(`  ${s.name.padEnd(14)} ${s.executable}`);
    lines.push(`  ${"".padEnd(14)} version: ${s.version}`);
    lines.push(`  ${"".padEnd(14)} argsPrefix: ${JSON.stringify(s.argsPrefix)}`);
    lines.push("");
  }
  lines.push("To configure, call shell_config with one of the names above.");
  return lines.join("\n");
}

// =============================================================================
// shell_status — shell fingerprint
// =============================================================================

function _buildBashProbe(): string {
  return [
    "set +e",
    'echo "SHELL_VERSION=${BASH_VERSION:-${ZSH_VERSION:-${FISH_VERSION:-unknown}}}"',
    'echo "SHELL_0=$0"',
    '[[ $- == *i* ]] && echo "INTERACTIVE=1" || echo "INTERACTIVE=0"',
    '[ -t 0 ] && echo "TTY_STDIN=1" || echo "TTY_STDIN=0"',
    '[ -t 1 ] && echo "TTY_STDOUT=1" || echo "TTY_STDOUT=0"',
    '[ -t 2 ] && echo "TTY_STDERR=1" || echo "TTY_STDERR=0"',
    'echo "TERM_COLS=${COLUMNS:-$(tput cols 2>/dev/null || echo 0)}"',
    'echo "TERM_ROWS=${LINES:-$(tput lines 2>/dev/null || echo 0)}"',
    'echo "TERM_TYPE=${TERM:-}"',
    'echo "TERM_PROGRAM=${TERM_PROGRAM:-${LC_TERMINAL:-}}"',
    'echo "COLOR_COUNT=$(tput colors 2>/dev/null || echo 0)"',
    '[[ "${COLORTERM}" == "truecolor" || "${COLORTERM}" == "24bit" ]] && echo "TRUECOLOR=1" || echo "TRUECOLOR=0"',
    '[[ "${COLORTERM}" == "256color" || $(tput colors 2>/dev/null || echo 0) -ge 256 ]] && echo "ANSI256=1" || echo "ANSI256=0"',
    'echo "LANG=${LANG:-}"',
    'echo "LC_ALL=${LC_ALL:-}"',
    'echo "LOCALE_ALL=$(locale 2>/dev/null | tr "\\n" "|" || echo "")"',
    'printf "a\\nb" > /tmp/_eol_probe 2>/dev/null && sz=$(wc -c < /tmp/_eol_probe 2>/dev/null) && echo "EOL_BYTES=${sz:-0}" || echo "EOL_BYTES=0"',
    'echo "PATH_SEP=:"',
    'echo "FILE_SEP=/"',
    'result=$(cat <<\'HEREDOC_PROBE\'\nok\nHEREDOC_PROBE\n); [ "$result" = "ok" ] && echo "HEREDOC=1" || echo "HEREDOC=0"',
    '(arr=(a b); [ "${arr[0]}" = "a" ]) 2>/dev/null && echo "ARRAYS=1" || echo "ARRAYS=0"',
    '(diff <(echo a) <(echo a)) 2>/dev/null && echo "PROC_SUBST=1" || echo "PROC_SUBST=0"',
    '[ $\'\\n\' = "$(printf "\\n")" ] 2>/dev/null && echo "ANSIC_QUOT=1" || echo "ANSIC_QUOT=0"',
    '[[ $- == *e* ]] && echo "ERREXIT=1" || echo "ERREXIT=0"',
    'echo "PID=$$"',
    'echo "PPID=${PPID:-}"',
    'echo "SHLVL=${SHLVL:-0}"',
    'echo "MAX_FD=$(ulimit -n 2>/dev/null || echo "")"',
    'echo "TMPDIR=${TMPDIR:-${TMP:-${TEMP:-/tmp}}}"',
    'echo "OSTYPE=${OSTYPE:-}"',
    'echo "UNAME=$(uname -s 2>/dev/null || echo "")"',
    'echo "UNAME_R=$(uname -r 2>/dev/null || echo "")"',
    'echo "OS_RELEASE=$(cat /etc/os-release 2>/dev/null | tr "\\n" "|" || echo "")"',
    '[[ -n "${WSL_DISTRO_NAME}" ]] && echo "IS_WSL=1" || echo "IS_WSL=0"',
    '[ -f /.dockerenv ] && echo "IS_CONTAINER=1" || grep -qE "(docker|kubepods|lxc)" /proc/1/cgroup 2>/dev/null && echo "IS_CONTAINER=1" || echo "IS_CONTAINER=0"',
    '[[ -n "${CI:-}" || -n "${GITHUB_ACTIONS:-}" || -n "${JENKINS_HOME:-}" ]] && echo "IS_CI=1" || echo "IS_CI=0"',
    'echo "SHELL_VERSION_FULL=$(bash --version 2>/dev/null | head -1 || echo "")"',
    'for tool in bash zsh fish sh python3 python node deno java jbang rg fd fzf git curl wget jq; do',
    '  p=$(command -v "$tool" 2>/dev/null); echo "UTIL_${tool}=${p:-}"',
    'done',
    'echo "JVM_PROPS=$(java -XshowSettings:property -version 2>&1 | grep -E "(file\\.|line\\.|path\\.|os\\.|native\\.enc|file\\.enc)" | tr "\\n" "|" || echo "")"',
    'printf "\\033[0m" > /dev/null 2>&1 && echo "ANSI_ESCAPES=1" || echo "ANSI_ESCAPES=0"',
  ].join("\n");
}

function _parseKV(output: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    map.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  return map;
}

function _bool(v: string | undefined): boolean { return v === "1" || v?.toLowerCase() === "true"; }
function _num(v: string | undefined): number | null { if (!v) return null; const n = parseInt(v, 10); return isNaN(n) ? null : n; }

export async function getShellInfo(config: ShellConfig): Promise<ShellInfo> {
  const isBashLike = !config.executable.toLowerCase().includes("cmd");
  const result = await runCommand(config, isBashLike ? _buildBashProbe() : [
    "@echo off","echo SHELL_VERSION=cmd","echo TTY_STDIN=0","echo TTY_STDOUT=0","echo TTY_STDERR=0",
    "echo INTERACTIVE=0","echo TERM_COLS=0","echo TERM_ROWS=0","echo PATH_SEP=;","echo FILE_SEP=\\",
    "echo HEREDOC=0","echo ARRAYS=0","echo PROC_SUBST=0","echo ANSIC_QUOT=0","echo ERREXIT=0",
    "echo SHLVL=0","echo OSTYPE=mswin","echo IS_WSL=0","echo IS_CONTAINER=0","echo ANSI_ESCAPES=0",
    `echo TMPDIR=${Deno.env.get("TEMP") ?? "C:\\Temp"}`,
  ].join("\r\n"));

  const kv = _parseKV(result.stdout + "\n" + result.stderr);
  const colorCount = _num(kv.get("COLOR_COUNT")) ?? 0;
  const eolBytes = _num(kv.get("EOL_BYTES")) ?? 0;
  let lineEnding: ShellInfo["lineEnding"] = isBashLike ? (eolBytes === 3 ? "LF" : eolBytes === 4 ? "CRLF" : "unknown") : "CRLF";

  const utilKeys = ["bash","zsh","fish","sh","python3","python","node","deno","java","jbang","rg","fd","fzf","git","curl","wget","jq"];
  const utilities: Record<string, string | null> = {};
  for (const k of utilKeys) { const v = kv.get(`UTIL_${k}`); utilities[k] = v && v !== "" ? v : null; }

  let jvm: Record<string, string> | null = null;
  if (utilities["java"]) {
    const jr = await runCommand(config, "java -XshowSettings:property -version");
    const props: Record<string, string> = {};
    for (const line of (jr.stdout + "\n" + jr.stderr).split(/\r?\n/)) {
      const m = line.match(/^\s+([\w.]+)\s+=\s+(.*)$/);
      if (m) props[m[1]] = m[2].trim();
    }
    jvm = Object.keys(props).length > 0 ? props : null;
  }

  return {
    shellType: config.shell ?? "unknown", shellBinary: config.executable,
    shellVersion: kv.get("SHELL_VERSION") ?? "unknown", shellVersionFull: kv.get("SHELL_VERSION_FULL") ?? "",
    osName: jvm?.["os.name"] ?? kv.get("UNAME") ?? kv.get("OSTYPE") ?? "unknown",
    osVersion: jvm?.["os.version"] ?? kv.get("UNAME_R") ?? "",
    osKernel: kv.get("UNAME_R") ?? kv.get("UNAME") ?? "",
    isWSL: _bool(kv.get("IS_WSL")), isContainer: _bool(kv.get("IS_CONTAINER")), isCI: _bool(kv.get("IS_CI")),
    isInteractive: _bool(kv.get("INTERACTIVE")),
    isTty: { stdin: _bool(kv.get("TTY_STDIN")), stdout: _bool(kv.get("TTY_STDOUT")), stderr: _bool(kv.get("TTY_STDERR")) },
    termSize: (() => { const c = _num(kv.get("TERM_COLS")); const r = _num(kv.get("TERM_ROWS")); return c && r && c > 0 && r > 0 ? { cols: c, rows: r } : null; })(),
    termType: kv.get("TERM_TYPE") ?? "", termProgram: kv.get("TERM_PROGRAM") ?? "",
    colors: { count: colorCount, truecolor: _bool(kv.get("TRUECOLOR")), ansi256: _bool(kv.get("ANSI256")) || colorCount >= 256 },
    ansiEscapes: _bool(kv.get("ANSI_ESCAPES")),
    encoding: jvm?.["file.encoding"] ?? kv.get("LANG") ?? "unknown",
    supportsUtf8: (kv.get("LANG") ?? "").toLowerCase().includes("utf"),
    locale: kv.get("LANG") ?? "", localeAll: (kv.get("LOCALE_ALL") ?? "").replace(/\|/g, "\n"),
    pathSeparator: kv.get("PATH_SEP") ?? (isBashLike ? ":" : ";"),
    fileSeparator: kv.get("FILE_SEP") ?? (isBashLike ? "/" : "\\"),
    lineEnding,
    heredocSupport: _bool(kv.get("HEREDOC")), arraySupport: _bool(kv.get("ARRAYS")),
    processSubstitution: _bool(kv.get("PROC_SUBST")), ansiCQuoting: _bool(kv.get("ANSIC_QUOT")),
    erexitActive: _bool(kv.get("ERREXIT")),
    process: { pid: _num(kv.get("PID")), ppid: _num(kv.get("PPID")), shlvl: _num(kv.get("SHLVL")) },
    maxFileDescriptors: _num(kv.get("MAX_FD")), tmpDir: kv.get("TMPDIR") ?? "",
    utilities, jvm, env: Deno.env.toObject(),
  };
}

export function formatShellInfo(info: ShellInfo): string {
  const lines: string[] = [];
  const s = (label: string, val: unknown) => lines.push(`${label.padEnd(28)} ${val}`);
  lines.push("=== Shell Identity ===");
  s("Shell type:", info.shellType); s("Shell binary:", info.shellBinary);
  s("Shell version:", info.shellVersion);
  if (info.shellVersionFull) s("Version full:", info.shellVersionFull);
  lines.push("\n=== Operating System ===");
  s("OS name:", info.osName); s("OS version:", info.osVersion); s("OS kernel:", info.osKernel);
  s("WSL:", info.isWSL); s("Container:", info.isContainer); s("CI:", info.isCI);
  lines.push("\n=== Interactivity ===");
  s("Interactive:", info.isInteractive);
  s("TTY stdin/out/err:", `${info.isTty.stdin}/${info.isTty.stdout}/${info.isTty.stderr}`);
  s("Terminal size:", info.termSize ? `${info.termSize.cols}x${info.termSize.rows}` : "n/a");
  lines.push("\n=== Terminal / Display ===");
  s("TERM:", info.termType); s("TERM_PROGRAM:", info.termProgram);
  s("Colors (count):", info.colors.count); s("True-color:", info.colors.truecolor);
  s("256-color:", info.colors.ansi256); s("ANSI escapes:", info.ansiEscapes);
  lines.push("\n=== Encoding ===");
  s("Encoding:", info.encoding); s("UTF-8:", info.supportsUtf8); s("Locale:", info.locale);
  lines.push("\n=== Filesystem / Path model ===");
  s("File separator:", JSON.stringify(info.fileSeparator));
  s("Path separator:", JSON.stringify(info.pathSeparator));
  s("Line ending:", info.lineEnding);
  lines.push("\n=== Shell Capabilities ===");
  s("Heredoc:", info.heredocSupport); s("Arrays:", info.arraySupport);
  s("Process substitution:", info.processSubstitution);
  s("ANSI-C quoting $'...':", info.ansiCQuoting); s("errexit active:", info.erexitActive);
  lines.push("\n=== Process ===");
  s("PID:", info.process.pid); s("PPID:", info.process.ppid); s("SHLVL:", info.process.shlvl);
  s("Max file descriptors:", info.maxFileDescriptors); s("Temp dir:", info.tmpDir);
  lines.push("\n=== Available Utilities ===");
  for (const [k, v] of Object.entries(info.utilities)) s(`  ${k}:`, v ?? "(not found)");
  if (info.jvm) {
    lines.push("\n=== JVM Properties ===");
    for (const [k, v] of Object.entries(info.jvm)) s(`  ${k}:`, v);
  }
  lines.push("\n=== Environment (snapshot) ===");
  for (const k of Object.keys(info.env).sort()) lines.push(`  ${k}=${info.env[k]}`);
  return lines.join("\n");
}

// =============================================================================
// MCP Server
// =============================================================================

const NOT_CONFIGURED =
  "No shell configured. Call `shell_list` to see available shells, " +
  "then call `shell_config` with the name of the shell you want to use.";

function _textContent(text: string) { return { content: [{ type: "text", text }] }; }
function _resultText(r: CommandResult) {
  return [
    `exit_code: ${r.exitCode}`,
    r.stdout ? `stdout:\n${r.stdout}` : "stdout: (empty)",
    r.stderr ? `stderr:\n${r.stderr}` : "stderr: (empty)",
  ].join("\n");
}

export function createServer(initialConfig?: ShellConfig) {
  let shellConfig: ShellConfig | null = initialConfig ?? null;

  const server = new Server(
    { name: "mcp-shell", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: "shell_list",
        description: "List all shells available on this machine (checks PATH and well-known local paths). Returns names, paths, and versions. Pass a name to shell_config to activate one.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "shell_config",
        description: "Set the active shell for this session. Use a name returned by shell_list. To make it permanent, set MCP_SHELL_CONFIG in your environment.",
        inputSchema: {
          type: "object",
          properties: { name: { type: "string", description: "Shell name from shell_list (e.g. 'bashw', 'bash', 'cmd')" } },
          required: ["name"],
        },
      },
      {
        name: "shell_status",
        description: "Get comprehensive info about the configured shell: OS, version, TTY, encoding, line endings, capabilities (heredoc, arrays, process substitution), available utilities, JVM properties, and full env snapshot. Requires a shell to be configured first.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "shell_run",
        description: shellConfig
          ? `Run a shell command or multi-line script via ${shellConfig.shell} (${shellConfig.executable}). Returns stdout, stderr, exit_code.`
          : `Run a shell command or script. ${NOT_CONFIGURED}`,
        inputSchema: {
          type: "object",
          properties: { command: { type: "string", description: "The shell command or multi-line script to execute" } },
          required: ["command"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === "shell_list") {
      return _textContent(formatDetectedShells(await detectShells()));
    }

    if (name === "shell_config") {
      const selectedName = (args as { name: string }).name;
      const shells = await detectShells();
      const found = shells.find((s) => s.name === selectedName);
      if (!found) {
        return _textContent(`Shell "${selectedName}" not found. Available: ${shells.map(s => s.name).join(", ")}\nRun shell_list to see the full list.`);
      }
      shellConfig = { executable: found.executable, argsPrefix: found.argsPrefix, shell: found.shell };
      const envJson = JSON.stringify(shellConfig);
      return _textContent(
        `✓ Shell configured: ${found.name} (${found.executable}) version ${found.version}\n\n` +
        `To make this permanent, set in your shell profile:\n  MCP_SHELL_CONFIG='${envJson}'\n\n` +
        `Or in your agent config env:\n  "MCP_SHELL_CONFIG": ${JSON.stringify(envJson)}`,
      );
    }

    if (name === "shell_status") {
      if (!shellConfig) return _textContent(NOT_CONFIGURED);
      return _textContent(formatShellInfo(await getShellInfo(shellConfig)));
    }

    if (name === "shell_run") {
      if (!shellConfig) return _textContent(NOT_CONFIGURED);
      return _textContent(_resultText(await runCommand(shellConfig, (args as { command: string }).command)));
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}

export async function startServer(initialConfig?: ShellConfig) {
  const server = createServer(initialConfig);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
