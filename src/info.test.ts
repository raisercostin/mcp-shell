import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { getShellInfo, formatShellInfo } from "./info.ts";
import type { ShellConfig } from "./executor.ts";

const CMD_SHELL: ShellConfig = {
  executable: "cmd.exe",
  argsPrefix: ["/c"],
  shell: "cmd",
};

Deno.test("getShellInfo: returns a ShellInfo object with all required fields", async () => {
  const info = await getShellInfo(CMD_SHELL);
  const keys = Object.keys(info).sort();
  for (const required of ["shellType", "shellBinary", "shellVersion", "osName", "isInteractive", "isTty", "lineEnding", "pathSeparator", "fileSeparator", "env", "utilities"]) {
    assertEquals(keys.includes(required), true, `Missing field: ${required}`);
  }
});

Deno.test("getShellInfo: isTty has stdin/stdout/stderr booleans", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(typeof info.isTty.stdin, "boolean");
  assertEquals(typeof info.isTty.stdout, "boolean");
  assertEquals(typeof info.isTty.stderr, "boolean");
});

Deno.test("getShellInfo: lineEnding is LF or CRLF", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(["LF", "CRLF", "CR", "unknown"].includes(info.lineEnding), true);
});

Deno.test("getShellInfo: osName is a non-empty string", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(typeof info.osName, "string");
  assertEquals(info.osName.length > 0, true);
});

Deno.test("getShellInfo: env is a record of strings", async () => {
  const info = await getShellInfo(CMD_SHELL);
  assertEquals(typeof info.env, "object");
  const hasPath = "PATH" in info.env || "Path" in info.env || "path" in info.env;
  assertEquals(hasPath, true);
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
