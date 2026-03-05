import { assertEquals, assertRejects, assertStringIncludes, assertThrows } from "jsr:@std/assert";
import {
  detectShells,
  formatShellInfo,
  generateDefaultConfig,
  getDefaultShell,
  getShell,
  getShellInfo,
  loadConfig,
  loadMultiConfig,
  runCommand,
  setDefaultShell,
  type MultiShellConfig,
  type ShellConfig,
} from "./shell.ts";

// =============================================================================
// Fixtures
// =============================================================================

const CMD_SHELL: ShellConfig = { executable: "cmd.exe", argsPrefix: ["/c"], shell: "cmd" };
const VALID_CONFIG: ShellConfig = { executable: "D:/home/raiser-apps/shims/bashw.exe", argsPrefix: ["-c"], shell: "bash" };

// =============================================================================
// runCommand
// =============================================================================

Deno.test("runCommand: captures stdout", async () => {
  const result = await runCommand(CMD_SHELL, "echo hello-world");
  assertStringIncludes(result.stdout.trim(), "hello-world");
  assertEquals(result.exitCode, 0);
});

Deno.test("runCommand: captures stderr", async () => {
  const result = await runCommand(CMD_SHELL, "echo test");
  assertEquals(typeof result.stderr, "string");
  assertEquals(typeof result.stdout, "string");
});

Deno.test("runCommand: surfaces non-zero exit code", async () => {
  const result = await runCommand(CMD_SHELL, "exit 42");
  assertEquals(result.exitCode, 42);
});

Deno.test("runCommand: missing shell binary throws ENOENT", async () => {
  const bad: ShellConfig = { executable: "C:/does-not-exist/noshell.exe", argsPrefix: ["-c"], shell: "noshell" };
  await assertRejects(() => runCommand(bad, "echo hi"), Error, "ENOENT");
});

Deno.test("runCommand: passes command verbatim to shell", async () => {
  const result = await runCommand(CMD_SHELL, `echo "foo bar baz"`);
  assertStringIncludes(result.stdout, "foo bar baz");
});

Deno.test("runCommand: result has stdout, stderr, exitCode fields", async () => {
  const result = await runCommand(CMD_SHELL, "echo ok");
  assertEquals(Object.keys(result).sort(), ["exitCode", "stderr", "stdout"]);
});

// =============================================================================
// loadConfig
// =============================================================================

Deno.test("loadConfig: reads MCP_SHELL_CONFIG env var", () => {
  const prev = Deno.env.get("MCP_SHELL_CONFIG");
  try {
    Deno.env.set("MCP_SHELL_CONFIG", JSON.stringify(VALID_CONFIG));
    const cfg = loadConfig();
    assertEquals(cfg.executable, VALID_CONFIG.executable);
  } finally {
    prev !== undefined ? Deno.env.set("MCP_SHELL_CONFIG", prev) : Deno.env.delete("MCP_SHELL_CONFIG");
  }
});

Deno.test("loadConfig: throws if MCP_SHELL_CONFIG is invalid JSON", () => {
  const prev = Deno.env.get("MCP_SHELL_CONFIG");
  try {
    Deno.env.set("MCP_SHELL_CONFIG", "not-json{{{");
    assertThrows(() => loadConfig(), Error, "Invalid JSON");
  } finally {
    prev !== undefined ? Deno.env.set("MCP_SHELL_CONFIG", prev) : Deno.env.delete("MCP_SHELL_CONFIG");
  }
});

Deno.test("loadConfig: reads --shell-config CLI argument", () => {
  const cfg = loadConfig({ shellConfig: JSON.stringify(VALID_CONFIG) });
  assertEquals(cfg.executable, VALID_CONFIG.executable);
});

Deno.test("loadConfig: CLI arg takes priority over env var", () => {
  const prev = Deno.env.get("MCP_SHELL_CONFIG");
  try {
    Deno.env.set("MCP_SHELL_CONFIG", JSON.stringify({ ...VALID_CONFIG, shell: "from-env" }));
    const cfg = loadConfig({ shellConfig: JSON.stringify({ ...VALID_CONFIG, shell: "from-cli" }) });
    assertEquals(cfg.shell, "from-cli");
  } finally {
    prev !== undefined ? Deno.env.set("MCP_SHELL_CONFIG", prev) : Deno.env.delete("MCP_SHELL_CONFIG");
  }
});

