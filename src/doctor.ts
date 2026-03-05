import { runCommand } from "./executor.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DetectedShell {
  /** Unique key used in config (e.g. "bashw", "cmd", "pwsh") */
  name: string;
  /** Absolute path to the executable */
  executable: string;
  /** Shell family (e.g. "bash", "cmd", "pwsh") */
  shell: string;
  /** Arguments placed before the command string */
  argsPrefix: string[];
  /** Short version string, e.g. "5.2.15(1)-release" or "10.0.19041" */
  version: string;
}

// ---------------------------------------------------------------------------
// Candidates to probe (PATH + well-known local paths)
// ---------------------------------------------------------------------------

interface Probe {
  name: string;
  shell: string;
  argsPrefix: string[];
  /** Executable name to look up on PATH */
  pathName?: string;
  /** Additional absolute paths to try (checked in order after PATH) */
  localPaths?: string[];
  /** Command args to get a version string */
  versionArgs: string[];
  /** Regex to extract version from output */
  versionRe: RegExp;
}

const PROBES: Probe[] = [
  {
    name: "bashw",
    shell: "bash",
    argsPrefix: ["-c"],
    // Not on PATH by default — check well-known shim locations
    localPaths: [
      "D:/home/raiser-apps/shims/bashw.exe",
      `${Deno.env.get("USERPROFILE") ?? ""}/scoop/shims/bashw.exe`,
      `${Deno.env.get("HOME") ?? ""}/scoop/shims/bashw.exe`,
    ],
    versionArgs: ["--version"],
    versionRe: /version\s+([\d.]+[\w()-]*)/i,
  },
  {
    name: "bash",
    shell: "bash",
    argsPrefix: ["-c"],
    pathName: "bash",
    localPaths: [
      "C:/Program Files/Git/usr/bin/bash.exe",
      "C:/msys64/usr/bin/bash.exe",
      "/usr/bin/bash",
      "/bin/bash",
    ],
    versionArgs: ["--version"],
    versionRe: /version\s+([\d.]+[\w()-]*)/i,
  },
  {
    name: "git-bash",
    shell: "bash",
    argsPrefix: ["-c"],
    localPaths: [
      "C:/Program Files/Git/bin/bash.exe",
      "C:/Program Files (x86)/Git/bin/bash.exe",
    ],
    versionArgs: ["--version"],
    versionRe: /version\s+([\d.]+[\w()-]*)/i,
  },
  {
    name: "zsh",
    shell: "zsh",
    argsPrefix: ["-c"],
    pathName: "zsh",
    localPaths: ["/usr/bin/zsh", "/bin/zsh", "/usr/local/bin/zsh"],
    versionArgs: ["--version"],
    versionRe: /zsh\s+([\d.]+)/i,
  },
  {
    name: "fish",
    shell: "fish",
    argsPrefix: ["-c"],
    pathName: "fish",
    localPaths: ["/usr/bin/fish", "/usr/local/bin/fish"],
    versionArgs: ["--version"],
    versionRe: /fish,?\s+version\s+([\d.]+)/i,
  },
  {
    name: "pwsh",
    shell: "pwsh",
    argsPrefix: ["-Command"],
    pathName: "pwsh",
    localPaths: [
      "C:/Program Files/PowerShell/7/pwsh.exe",
      `${Deno.env.get("ProgramFiles") ?? ""}/PowerShell/7/pwsh.exe`,
    ],
    versionArgs: ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"],
    versionRe: /^([\d.]+)/,
  },
  {
    name: "powershell",
    shell: "powershell",
    argsPrefix: ["-Command"],
    pathName: "powershell",
    localPaths: [
      `${Deno.env.get("SystemRoot") ?? "C:/Windows"}/System32/WindowsPowerShell/v1.0/powershell.exe`,
    ],
    versionArgs: ["-NoProfile", "-Command", "$PSVersionTable.PSVersion.ToString()"],
    versionRe: /^([\d.]+)/,
  },
  {
    name: "cmd",
    shell: "cmd",
    argsPrefix: ["/c"],
    pathName: "cmd",
    localPaths: [
      `${Deno.env.get("SystemRoot") ?? "C:/Windows"}/System32/cmd.exe`,
    ],
    versionArgs: ["/c", "ver"],
    versionRe: /(\d+\.\d+[\.\d]*)/,
  },
  {
    name: "sh",
    shell: "sh",
    argsPrefix: ["-c"],
    pathName: "sh",
    localPaths: ["/bin/sh", "/usr/bin/sh"],
    versionArgs: ["--version"],
    versionRe: /version\s+([\d.]+[\w()-]*)/i,
  },
];

// ---------------------------------------------------------------------------
// Resolution helpers
// ---------------------------------------------------------------------------

async function fileExists(p: string): Promise<boolean> {
  try {
    const stat = await Deno.stat(p);
    return stat.isFile;
  } catch {
    return false;
  }
}

async function resolveExecutable(probe: Probe): Promise<string | null> {
  // 1. Try PATH lookup
  if (probe.pathName) {
    try {
      const cmd = new Deno.Command("where", { args: [probe.pathName], stdout: "piped", stderr: "null" });
      const out = await cmd.output();
      if (out.success) {
        const first = new TextDecoder().decode(out.stdout).split(/\r?\n/)[0].trim();
        if (first) return first;
      }
    } catch { /* not on Windows or no `where` */ }

    // Unix fallback
    try {
      const cmd = new Deno.Command("which", { args: [probe.pathName], stdout: "piped", stderr: "null" });
      const out = await cmd.output();
      if (out.success) {
        const first = new TextDecoder().decode(out.stdout).split(/\r?\n/)[0].trim();
        if (first) return first;
      }
    } catch { /* ignore */ }
  }

  // 2. Try well-known local paths
  for (const lp of probe.localPaths ?? []) {
    if (lp && await fileExists(lp)) return lp;
  }

  return null;
}

async function getVersion(executable: string, probe: Probe): Promise<string> {
  try {
    const cmd = new Deno.Command(executable, {
      args: probe.versionArgs,
      stdout: "piped",
      stderr: "piped",
    });
    const out = await cmd.output();
    const combined = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
    const m = combined.match(probe.versionRe);
    return m ? m[1] : combined.split(/\r?\n/)[0].trim().slice(0, 60) || "unknown";
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function detectShells(): Promise<DetectedShell[]> {
  const found: DetectedShell[] = [];
  // Run all probes in parallel
  await Promise.all(
    PROBES.map(async (probe) => {
      const executable = await resolveExecutable(probe);
      if (!executable) return;
      const version = await getVersion(executable, probe);
      found.push({ name: probe.name, executable, shell: probe.shell, argsPrefix: probe.argsPrefix, version });
    }),
  );
  // Stable order matching PROBES
  found.sort((a, b) => {
    const ai = PROBES.findIndex((p) => p.name === a.name);
    const bi = PROBES.findIndex((p) => p.name === b.name);
    return ai - bi;
  });
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
  lines.push("To configure, call configure_shell with one of the names above.");
  return lines.join("\n");
}
