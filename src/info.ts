import { runCommand, type ShellConfig } from "./executor.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TtyInfo {
  stdin: boolean;
  stdout: boolean;
  stderr: boolean;
}

export interface ColorInfo {
  /** Number of colours reported by tput/COLORTERM (0 = none / unknown) */
  count: number;
  /** Whether the terminal advertises 24-bit true-colour */
  truecolor: boolean;
  /** Whether the terminal advertises 256-colour mode */
  ansi256: boolean;
}

export interface ProcessInfo {
  pid: number | null;
  ppid: number | null;
  /** Shell nesting level ($SHLVL) */
  shlvl: number | null;
}

/**
 * Comprehensive shell environment fingerprint.
 * Designed to answer: "what exactly is this shell capable of and how does it behave?"
 */
export interface ShellInfo {
  // --- Identity ---
  shellType: string;
  shellBinary: string;
  /** Short version string (e.g. "5.2.15(1)-release") */
  shellVersion: string;
  /** Full version detail (multi-line, e.g. from `bash --version`) */
  shellVersionFull: string;

  // --- OS ---
  /** OS name (e.g. "Windows 10 Pro", "Ubuntu 22.04.3 LTS") */
  osName: string;
  /** OS version string */
  osVersion: string;
  /** OS kernel / build string */
  osKernel: string;
  /** Whether the shell is running inside WSL */
  isWSL: boolean;
  /** Whether running inside a container (Docker/podman/LXC) */
  isContainer: boolean;
  /** Whether a CI environment variable is set */
  isCI: boolean;

  // --- Interactivity ---
  isInteractive: boolean;
  isTty: TtyInfo;
  termSize: { cols: number; rows: number } | null;

  // --- Terminal / Display ---
  termType: string;
  termProgram: string;
  colors: ColorInfo;
  /** Whether ANSI escape sequences appear to work (\x1b[0m reset) */
  ansiEscapes: boolean;

  // --- Encoding ---
  encoding: string;
  supportsUtf8: boolean;
  locale: string;
  localeAll: string;

  // --- Path / Filesystem model ---
  pathSeparator: string;
  fileSeparator: string;
  lineEnding: "LF" | "CRLF" | "CR" | "unknown";

  // --- Shell capabilities ---
  /** Whether the shell supports heredoc (<<EOF) */
  heredocSupport: boolean;
  /** Whether the shell supports bash-style arrays */
  arraySupport: boolean;
  /** Whether process substitution <() works */
  processSubstitution: boolean;
  /** Whether $'...' ANSI-C quoting is supported */
  ansiCQuoting: boolean;
  /** Whether `set -e` / errexit is currently active */
  erexitActive: boolean;

  // --- Process info ---
  process: ProcessInfo;

  // --- Resource limits ---
  maxFileDescriptors: number | null;
  tmpDir: string;

  // --- Available utilities (best-effort which-check) ---
  utilities: Record<string, string | null>;

  // --- JVM properties (if java is on PATH) ---
  jvm: Record<string, string> | null;

  // --- Full environment snapshot ---
  env: Record<string, string>;
}

// ---------------------------------------------------------------------------
// Probe scripts
// ---------------------------------------------------------------------------

// NOTE: All bash ${VAR} parameter expansions use \${VAR} so TypeScript template
// literals do not misinterpret them as interpolations.

