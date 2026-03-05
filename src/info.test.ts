import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { getShellInfo, type ShellInfo } from "./info.ts";
import type { ShellConfig } from "./executor.ts";

const CMD_SHELL: ShellConfig = {
  executable: "cmd.exe",
  argsPrefix: ["/c"],
  shell: "cmd",
};

Deno.test("getShellInfo: returns a ShellInfo object with all required fields", async () => {
  const info = await getShellInfo(CMD_SHELL);
  // Structural checks — all top-level fields must be present
  const keys = Object.keys(info).sort();
  for (const required of ["arch", "charset", "eol", "env", "isInteractive", "isTty", "os", "pathDelimiter", "pathSeparator", "shellType", "term"]) {
    assertEquals(keys.includes(required), true, `Missing field: ${required}`);
  }
});

Deno.test("getShellInfo: isTty has stdin/stdout/stderr booleans", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(typeof info.isTty.stdin, "boolean");
  assertEquals(typeof info.isTty.stdout, "boolean");
  assertEquals(typeof info.isTty.stderr, "boolean");
});

Deno.test("getShellInfo: eol is LF or CRLF", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(["LF", "CRLF"].includes(info.eol), true);
});

Deno.test("getShellInfo: os is a non-empty string", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(typeof info.os, "string");
  assertEquals(info.os.length > 0, true);
});

Deno.test("getShellInfo: env is a record of strings", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(typeof info.env, "object");
  // Should contain at least PATH or Path
  const hasPath = "PATH" in info.env || "Path" in info.env || "path" in info.env;
  assertEquals(hasPath, true);
});

Deno.test("getShellInfo: shellType matches configured shell label", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertStringIncludes(info.shellType.toLowerCase(), "cmd");
});

Deno.test("getShellInfo: pathSeparator and pathDelimiter are single characters", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(info.pathSeparator.length, 1);
  assertEquals(info.pathDelimiter.length, 1);
});

Deno.test("getShellInfo: toReport() returns a non-empty string", async () => {
  const info = await getShellInfo(CMD_SHELL);
  const report = toReport(info);
  assertEquals(typeof report, "string");
  assertEquals(report.length > 0, true);
});

// Helper used in test — mirrors what server.ts will call
function toReport(info: ShellInfo): string {
  return JSON.stringify(info, null, 2);
}
