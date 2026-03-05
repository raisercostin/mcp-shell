import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { detectShells, type DetectedShell } from "./doctor.ts";

Deno.test("detectShells: returns an array", async () => {
  const shells = await detectShells();
  assertEquals(Array.isArray(shells), true);
});

Deno.test("detectShells: finds cmd.exe on Windows", async () => {
  const shells = await detectShells();
  const cmd = shells.find((s) => s.shell === "cmd");
  assertEquals(cmd !== undefined, true, "cmd.exe should always be found on Windows");
  assertEquals(typeof cmd!.executable, "string");
  assertStringIncludes(cmd!.executable.toLowerCase(), "cmd");
});

Deno.test("detectShells: each entry has required fields", async () => {
  const shells = await detectShells();
  for (const s of shells) {
    assertEquals(typeof s.name, "string");
    assertEquals(typeof s.executable, "string");
    assertEquals(typeof s.shell, "string");
    assertEquals(Array.isArray(s.argsPrefix), true);
    assertEquals(typeof s.version, "string");
  }
});

Deno.test("detectShells: version is non-empty for found shells", async () => {
  const shells = await detectShells();
  for (const s of shells) {
    assertEquals(s.version.length > 0, true, `version empty for ${s.name}`);
  }
});