/** Probe script for bash-family shells. Outputs KEY=VALUE lines. */
function buildBashProbe(): string {
  return [
    "set +e",
    // identity
    'echo "SHELL_VERSION=${BASH_VERSION:-${ZSH_VERSION:-${FISH_VERSION:-unknown}}}"',
    'echo "SHELL_0=$0"',
    // interactivity
    '[[ $- == *i* ]] && echo "INTERACTIVE=1" || echo "INTERACTIVE=0"',
    // TTY
    '[ -t 0 ] && echo "TTY_STDIN=1" || echo "TTY_STDIN=0"',
    '[ -t 1 ] && echo "TTY_STDOUT=1" || echo "TTY_STDOUT=0"',
    '[ -t 2 ] && echo "TTY_STDERR=1" || echo "TTY_STDERR=0"',
    // terminal size
    'echo "TERM_COLS=${COLUMNS:-$(tput cols 2>/dev/null || echo 0)}"',
    'echo "TERM_ROWS=${LINES:-$(tput lines 2>/dev/null || echo 0)}"',
    // terminal identity
    'echo "TERM_TYPE=${TERM:-}"',
    'echo "TERM_PROGRAM=${TERM_PROGRAM:-${LC_TERMINAL:-}}"',
    // colors
    'echo "COLOR_COUNT=$(tput colors 2>/dev/null || echo 0)"',
    '[[ "${COLORTERM}" == "truecolor" || "${COLORTERM}" == "24bit" ]] && echo "TRUECOLOR=1" || echo "TRUECOLOR=0"',
    '[[ "${COLORTERM}" == "256color" || $(tput colors 2>/dev/null || echo 0) -ge 256 ]] && echo "ANSI256=1" || echo "ANSI256=0"',
    // encoding / locale
    'echo "LANG=${LANG:-}"',
    'echo "LC_ALL=${LC_ALL:-}"',
    'echo "LOCALE_ALL=$(locale 2>/dev/null | tr "\\n" "|" || echo "")"',
    // EOL probe: write a file with a single newline, check its byte size
    'printf "a\\nb" > /tmp/_eol_probe 2>/dev/null && sz=$(wc -c < /tmp/_eol_probe 2>/dev/null) && echo "EOL_BYTES=${sz:-0}" || echo "EOL_BYTES=0"',
    // path/file separators
    'echo "PATH_SEP=:"',
    'echo "FILE_SEP=/"',
    // capabilities
    // heredoc
    'result=$(cat <<\'HEREDOC_PROBE\'',
    'ok',
    'HEREDOC_PROBE',
    '); [ "$result" = "ok" ] && echo "HEREDOC=1" || echo "HEREDOC=0"',
    // arrays
    '(arr=(a b); [ "${arr[0]}" = "a" ]) 2>/dev/null && echo "ARRAYS=1" || echo "ARRAYS=0"',
    // process substitution
    '(diff <(echo a) <(echo a)) 2>/dev/null && echo "PROC_SUBST=1" || echo "PROC_SUBST=0"',
    // ANSI-C quoting
    '[ $\'\\n\' = "$(printf "\\n")" ] 2>/dev/null && echo "ANSIC_QUOT=1" || echo "ANSIC_QUOT=0"',
    // errexit
    '[[ $- == *e* ]] && echo "ERREXIT=1" || echo "ERREXIT=0"',
    // process info
    'echo "PID=$$"',
    'echo "PPID=${PPID:-}"',
    'echo "SHLVL=${SHLVL:-0}"',
    // resource limits
    'echo "MAX_FD=$(ulimit -n 2>/dev/null || echo "")"',
    // tmp
    'echo "TMPDIR=${TMPDIR:-${TMP:-${TEMP:-/tmp}}}"',
    // OS info
    'echo "OSTYPE=${OSTYPE:-}"',
    'echo "UNAME=$(uname -s 2>/dev/null || echo "")"',
    'echo "UNAME_R=$(uname -r 2>/dev/null || echo "")"',
    'echo "OS_RELEASE=$(cat /etc/os-release 2>/dev/null | tr "\\n" "|" || echo "")"',
    // WSL
    '[[ -n "${WSL_DISTRO_NAME}" ]] && echo "IS_WSL=1" || echo "IS_WSL=0"',
    // container
    '[ -f /.dockerenv ] && echo "IS_CONTAINER=1" || grep -qE "(docker|kubepods|lxc)" /proc/1/cgroup 2>/dev/null && echo "IS_CONTAINER=1" || echo "IS_CONTAINER=0"',
    // CI
    '[[ -n "${CI:-}" || -n "${GITHUB_ACTIONS:-}" || -n "${JENKINS_HOME:-}" ]] && echo "IS_CI=1" || echo "IS_CI=0"',
    // shell version full
    'echo "SHELL_VERSION_FULL=$(bash --version 2>/dev/null | head -1 || echo "")"',
    // utilities (which-check)
    'for tool in bash zsh fish sh python3 python node deno java jbang rg fd fzf git curl wget jq; do',
    '  p=$(command -v "$tool" 2>/dev/null); echo "UTIL_${tool}=${p:-}"',
    'done',
    // JVM properties
    'echo "JVM_PROPS=$(java -XshowSettings:property -version 2>&1 | grep -E "(file\\.|line\\.|path\\.|os\\.|native\\.enc|file\\.enc)" | tr "\\n" "|" || echo "")"',
    // ANSI escape
    'printf "\\033[0m" > /dev/null 2>&1 && echo "ANSI_ESCAPES=1" || echo "ANSI_ESCAPES=0"',
  ].join("\n");
}

