import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import {
  detectAgentRuntime,
  detectConfigPaths,
  detectIde,
  detectOs,
  formatWhoAmI,
  whoAmI,
  type WhoAmI,
} from "./whoami.ts";

// =============================================================================
// detectOs
// =============================================================================

Deno.test("detectOs: returns 'windows', 'linux', or 'macos'", () => {
  const os = detectOs();
  assertEquals(["windows", "linux", "macos", "unknown"].includes(os), true);
});

Deno.test("detectOs: returns 'windows' on this machine", () => {
  // This test suite runs on Windows
  assertEquals(detectOs(), "windows");
});

// =============================================================================
// detectIde
// =============================================================================

Deno.test("detectIde: returns string or null", () => {
  const ide = detectIde({});
  assertEquals(ide === null || typeof ide === "string", true);
});

Deno.test("detectIde: detects vscode from VSCODE_PID", () => {
  assertEquals(detectIde({ VSCODE_PID: "123" }), "vscode");
});

Deno.test("detectIde: detects vscode from TERM_PROGRAM=vscode", () => {
  assertEquals(detectIde({ TERM_PROGRAM: "vscode" }), "vscode");
});

Deno.test("detectIde: detects vscode from VSCODE_INJECTION", () => {
  assertEquals(detectIde({ VSCODE_INJECTION: "1" }), "vscode");
});

Deno.test("detectIde: detects cursor from CURSOR_TRACE_ID", () => {
  assertEquals(detectIde({ CURSOR_TRACE_ID: "abc" }), "cursor");
});

Deno.test("detectIde: detects jetbrains from JETBRAINS_REMOTE_DEV_LAUNCHER_NAME", () => {
  assertEquals(detectIde({ JETBRAINS_REMOTE_DEV_LAUNCHER_NAME: "idea" }), "jetbrains");
});

Deno.test("detectIde: returns null for empty env", () => {
  assertEquals(detectIde({}), null);
});

// =============================================================================
// detectAgentRuntime
// =============================================================================

Deno.test("detectAgentRuntime: returns string or null", () => {
  const r = detectAgentRuntime({});
  assertEquals(r === null || typeof r === "string", true);
});

Deno.test("detectAgentRuntime: detects copilot-cli from COPILOT_CLI=1", () => {
  assertEquals(detectAgentRuntime({ COPILOT_CLI: "1" }), "copilot-cli");
});

Deno.test("detectAgentRuntime: detects copilot-cli from GITHUB_COPILOT_TOKEN", () => {
  assertEquals(detectAgentRuntime({ GITHUB_COPILOT_TOKEN: "token" }), "copilot-cli");
});

Deno.test("detectAgentRuntime: detects copilot-cli from COPILOT_AGENT_VERSION", () => {
  assertEquals(detectAgentRuntime({ COPILOT_AGENT_VERSION: "1.0" }), "copilot-cli");
});

Deno.test("detectAgentRuntime: detects vscode-copilot from VSCODE_PID + no copilot token", () => {
  assertEquals(detectAgentRuntime({ VSCODE_PID: "123" }), "vscode-copilot");
});

Deno.test("detectAgentRuntime: detects cursor from CURSOR_TRACE_ID", () => {
  assertEquals(detectAgentRuntime({ CURSOR_TRACE_ID: "abc" }), "cursor");
});

Deno.test("detectAgentRuntime: detects github-actions from GITHUB_ACTIONS", () => {
  assertEquals(detectAgentRuntime({ GITHUB_ACTIONS: "true" }), "github-actions");
});

Deno.test("detectAgentRuntime: returns null for unknown env", () => {
  assertEquals(detectAgentRuntime({}), null);
});

// =============================================================================
// detectConfigPaths
// =============================================================================

Deno.test("detectConfigPaths: returns Record<string,string>", async () => {
  const paths = await detectConfigPaths();
  assertEquals(typeof paths, "object");
  for (const [k, v] of Object.entries(paths)) {
    assertEquals(typeof k, "string");
    assertEquals(typeof v, "string");
  }
});

Deno.test("detectConfigPaths: only returns paths that exist on disk", async () => {
  const paths = await detectConfigPaths();
  for (const p of Object.values(paths)) {
    let exists = false;
    try { await Deno.stat(p); exists = true; } catch { /* ok */ }
    assertEquals(exists, true, `Path in configPaths does not exist: ${p}`);
  }
});

Deno.test("detectConfigPaths: finds copilot-cli config on this machine", async () => {
  const paths = await detectConfigPaths();
  // This machine has ~/.copilot/mcp-config.json
  const hasCopilot = Object.values(paths).some(p => p.includes("mcp-config.json"));
  assertEquals(hasCopilot, true, "Expected to find copilot CLI mcp-config.json");
});

// =============================================================================
// whoAmI (integration)
// =============================================================================

Deno.test("whoAmI: returns WhoAmI with all required fields", async () => {
  const result = await whoAmI();
  assertEquals(typeof result.os, "string");
  assertEquals(result.os.length > 0, true);
  assertEquals(typeof result.mcpTransport, "string");
  assertEquals(["stdio", "sse", "unknown"].includes(result.mcpTransport), true);
  assertEquals(typeof result.configPaths, "object");
  assertEquals(result.ide === null || typeof result.ide === "string", true);
  assertEquals(result.agentRuntime === null || typeof result.agentRuntime === "string", true);
  assertEquals(result.model === null || typeof result.model === "string", true);
  assertEquals(result.shell === null || typeof result.shell === "string", true);
});

Deno.test("whoAmI: os is always non-null", async () => {
  const result = await whoAmI();
  assertEquals(result.os !== null && result.os !== "", true);
});

Deno.test("whoAmI: configPaths are all existing files", async () => {
  const result = await whoAmI();
  for (const p of Object.values(result.configPaths)) {
    let exists = false;
    try { await Deno.stat(p); exists = true; } catch { /* ok */ }
    assertEquals(exists, true, `configPath does not exist: ${p}`);
  }
});

// =============================================================================
// formatWhoAmI
// =============================================================================

Deno.test("formatWhoAmI: returns non-empty string", async () => {
  const result = await whoAmI();
  const text = formatWhoAmI(result);
  assertEquals(typeof text, "string");
  assertEquals(text.length > 0, true);
});

Deno.test("formatWhoAmI: includes os field", async () => {
  const result = await whoAmI();
  assertStringIncludes(formatWhoAmI(result), result.os);
});

Deno.test("formatWhoAmI: includes configPaths keys", async () => {
  const result = await whoAmI();
  const text = formatWhoAmI(result);
  for (const k of Object.keys(result.configPaths)) {
    assertStringIncludes(text, k);
  }
});
