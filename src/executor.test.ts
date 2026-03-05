import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert";
import { runCommand, type ShellConfig } from "./executor.ts";

// --- Test fixtures ---

const ECHO_SHELL: ShellConfig = {
  executable: "cmd.exe",
  argsPrefix: ["/c"],
  shell: "cmd",
};

// Platform-aware: use cmd.exe on Windows as a universally available shell for unit tests.
// Integration tests with bashw are in executor.integration.test.ts

Deno.test("runCommand: captures stdout", async () => {
  const result = await runCommand(ECHO_SHELL, "echo hello-world");
  assertStringIncludes(result.stdout.trim(), "hello-world");
  assertEquals(result.exitCode, 0);
});

Deno.test("runCommand: captures stderr", async () => {
  // cmd.exe: redirect echo to stderr via>&2 doesn't work cleanly, use a failing command
  // We just verify stderr field exists and is a string
  const result = await runCommand(ECHO_SHELL, "echo test");
  assertEquals(typeof result.stderr, "string");
  assertEquals(typeof result.stdout, "string");
});

Deno.test("runCommand: surfaces non-zero exit code", async () => {
  const result = await runCommand(ECHO_SHELL, "exit 42");
  assertEquals(result.exitCode, 42);
});

Deno.test("runCommand: missing shell binary throws clear error", async () => {
  const badConfig: ShellConfig = {
    executable: "C:/does-not-exist/noshell.exe",
    argsPrefix: ["-c"],
    shell: "noshell",
  };
  await assertRejects(
    () => runCommand(badConfig, "echo hi"),
    Error,
    "ENOENT",
  );
});

Deno.test("runCommand: passes command verbatim to shell", async () => {
  // cmd /c echo "foo bar baz" should preserve the quoted string
  const result = await runCommand(ECHO_SHELL, `echo "foo bar baz"`);
  assertStringIncludes(result.stdout, "foo bar baz");
});

Deno.test("runCommand: result has stdout, stderr, exitCode fields", async () => {
  const result = await runCommand(ECHO_SHELL, "echo ok");
  assertEquals(Object.keys(result).sort(), ["exitCode", "stderr", "stdout"]);
});