/** Probe for cmd.exe. Outputs KEY=VALUE lines. */
function buildCmdProbe(): string {
  return [
    "@echo off",
    "echo SHELL_VERSION=cmd",
    "echo TTY_STDIN=0",
    "echo TTY_STDOUT=0",
    "echo TTY_STDERR=0",
    "echo INTERACTIVE=0",
    "echo TERM_COLS=0",
    "echo TERM_ROWS=0",
    "echo TERM_TYPE=%TERM%",
    "echo TERM_PROGRAM=%TERM_PROGRAM%",
    "echo COLOR_COUNT=0",
    "echo TRUECOLOR=0",
    "echo ANSI256=0",
    "echo LANG=%LANG%",
    "echo LC_ALL=%LC_ALL%",
    "echo LOCALE_ALL=%LANG%",
    "echo EOL_BYTES=3",
    "echo PATH_SEP=;",
    "echo FILE_SEP=\\",
    "echo HEREDOC=0",
    "echo ARRAYS=0",
    "echo PROC_SUBST=0",
    "echo ANSIC_QUOT=0",
    "echo ERREXIT=0",
    "echo SHLVL=0",
    "echo TMPDIR=%TEMP%",
    "echo OSTYPE=mswin",
    "echo IS_WSL=0",
    "echo IS_CONTAINER=0",
    "echo IS_CI=%CI%",
    "echo ANSI_ESCAPES=0",
    "ver",
  ].join("\r\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseKV(output: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    map.set(line.slice(0, eq).trim(), line.slice(eq + 1).trim());
  }
  return map;
}

function bool(v: string | undefined): boolean {
  return v === "1" || v?.toLowerCase() === "true" || v?.toLowerCase() === "yes";
}

function num(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return isNaN(n) ? null : n;
}

// ---------------------------------------------------------------------------
// JVM properties
// ---------------------------------------------------------------------------

