import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer as createViteServer } from "vite";

import { handleApi, sendJson as json } from "./api";
import { createProjectCatalog, defaultProjectsRoot } from "./projects";
import { assertLoopbackHost, LOOPBACK_HOST } from "./origin";
import { sharedFeedbackStorage } from "./storage";

export type ServerOptions = {
  host?: string;
  port?: number;
  dataRoot?: string;
  projectsRoot?: string;
};

export function defaultDataRoot() {
  return (
    process.env.SCREEN_REVIEW_DATA ??
    join(homedir(), ".screen-review-workbench", "feedback")
  );
}

export async function startServer({
  host = LOOPBACK_HOST,
  port = 4173,
  dataRoot = defaultDataRoot(),
  projectsRoot = defaultProjectsRoot(),
}: ServerOptions = {}) {
  assertLoopbackHost(host);
  const storage = sharedFeedbackStorage(dataRoot);
  const catalog = createProjectCatalog({
    projectsRoot,
    hasFeedback: async (projectId) =>
      (await storage.listFeedback(projectId)).length > 0,
  });
  let boundPort = port;
  const vite = await createViteServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  const server = createServer(async (request: IncomingMessage, response: ServerResponse) => {
    if (request.url === "/healthz") {
      json(response, 200, { ok: true });
      return;
    }
    if (await handleApi(request, response, { storage, port: boundPort, catalog })) return;
    vite.middlewares(request, response, () => {
      json(response, 404, { error: "not found" });
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  boundPort = (server.address() as AddressInfo).port;
  return {
    origin: `http://${host}:${boundPort}`,
    dataRoot,
    projectsRoot,
    async close() {
      await vite.close();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const running = await startServer({
    port: Number(process.env.PORT ?? "4173"),
  });
  console.log(`Screen Review Workbench: ${running.origin}`);
  console.log(`Feedback stored in: ${running.dataRoot}`);
  console.log(`Projects read from: ${running.projectsRoot}`);
}
