import { Server } from "npm:@modelcontextprotocol/sdk@1.7.0/server/index.js";
import { StdioServerTransport } from "npm:@modelcontextprotocol/sdk@1.7.0/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "npm:@modelcontextprotocol/sdk@1.7.0/types.js";
import { runCommand } from "./executor.ts";
import { loadConfig, type LoadConfigOptions } from "./config.ts";

const TOOL_RUN_COMMAND = "run_command";
const TOOL_RUN_SCRIPT = "run_script";

export function createServer(configOptions: LoadConfigOptions = {}) {
  const shellConfig = loadConfig(configOptions);

  const server = new Server(
    { name: "mcp-shell-executor", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, () => ({
    tools: [
      {
        name: TOOL_RUN_COMMAND,
        description:
          `Run a shell command using: ${shellConfig.executable} ${shellConfig.argsPrefix.join(" ")} <command>. ` +
          `Shell: ${shellConfig.shell}. Output includes stdout, stderr, and exit_code.`,
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The shell command to execute",
            },
          },
          required: ["command"],
        },
      },
      {
        name: TOOL_RUN_SCRIPT,
        description:
          `Run a multi-line script using: ${shellConfig.shell}. ` +
          "Each newline-separated line is joined and run as a single heredoc-style command.",
        inputSchema: {
          type: "object",
          properties: {
            script: {
              type: "string",
              description: "Multi-line script body",
            },
          },
          required: ["script"],
        },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    if (name === TOOL_RUN_COMMAND) {
      const command = (args as { command: string }).command;
      const result = await runCommand(shellConfig, command);
      return {
        content: [
          {
            type: "text",
            text: [
              `exit_code: ${result.exitCode}`,
              result.stdout ? `stdout:\n${result.stdout}` : "stdout: (empty)",
              result.stderr ? `stderr:\n${result.stderr}` : "stderr: (empty)",
            ].join("\n"),
          },
        ],
      };
    }

    if (name === TOOL_RUN_SCRIPT) {
      const script = (args as { script: string }).script;
      // Run the script as-is — the shell handles multiline via -c
      const result = await runCommand(shellConfig, script);
      return {
        content: [
          {
            type: "text",
            text: [
              `exit_code: ${result.exitCode}`,
              result.stdout ? `stdout:\n${result.stdout}` : "stdout: (empty)",
              result.stderr ? `stderr:\n${result.stderr}` : "stderr: (empty)",
            ].join("\n"),
          },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  });

  return server;
}

export async function startServer(configOptions: LoadConfigOptions = {}) {
  const server = createServer(configOptions);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