async function fetchJvmProps(
  config: ShellConfig,
): Promise<Record<string, string> | null> {
  const result = await runCommand(config, "java -XshowSettings:property -version");
  if (result.exitCode !== 0 && result.exitCode !== 1) return null;
  const combined = result.stdout + "\n" + result.stderr;
  const props: Record<string, string> = {};
  for (const line of combined.split(/\r?\n/)) {
    const m = line.match(/^\s+([\w.]+)\s+=\s+(.*)$/);
    if (m) props[m[1]] = m[2].trim();
  }
  return Object.keys(props).length > 0 ? props : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getShellInfo(config: ShellConfig): Promise<ShellInfo> {
  const isBashLike = !config.executable.toLowerCase().includes("cmd");
  const probeScript = isBashLike ? buildBashProbe() : buildCmdProbe();

  // Run probe via the configured shell
  const result = await runCommand(config, probeScript);

  const kv = parseKV(result.stdout + "\n" + result.stderr);

  // --- colors ---
  const colorCount = num(kv.get("COLOR_COUNT")) ?? 0;
  const colors: ColorInfo = {
    count: colorCount,
    truecolor: bool(kv.get("TRUECOLOR")),
    ansi256: bool(kv.get("ANSI256")) || colorCount >= 256,
  };

  // --- line ending ---
  const eolBytes = num(kv.get("EOL_BYTES")) ?? 0;
  let lineEnding: ShellInfo["lineEnding"] = "unknown";
  if (isBashLike) {
    // printf "a\nb" = 3 bytes on LF, 4 on CRLF
    if (eolBytes === 3) lineEnding = "LF";
    else if (eolBytes === 4) lineEnding = "CRLF";
  } else {
    lineEnding = "CRLF"; // cmd.exe always CRLF
  }

  // --- utilities ---
  const utilKeys = [
    "bash","zsh","fish","sh","python3","python","node","deno",
    "java","jbang","rg","fd","fzf","git","curl","wget","jq",
  ];
  const utilities: Record<string, string | null> = {};
  for (const k of utilKeys) {
    const v = kv.get(`UTIL_${k}`);
    utilities[k] = v && v !== "" ? v : null;
  }

  // --- JVM (separate invocation if java available) ---
  const javaPath = utilities["java"];
  let jvm: Record<string, string> | null = null;
  if (javaPath) {
    jvm = await fetchJvmProps(config);
  }

  // --- OS details (merge probe + JVM) ---
  const osName =
    jvm?.["os.name"] ??
    kv.get("UNAME") ??
    kv.get("OSTYPE") ??
    "unknown";
  const osVersion =
    jvm?.["os.version"] ??
    kv.get("UNAME_R") ??
    "";
  const osKernel = kv.get("UNAME_R") ?? kv.get("UNAME") ?? "";

  // --- locale ---
  const localeAll = (kv.get("LOCALE_ALL") ?? "").replace(/\|/g, "\n");

  return {
    shellType: config.shell ?? "unknown",
    shellBinary: config.executable,
    shellVersion: kv.get("SHELL_VERSION") ?? "unknown",
    shellVersionFull: kv.get("SHELL_VERSION_FULL") ?? "",

    osName,
    osVersion,
    osKernel,
    isWSL: bool(kv.get("IS_WSL")),
    isContainer: bool(kv.get("IS_CONTAINER")),
    isCI: bool(kv.get("IS_CI")),

    isInteractive: bool(kv.get("INTERACTIVE")),
    isTty: {
      stdin: bool(kv.get("TTY_STDIN")),
      stdout: bool(kv.get("TTY_STDOUT")),
      stderr: bool(kv.get("TTY_STDERR")),
    },
    termSize: (() => {
      const c = num(kv.get("TERM_COLS"));
      const r = num(kv.get("TERM_ROWS"));
      return c && r && c > 0 && r > 0 ? { cols: c, rows: r } : null;
    })(),

    termType: kv.get("TERM_TYPE") ?? "",
    termProgram: kv.get("TERM_PROGRAM") ?? "",
    colors,
    ansiEscapes: bool(kv.get("ANSI_ESCAPES")),

    encoding: jvm?.["file.encoding"] ?? kv.get("LANG") ?? "unknown",
    supportsUtf8: (kv.get("LANG") ?? "").toLowerCase().includes("utf"),
    locale: kv.get("LANG") ?? "",
    localeAll,

    pathSeparator: kv.get("PATH_SEP") ?? (isBashLike ? ":" : ";"),
    fileSeparator: kv.get("FILE_SEP") ?? (isBashLike ? "/" : "\\"),
    lineEnding,

    heredocSupport: bool(kv.get("HEREDOC")),
    arraySupport: bool(kv.get("ARRAYS")),
    processSubstitution: bool(kv.get("PROC_SUBST")),
    ansiCQuoting: bool(kv.get("ANSIC_QUOT")),
    erexitActive: bool(kv.get("ERREXIT")),

    process: {
      pid: num(kv.get("PID")),
      ppid: num(kv.get("PPID")),
      shlvl: num(kv.get("SHLVL")),
    },

    maxFileDescriptors: num(kv.get("MAX_FD")),
    tmpDir: kv.get("TMPDIR") ?? "",

    utilities,
    jvm,

    env: Deno.env.toObject(),
  };
}

/** Human-readable report of shell info. */
export function formatShellInfo(info: ShellInfo): string {
  const lines: string[] = [];
  const s = (label: string, val: unknown) =>
    lines.push(`${label.padEnd(28)} ${val}`);

  lines.push("=== Shell Identity ===");
  s("Shell type:", info.shellType);
  s("Shell binary:", info.shellBinary);
  s("Shell version:", info.shellVersion);
  if (info.shellVersionFull) s("Version full:", info.shellVersionFull);

  lines.push("\n=== Operating System ===");
  s("OS name:", info.osName);
  s("OS version:", info.osVersion);
  s("OS kernel:", info.osKernel);
  s("WSL:", info.isWSL);
  s("Container:", info.isContainer);
  s("CI:", info.isCI);

  lines.push("\n=== Interactivity ===");
  s("Interactive:", info.isInteractive);
  s("TTY stdin/out/err:", `${info.isTty.stdin}/${info.isTty.stdout}/${info.isTty.stderr}`);
  s("Terminal size:", info.termSize ? `${info.termSize.cols}x${info.termSize.rows}` : "n/a");

  lines.push("\n=== Terminal / Display ===");
  s("TERM:", info.termType);
  s("TERM_PROGRAM:", info.termProgram);
  s("Colors (count):", info.colors.count);
  s("True-color:", info.colors.truecolor);
  s("256-color:", info.colors.ansi256);
  s("ANSI escapes:", info.ansiEscapes);

  lines.push("\n=== Encoding ===");
  s("Encoding:", info.encoding);
  s("UTF-8:", info.supportsUtf8);
  s("Locale:", info.locale);

  lines.push("\n=== Filesystem / Path model ===");
  s("File separator:", JSON.stringify(info.fileSeparator));
  s("Path separator:", JSON.stringify(info.pathSeparator));
  s("Line ending:", info.lineEnding);

  lines.push("\n=== Shell Capabilities ===");
  s("Heredoc:", info.heredocSupport);
  s("Arrays:", info.arraySupport);
  s("Process substitution:", info.processSubstitution);
  s("ANSI-C quoting $'...':", info.ansiCQuoting);
  s("errexit active:", info.erexitActive);

  lines.push("\n=== Process ===");
  s("PID:", info.process.pid);
  s("PPID:", info.process.ppid);
  s("SHLVL:", info.process.shlvl);
  s("Max file descriptors:", info.maxFileDescriptors);
  s("Temp dir:", info.tmpDir);

  lines.push("\n=== Available Utilities ===");
  for (const [k, v] of Object.entries(info.utilities)) {
    s(`  ${k}:`, v ?? "(not found)");
  }

  if (info.jvm) {
    lines.push("\n=== JVM Properties ===");
    for (const [k, v] of Object.entries(info.jvm)) {
      s(`  ${k}:`, v);
    }
  }

  lines.push("\n=== Environment (snapshot) ===");
  const envKeys = Object.keys(info.env).sort();
  for (const k of envKeys) {
    lines.push(`  ${k}=${info.env[k]}`);
  }

  return lines.join("\n");
}