Deno.test("loadConfig: throws if no config provided at all", () => {
  const prev = Deno.env.get("MCP_SHELL_CONFIG");
  try {
    Deno.env.delete("MCP_SHELL_CONFIG");
    assertThrows(() => loadConfig(), Error, "No shell configuration");
  } finally {
    if (prev !== undefined) Deno.env.set("MCP_SHELL_CONFIG", prev);
  }
});

Deno.test("loadConfig: throws if executable is missing", () => {
  assertThrows(() => loadConfig({ shellConfig: JSON.stringify({ argsPrefix: ["-c"], shell: "bash" }) }), Error, "executable");
});

Deno.test("loadConfig: throws if argsPrefix is not an array", () => {
  assertThrows(() => loadConfig({ shellConfig: JSON.stringify({ executable: "/bin/bash", argsPrefix: "-c" }) }), Error, "argsPrefix");
});

Deno.test("loadConfig: accepts minimal valid config", () => {
  const cfg = loadConfig({ shellConfig: JSON.stringify({ executable: "/bin/bash", argsPrefix: ["-c"], shell: "bash" }) });
  assertEquals(cfg.executable, "/bin/bash");
});

// =============================================================================
// loadMultiConfig
// =============================================================================

const SINGLE_JSON = JSON.stringify({ executable: "bash.exe", argsPrefix: ["-c"], shell: "bash" });
const MULTI_JSON = JSON.stringify({
  defaultShell: "bashw",
  shells: {
    bashw: { executable: "D:/shims/bashw.exe", argsPrefix: ["-c"], shell: "bash" },
    cmd:   { executable: "cmd.exe",            argsPrefix: ["/c"], shell: "cmd"  },
  },
  preferences: { editor: "code", pager: "bat", finder: "fd", grep: "rg", ls: "eza" },
});

Deno.test("loadMultiConfig: accepts backward-compat single-shell JSON", () => {
  const cfg = loadMultiConfig(SINGLE_JSON);
  assertEquals(cfg.shells["bash"].executable, "bash.exe");
  assertEquals(cfg.defaultShell, "bash");
});

Deno.test("loadMultiConfig: parses multi-shell JSON", () => {
  const cfg = loadMultiConfig(MULTI_JSON);
  assertEquals(cfg.defaultShell, "bashw");
  assertEquals(Object.keys(cfg.shells).length, 2);
});

Deno.test("loadMultiConfig: parses preferences", () => {
  const cfg = loadMultiConfig(MULTI_JSON);
  assertEquals(cfg.preferences?.grep, "rg");
  assertEquals(cfg.preferences?.finder, "fd");
});

Deno.test("loadMultiConfig: throws on invalid JSON", () => {
  assertThrows(() => loadMultiConfig("{not json}"), Error, "Invalid JSON");
});

Deno.test("loadMultiConfig: throws if defaultShell references unknown shell", () => {
  assertThrows(() => loadMultiConfig(JSON.stringify({ defaultShell: "ghost", shells: { bash: { executable: "bash", argsPrefix: ["-c"], shell: "bash" } } })), Error, "ghost");
});

Deno.test("loadMultiConfig: throws if shells map is empty", () => {
  assertThrows(() => loadMultiConfig(JSON.stringify({ defaultShell: "x", shells: {} })), Error);
});

Deno.test("getDefaultShell: returns ShellConfig for defaultShell", () => {
  const cfg = loadMultiConfig(MULTI_JSON);
  assertEquals(getDefaultShell(cfg).executable, "D:/shims/bashw.exe");
});

Deno.test("getShell: returns named shell config", () => {
  assertEquals(getShell(loadMultiConfig(MULTI_JSON), "cmd")?.executable, "cmd.exe");
});

