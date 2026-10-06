import type { IncomingMessage, ServerResponse } from "node:http";

import { z } from "zod";

import {
  assertMutationOrigin,
  isLoopbackHostHeader,
  loopbackOrigins,
} from "./origin";
import type { ProjectCatalog } from "./projects";
import {
  FeedbackConflictError,
  FeedbackNotFoundError,
  type FeedbackStorage,
} from "./storage";

const MAX_BODY_BYTES = 1024 * 1024;

const deleteBodySchema = z.object({ expectedUpdatedAt: z.iso.datetime() });
const importBodySchema = z.object({ records: z.array(z.unknown()) });

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
) {
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(`${JSON.stringify(body)}\n`);
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const type = request.headers["content-type"] ?? "";
  if (!type.toLowerCase().startsWith("application/json")) {
    throw new HttpError(415, "Send feedback as application/json.");
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) {
      throw new HttpError(413, "Request body is larger than 1 MB.");
    }
    chunks.push(chunk as Buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Request body is not valid JSON.");
  }
}

const ROUTE =
  /^\/api\/projects\/([^/]+)\/feedback(?:\/(import)|\/([^/]+))?\/?$/;

const CAPTURE_ROUTE =
  /^\/api\/projects\/([^/]+)\/captures\/([^/]+)\/([^/]+)\/?$/;

const APPROVALS_ROUTE = /^\/api\/projects\/([^/]+)\/approvals\/?$/;

const CAPTIONS_ROUTE = /^\/api\/projects\/([^/]+)\/captions\/?$/;

export type ApiOptions = {
  storage: FeedbackStorage;
  port: number;
  catalog?: ProjectCatalog;
};

// Returns false when the request is not an API route, so the caller can fall
// through to the static/Vite handler.
export async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  { storage, port, catalog }: ApiOptions,
): Promise<boolean> {
  const url = new URL(request.url ?? "/", "http://placeholder");
  if (!url.pathname.startsWith("/api/")) return false;

  try {
    if (!isLoopbackHostHeader(request.headers.host, port)) {
      throw new HttpError(403, "Unexpected Host header.");
    }
    if (url.pathname === "/api/projects" && catalog) {
      if (request.method !== "GET")
        throw new HttpError(405, "Method not allowed.");
      sendJson(response, 200, await catalog.list());
      return true;
    }
    const capture = CAPTURE_ROUTE.exec(url.pathname);
    if (capture && catalog) {
      if (request.method !== "GET")
        throw new HttpError(405, "Method not allowed.");
      const [projectId, version, screenId] = capture
        .slice(1)
        .map((part) => decodeURIComponent(part!));
      const file = await catalog.capture(projectId!, version!, screenId!);
      if (!file) throw new HttpError(404, "Capture not found.");
      response.writeHead(200, {
        "cache-control": "private, max-age=300",
        "content-type": file.type,
        "x-content-type-options": "nosniff",
      });
      file.open().pipe(response);
      return true;
    }
    const approvals = APPROVALS_ROUTE.exec(url.pathname);
    if (approvals) {
      const projectId = decodeURIComponent(approvals[1]!);
      if (request.method === "GET") {
        sendJson(response, 200, {
          approvals: await storage.listApprovals(projectId),
        });
      } else if (request.method === "PUT") {
        try {
          assertMutationOrigin(request.headers.origin, loopbackOrigins(port));
        } catch (error) {
          throw new HttpError(403, (error as Error).message);
        }
        sendJson(response, 200, {
          approvals: await storage.setApproval(
            projectId,
            (await readJsonBody(request)) as never,
          ),
        });
      } else {
        throw new HttpError(405, "Method not allowed.");
      }
      return true;
    }
    const captions = CAPTIONS_ROUTE.exec(url.pathname);
    if (captions) {
      const projectId = decodeURIComponent(captions[1]!);
      if (request.method === "GET") {
        sendJson(response, 200, {
          captions: await storage.listCaptions(projectId),
        });
      } else if (request.method === "PUT") {
        try {
          assertMutationOrigin(request.headers.origin, loopbackOrigins(port));
        } catch (error) {
          throw new HttpError(403, (error as Error).message);
        }
        sendJson(response, 200, {
          captions: await storage.setCaption(
            projectId,
            (await readJsonBody(request)) as never,
          ),
        });
      } else {
        throw new HttpError(405, "Method not allowed.");
      }
      return true;
    }
    const match = ROUTE.exec(url.pathname);
    if (!match) throw new HttpError(404, "Not found.");
    const projectId = decodeURIComponent(match[1]!);
    const isImport = match[2] === "import";
    const id = match[3] ? decodeURIComponent(match[3]) : undefined;
    const method = request.method ?? "GET";

    if (method !== "GET") {
      try {
        assertMutationOrigin(request.headers.origin, loopbackOrigins(port));
      } catch (error) {
        throw new HttpError(403, (error as Error).message);
      }
    }

    if (!id && !isImport && method === "GET") {
      sendJson(response, 200, {
        feedback: await storage.listFeedback(projectId),
      });
    } else if (!id && !isImport && method === "POST") {
      const created = await storage.createFeedback(
        projectId,
        (await readJsonBody(request)) as never,
      );
      sendJson(response, 201, { feedback: created });
    } else if (isImport && method === "POST") {
      const body = importBodySchema.parse(await readJsonBody(request));
      sendJson(
        response,
        200,
        await storage.importFeedback(projectId, body.records),
      );
    } else if (id && method === "PATCH") {
      const updated = await storage.updateFeedback(
        projectId,
        id,
        (await readJsonBody(request)) as never,
      );
      sendJson(response, 200, { feedback: updated });
    } else if (id && method === "DELETE") {
      const body = deleteBodySchema.parse(await readJsonBody(request));
      await storage.deleteFeedback(projectId, id, body.expectedUpdatedAt);
      sendJson(response, 200, { deleted: id });
    } else {
      throw new HttpError(405, "Method not allowed.");
    }
  } catch (error) {
    if (error instanceof HttpError) {
      sendJson(response, error.status, { error: error.message });
    } else if (error instanceof z.ZodError) {
      sendJson(response, 400, {
        error: "Invalid feedback.",
        issues: error.issues,
      });
    } else if (error instanceof FeedbackConflictError) {
      sendJson(response, 409, { error: error.message, current: error.current });
    } else if (error instanceof FeedbackNotFoundError) {
      sendJson(response, 404, { error: error.message });
    } else if (
      error instanceof Error &&
      error.message.startsWith("Invalid project id")
    ) {
      sendJson(response, 400, { error: error.message });
    } else {
      sendJson(response, 500, {
        error: error instanceof Error ? error.message : "Storage failed.",
      });
    }
  }
  return true;
}
