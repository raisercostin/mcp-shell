import { assertEquals, assertThrows } from "jsr:@std/assert";
import {
  generateDefaultConfig,
  getDefaultShell,
  getShell,
  loadMultiConfig,
  setDefaultShell,
  type MultiShellConfig,
} from "./multiconfig.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SINGLE_SHELL_JSON = JSON.stringify({
  executable: "bash.exe",
  argsPrefix: ["-c"],
  shell: "bash",
});

const MULTI_SHELL_JSON = JSON.stringify({
  defaultShell: "bashw",
  shells: {
    bashw: { executable: "D:/shims/bashw.exe", argsPrefix: ["-c"], shell: "bash" },
    cmd:   { executable: "cmd.exe",            argsPrefix: ["/c"], shell: "cmd"  },
  },
  preferences: {
    editor: "code",
    pager:  "bat",
    finder: "fd",
    grep:   "rg",
    ls:     "eza",
  },
});

// ---------------------------------------------------------------------------
// loadMultiConfig
// ---------------------------------------------------------------------------

Deno.test("loadMultiConfig: accepts backward-compat single-shell JSON", () => {
  const cfg = loadMultiConfig(SINGLE_SHELL_JSON);
  assertEquals(cfg.shells["bash"].executable, "bash.exe");
  assertEquals(cfg.defaultShell, "bash");
});

Deno.test("loadMultiConfig: parses multi-shell JSON", () => {
  const cfg = loadMultiConfig(MULTI_SHELL_JSON);
  assertEquals(cfg.defaultShell, "bashw");
  assertEquals(Object.keys(cfg.shells).length, 2);
  assertEquals(cfg.shells["cmd"].executable, "cmd.exe");
});

Deno.test("loadMultiConfig: parses preferences", () => {
  const cfg = loadMultiConfig(MULTI_SHELL_JSON);
  assertEquals(cfg.preferences?.grep, "rg");
  assertEquals(cfg.preferences?.finder, "fd");
});

Deno.test("loadMultiConfig: throws on invalid JSON", () => {
  assertThrows(() => loadMultiConfig("{not json}"), Error, "Invalid JSON");
});

Deno.test("loadMultiConfig: throws if defaultShell references unknown shell", () => {
  const bad = JSON.stringify({
    defaultShell: "ghost",
    shells: { bash: { executable: "bash", argsPrefix: ["-c"], shell: "bash" } },
  });
  assertThrows(() => loadMultiConfig(bad), Error, "ghost");
});

Deno.test("loadMultiConfig: throws if shells map is empty", () => {
  const bad = JSON.stringify({ defaultShell: "x", shells: {} });
  assertThrows(() => loadMultiConfig(bad), Error);
});

// ---------------------------------------------------------------------------
// getDefaultShell / getShell
// ---------------------------------------------------------------------------

Deno.test("getDefaultShell: returns ShellConfig for defaultShell", () => {
  const cfg = loadMultiConfig(MULTI_SHELL_JSON);
  const sh = getDefaultShell(cfg);
  assertEquals(sh.executable, "D:/shims/bashw.exe");
  assertEquals(sh.shell, "bash");
});

Deno.test("getShell: returns named shell config", () => {
  const cfg = loadMultiConfig(MULTI_SHELL_JSON);
  const sh = getShell(cfg, "cmd");
  assertEquals(sh?.executable, "cmd.exe");
});

Deno.test("getShell: returns null for unknown name", () => {
  const cfg = loadMultiConfig(MULTI_SHELL_JSON);
  assertEquals(getShell(cfg, "ghost"), null);
});

// ---------------------------------------------------------------------------
// setDefaultShell
// ---------------------------------------------------------------------------

Deno.test("setDefaultShell: changes the default shell", () => {
  const cfg = loadMultiConfig(MULTI_SHELL_JSON);
  const updated = setDefaultShell(cfg, "cmd");
  assertEquals(updated.defaultShell, "cmd");
  assertEquals(getDefaultShell(updated).executable, "cmd.exe");
});

Deno.test("setDefaultShell: throws if name is not in shells", () => {
  const cfg = loadMultiConfig(MULTI_SHELL_JSON);
  assertThrows(() => setDefaultShell(cfg, "ghost"), Error, "ghost");
});

// ---------------------------------------------------------------------------
// generateDefaultConfig
// ---------------------------------------------------------------------------

Deno.test("generateDefaultConfig: produces parseable MultiShellConfig JSON", () => {
  const shells = [
    { name: "cmd", executable: "cmd.exe", argsPrefix: ["/c"] as string[], shell: "cmd" },
  ];
  const json = generateDefaultConfig(shells);
  const parsed: MultiShellConfig = JSON.parse(json);
  assertEquals(parsed.defaultShell, "cmd");
  assertEquals(parsed.shells["cmd"].executable, "cmd.exe");
  assertEquals(typeof parsed.preferences, "object");
});

Deno.test("generateDefaultConfig: prefers bash-like shell as default when available", () => {
  const shells = [
    { name: "cmd",  executable: "cmd.exe",  argsPrefix: ["/c"] as string[], shell: "cmd"  },
    { name: "bash", executable: "bash.exe", argsPrefix: ["-c"] as string[], shell: "bash" },
  ];
  const json = generateDefaultConfig(shells);
  const parsed: MultiShellConfig = JSON.parse(json);
  assertEquals(parsed.defaultShell, "bash");
});
