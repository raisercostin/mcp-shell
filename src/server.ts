import { Server } from "npm:@modelcontextprotocol/sdk@1.7.0/server/index.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk@1.7.0/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "npm:@modelcontextprotocol/sdk@1.7.0/types.js";
import { runCommand, type ShellConfig } from "./executor.ts";
import { detectShells, formatDetectedShells } from "./doctor.ts";
import { getShellInfo, formatShellInfo } from "./info.ts";

const TOOL_SHELL_RUN      = "shell_run";
const TOOL_SHELL_DOCTOR   = "shell_doctor";
const TOOL_SHELL_CONFIG   = "shell_config";
const TOOL_SHELL_INFO     = "shell_info";

const NOT_CONFIGURED =
  "No shell configured. Call `shell_doctor` to discover available shells, " +
  "then call `shell_config` with the name of the shell you want to use.";

function resultText(r: { exitCode: number; stdout: string; stderr: string }) {
  return [
    `exit_code: ${r.exitCode}`,
    r.stdout ? `stdout:\n${r.stdout}` : "stdout: (empty)",
    r.stderr ? `stderr:\n${r.stderr}` : "stderr: (empty)",
  ].join("\n");
}

function textContent(text: string) {
  return { content: [{ type: "text", text }] };
}

export function createServer(initialConfig?: ShellConfig) {
  // Mutable — can be set at runtime via configure_shell
  let shellConfig: ShellConfig | null = initialConfig ?? null;

  const server = new Server(
    { name: "mcp-shell", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: TOOL_SHELL_DOCTOR,
        description:
          "Discover all shells available on this machine (checks PATH and well-known local paths). " +
          "Returns a list of shells with their paths and versions. " +
          "Call configure_shell afterwards to select one.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: TOOL_SHELL_CONFIG,
        description:
          "Set the active shell for this session. Use a name returned by shell_doctor. " +
          "To make it permanent, set MCP_SHELL_CONFIG in your environment.",
        inputSchema: {
          type: "object",
          properties: {
            name: { type: "string", description: "Shell name from shell_doctor (e.g. 'bashw', 'bash', 'cmd')" },
          },
          required: ["name"],
        },
      },
      {
        name: TOOL_SHELL_INFO,
        description:
          "Get comprehensive info about the configured shell: OS, version, TTY, encoding, " +
          "line endings, capabilities (heredoc, arrays, process substitution), available utilities, JVM properties, and full env snapshot. " +
          "Requires a shell to be configured first.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: TOOL_SHELL_RUN,
        description: shellConfig
          ? `Run a shell command or multi-line script via ${shellConfig.shell} (${shellConfig.executable}). Returns stdout, stderr, exit_code.`
          : `Run a shell command or script. ${NOT_CONFIGURED}`,
        inputSchema: {
          type: "object",
          properties: {
            command: { type: "string", description: "The shell command or multi-line script to execute" },
          },
          required: ["command"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === TOOL_SHELL_DOCTOR) {
      const shells = await detectShells();
      return textContent(formatDetectedShells(shells));
    }

    if (name === TOOL_SHELL_CONFIG) {
      const selectedName = (args as { name: string }).name;
      const shells = await detectShells();
      const found = shells.find((s) => s.name === selectedName);
      if (!found) {
        const available = shells.map((s) => s.name).join(", ");
        return textContent(
          `Shell "${selectedName}" not found. Available: ${available}\n` +
          `Run shell_doctor to see the full list.`,
        );
      }
      shellConfig = { executable: found.executable, argsPrefix: found.argsPrefix, shell: found.shell };
      const envJson = JSON.stringify(shellConfig);
      return textContent(
        `✓ Shell configured: ${found.name} (${found.executable}) version ${found.version}\n\n` +
        `To make this permanent, set in your shell profile:\n` +
        `  MCP_SHELL_CONFIG='${envJson}'\n\n` +
        `Or in your agent config env:\n` +
        `  "MCP_SHELL_CONFIG": ${JSON.stringify(envJson)}`,
      );
    }

    if (name === TOOL_SHELL_INFO) {
      if (!shellConfig) return textContent(NOT_CONFIGURED);
      const info = await getShellInfo(shellConfig);
      return textContent(formatShellInfo(info));
    }

    if (name === TOOL_SHELL_RUN) {
      if (!shellConfig) return textContent(NOT_CONFIGURED);
      const command = (args as { command: string }).command;
      return textContent(resultText(await runCommand(shellConfig, command)));
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}

export async function startServer(initialConfig?: ShellConfig) {
  const server = createServer(initialConfig);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
