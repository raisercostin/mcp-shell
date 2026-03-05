/** Shell configuration — mirrors the GEMINI_SHELL_CONFIG shape (see practice-gemini-shell-patch.md) */
export interface ShellConfig {
  /** Absolute path to shell executable. Must include .exe on Windows. */
  executable: string;
  /** Arguments placed before the command string. Typically ["-c"] for bash, ["/c"] for cmd. */
  argsPrefix: string[];
  /** Human label (e.g. "bash", "pwsh", "cmd") — for logging only. */
  shell: string;
}

/** Result of a shell command execution. */
export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Run a command string through the configured shell.
 *
 * Invocation: `<executable> [...argsPrefix] <command>`
 *
 * Throws an Error containing "ENOENT" if the shell binary cannot be found.
 * Never silently falls back to another shell (R5 — shell drift prevention).
 */
export async function runCommand(
  config: ShellConfig,
  command: string,
): Promise<CommandResult> {
  const cmd = new Deno.Command(config.executable, {
    args: [...config.argsPrefix, command],
    stdout: "piped",
    stderr: "piped",
  });

  let output: Deno.CommandOutput;
  try {
    output = await cmd.output();
  } catch (err) {
    // Surface spawn failures as ENOENT-containing errors (R5: hard fail, no fallback)
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("os error 2") || msg.includes("No such file") || msg.includes("File not found") || msg.includes("ENOENT")) {
      throw new Error(`ENOENT: shell not found: ${config.executable}`);
    }
    throw err;
  }

  const decoder = new TextDecoder();
  return {
    stdout: decoder.decode(output.stdout),
    stderr: decoder.decode(output.stderr),
    exitCode: output.code,
  };
}