Deno.test("getShell: returns null for unknown name", () => {
  assertEquals(getShell(loadMultiConfig(MULTI_JSON), "ghost"), null);
});

Deno.test("setDefaultShell: changes the default shell", () => {
  const updated = setDefaultShell(loadMultiConfig(MULTI_JSON), "cmd");
  assertEquals(updated.defaultShell, "cmd");
});

Deno.test("setDefaultShell: throws if name is not in shells", () => {
  assertThrows(() => setDefaultShell(loadMultiConfig(MULTI_JSON), "ghost"), Error, "ghost");
});

Deno.test("generateDefaultConfig: produces parseable MultiShellConfig JSON", () => {
  const json = generateDefaultConfig([{ name: "cmd", executable: "cmd.exe", argsPrefix: ["/c"], shell: "cmd" }]);
  const parsed: MultiShellConfig = JSON.parse(json);
  assertEquals(parsed.defaultShell, "cmd");
});

Deno.test("generateDefaultConfig: prefers bash-like shell as default", () => {
  const json = generateDefaultConfig([
    { name: "cmd", executable: "cmd.exe", argsPrefix: ["/c"], shell: "cmd" },
    { name: "bash", executable: "bash.exe", argsPrefix: ["-c"], shell: "bash" },
  ]);
  assertEquals(JSON.parse(json).defaultShell, "bash");
});

// =============================================================================
// detectShells
// =============================================================================

Deno.test("detectShells: returns an array", async () => {
  const shells = await detectShells();
  assertEquals(Array.isArray(shells), true);
});

Deno.test("detectShells: finds cmd.exe on Windows", async () => {
  const shells = await detectShells();
  const cmd = shells.find(s => s.name === "cmd");
  assertEquals(cmd !== undefined, true, "cmd.exe should always be found on Windows");
});

Deno.test("detectShells: each entry has required fields", async () => {
  const shells = await detectShells();
  for (const s of shells) {
    assertEquals(typeof s.name, "string");
    assertEquals(typeof s.executable, "string");
    assertEquals(typeof s.version, "string");
    assertEquals(Array.isArray(s.argsPrefix), true);
  }
});

Deno.test("detectShells: version is non-empty for found shells", async () => {
  const shells = await detectShells();
  for (const s of shells) assertEquals(s.version.length > 0, true, `empty version for ${s.name}`);
});

// =============================================================================
// getShellInfo / formatShellInfo
// =============================================================================

Deno.test("getShellInfo: returns a ShellInfo object with all required fields", async () => {
  const info = await getShellInfo(CMD_SHELL);
  const keys = Object.keys(info).sort();
  for (const required of ["shellType","shellBinary","shellVersion","osName","isInteractive","isTty","lineEnding","pathSeparator","fileSeparator","env","utilities"]) {
    assertEquals(keys.includes(required), true, `Missing field: ${required}`);
  }
});

Deno.test("getShellInfo: isTty has stdin/stdout/stderr booleans", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(typeof info.isTty.stdin, "boolean");
  assertEquals(typeof info.isTty.stdout, "boolean");
  assertEquals(typeof info.isTty.stderr, "boolean");
});

Deno.test("getShellInfo: lineEnding is valid value", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(["LF","CRLF","CR","unknown"].includes(info.lineEnding), true);
});

Deno.test("getShellInfo: osName is a non-empty string", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(typeof info.osName, "string");
  assertEquals(info.osName.length > 0, true);
});

Deno.test("getShellInfo: env contains PATH", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals("PATH" in info.env || "Path" in info.env || "path" in info.env, true);
});

Deno.test("getShellInfo: shellType matches configured shell label", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertStringIncludes(info.shellType.toLowerCase(), "cmd");
});

Deno.test("getShellInfo: pathSeparator and fileSeparator are single characters", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(info.pathSeparator.length, 1);
  assertEquals(info.fileSeparator.length, 1);
});

Deno.test("getShellInfo: formatShellInfo returns a non-empty string", async () => {
  const info = await getShellInfo(CMD_SHELL);
  const report = formatShellInfo(info);
  assertEquals(typeof report, "string");
  assertEquals(report.length > 0, true);
});
