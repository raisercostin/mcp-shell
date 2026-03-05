import { assertEquals, assertThrows } from "jsr:@std/assert";
import { loadConfig, type ShellConfig } from "./config.ts";

const VALID_CONFIG: ShellConfig = {
  executable: "D:/home/raiser-apps/shims/bashw.exe",
  argsPrefix: ["-c"],
  shell: "bash",
};

// --- Load from env var ---

Deno.test("loadConfig: reads MCP_SHELL_CONFIG env var", () => {
  const prev = Deno.env.get("MCP_SHELL_CONFIG");
  try {
    Deno.env.set("MCP_SHELL_CONFIG", JSON.stringify(VALID_CONFIG));
    const cfg = loadConfig();
    assertEquals(cfg.executable, VALID_CONFIG.executable);
    assertEquals(cfg.argsPrefix, VALID_CONFIG.argsPrefix);
    assertEquals(cfg.shell, VALID_CONFIG.shell);
  } finally {
    if (prev !== undefined) Deno.env.set("MCP_SHELL_CONFIG", prev);
    else Deno.env.delete("MCP_SHELL_CONFIG");
  }
});

Deno.test("loadConfig: throws if MCP_SHELL_CONFIG is invalid JSON", () => {
  const prev = Deno.env.get("MCP_SHELL_CONFIG");
  try {
    Deno.env.set("MCP_SHELL_CONFIG", "not-json{{{");
    assertThrows(() => loadConfig(), Error, "Invalid JSON");
  } finally {
    if (prev !== undefined) Deno.env.set("MCP_SHELL_CONFIG", prev);
    else Deno.env.delete("MCP_SHELL_CONFIG");
  }
});

// --- Load from CLI arg ---

Deno.test("loadConfig: reads --shell-config CLI argument", () => {
  const cfg = loadConfig({ shellConfig: JSON.stringify(VALID_CONFIG) });
  assertEquals(cfg.executable, VALID_CONFIG.executable);
});

Deno.test("loadConfig: CLI arg takes priority over env var", () => {
  const envConfig = { ...VALID_CONFIG, shell: "from-env" };
  const cliConfig = { ...VALID_CONFIG, shell: "from-cli" };
  const prev = Deno.env.get("MCP_SHELL_CONFIG");
  try {
    Deno.env.set("MCP_SHELL_CONFIG", JSON.stringify(envConfig));
    const cfg = loadConfig({ shellConfig: JSON.stringify(cliConfig) });
    assertEquals(cfg.shell, "from-cli");
  } finally {
    if (prev !== undefined) Deno.env.set("MCP_SHELL_CONFIG", prev);
    else Deno.env.delete("MCP_SHELL_CONFIG");
  }
});

// --- Fail fast if no config ---

Deno.test("loadConfig: throws if no config provided at all", () => {
  const prev = Deno.env.get("MCP_SHELL_CONFIG");
  try {
    Deno.env.delete("MCP_SHELL_CONFIG");
    assertThrows(() => loadConfig(), Error, "No shell configuration");
  } finally {
    if (prev !== undefined) Deno.env.set("MCP_SHELL_CONFIG", prev);
  }
});

// --- Validation ---

Deno.test("loadConfig: throws if executable is missing", () => {
  const bad = { argsPrefix: ["-c"], shell: "bash" };
  assertThrows(
    () => loadConfig({ shellConfig: JSON.stringify(bad) }),
    Error,
    "executable",
  );
});

Deno.test("loadConfig: throws if argsPrefix is not an array", () => {
  const bad = { executable: "/bin/bash", argsPrefix: "-c", shell: "bash" };
  assertThrows(
    () => loadConfig({ shellConfig: JSON.stringify(bad) }),
    Error,
    "argsPrefix",
  );
});

Deno.test("loadConfig: accepts minimal valid config", () => {
  const minimal = { executable: "/bin/bash", argsPrefix: ["-c"], shell: "bash" };
  const cfg = loadConfig({ shellConfig: JSON.stringify(minimal) });
  assertEquals(cfg.executable, "/bin/bash");
});
