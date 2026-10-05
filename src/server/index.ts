import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";

import { assertLoopbackHost, LOOPBACK_HOST } from "./origin";

export type ServerOptions = {
  host?: string;
  port?: number;
};

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

export async function startServer({
  host = LOOPBACK_HOST,
  port = 4173,
}: ServerOptions = {}) {
  assertLoopbackHost(host);
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  const server = createServer((request: IncomingMessage, response: ServerResponse) => {
    if (request.url === "/healthz") {
      json(response, 200, { ok: true });
      return;
    }
    vite.middlewares(request, response, () => {
      json(response, 404, { error: "not found" });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  return {
    origin: `http://${host}:${port}`,
    async close() {
      await vite.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const running = await startServer();
  console.log(`Screen Review Workbench: ${running.origin}`);
}
