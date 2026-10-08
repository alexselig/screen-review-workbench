import { runMcpServer } from "./server";

// Runs the ScreenCheck MCP server on stdio:
//   tsx src/mcp/main.ts [--url http://127.0.0.1:4173] [--author Copilot]
// Without --url it finds the running server like the CLI does.
function option(name: string) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

runMcpServer({
  origin: option("url"),
  author: option("author") ?? process.env.SCREENCHECK_AUTHOR,
}).catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
