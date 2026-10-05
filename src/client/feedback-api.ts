import {
  feedbackRecordSchema,
  type CreateFeedbackInput,
  type FeedbackRecord,
  type UpdateFeedbackInput,
} from "../shared/feedback";
import {
  screenApprovalSchema,
  type SetApprovalInput,
} from "../shared/approvals";
import type { ProjectList } from "../shared/projects";

export class FeedbackApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly current?: FeedbackRecord,
  ) {
    super(message);
    this.name = "FeedbackApiError";
  }
}

function feedbackUrl(projectId: string, suffix = "") {
  return `/api/projects/${encodeURIComponent(projectId)}/feedback${suffix}`;
}

async function request<T>(
  url: string,
  init: { method: string; body?: unknown } = { method: "GET" },
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers:
        init.body === undefined
          ? undefined
          : { "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new FeedbackApiError("The workbench server is not reachable.", 0);
  }
  const payload = (await response.json().catch(() => ({}))) as {
    error?: string;
    current?: unknown;
  };
  if (!response.ok) {
    const current = feedbackRecordSchema.safeParse(payload.current);
    throw new FeedbackApiError(
      payload.error ?? `Request failed (${response.status}).`,
      response.status,
      current.success ? current.data : undefined,
    );
  }
  return payload as T;
}

export async function fetchFeedback(projectId: string) {
  const { feedback } = await request<{ feedback: unknown }>(
    feedbackUrl(projectId),
  );
  return feedbackRecordSchema.array().parse(feedback);
}

export async function postFeedback(
  projectId: string,
  input: CreateFeedbackInput,
) {
  const { feedback } = await request<{ feedback: unknown }>(
    feedbackUrl(projectId),
    { method: "POST", body: input },
  );
  return feedbackRecordSchema.parse(feedback);
}

export async function patchFeedback(
  projectId: string,
  id: string,
  input: UpdateFeedbackInput,
) {
  const { feedback } = await request<{ feedback: unknown }>(
    feedbackUrl(projectId, `/${encodeURIComponent(id)}`),
    { method: "PATCH", body: input },
  );
  return feedbackRecordSchema.parse(feedback);
}

export async function removeFeedback(
  projectId: string,
  id: string,
  expectedUpdatedAt: string,
) {
  await request(feedbackUrl(projectId, `/${encodeURIComponent(id)}`), {
    method: "DELETE",
    body: { expectedUpdatedAt },
  });
}

function approvalsUrl(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/approvals`;
}

export async function fetchApprovals(projectId: string) {
  const { approvals } = await request<{ approvals: unknown }>(
    approvalsUrl(projectId),
  );
  return screenApprovalSchema.array().parse(approvals);
}

export async function putApproval(projectId: string, input: SetApprovalInput) {
  const { approvals } = await request<{ approvals: unknown }>(
    approvalsUrl(projectId),
    { method: "PUT", body: input },
  );
  return screenApprovalSchema.array().parse(approvals);
}

export function legacyFeedbackKey(projectId: string) {
  return `screen-review-workbench.feedback.v1:${projectId}`;
}

// Moves feedback saved by the old browser-only adapter onto disk. The browser
// copy is removed only once the server has accepted every record; anything it
// cannot read is left in place and reported.
export async function migrateLegacyFeedback(
  projectId: string,
): Promise<string | null> {
  const key = legacyFeedbackKey(projectId);
  const raw = window.localStorage.getItem(key);
  if (raw === null) return null;
  let records: unknown;
  try {
    records = JSON.parse(raw);
  } catch {
    return `Older browser-only feedback in "${key}" could not be read, so it was left untouched.`;
  }
  if (!Array.isArray(records)) {
    return `Older browser-only feedback in "${key}" is not a list, so it was left untouched.`;
  }
  const result = await request<{
    imported: number;
    skipped: number;
    invalid: number;
  }>(feedbackUrl(projectId, "/import"), { method: "POST", body: { records } });
  if (result.invalid > 0) {
    return `${result.invalid} older browser-only feedback item${result.invalid === 1 ? "" : "s"} could not be imported and ${result.invalid === 1 ? "was" : "were"} left in browser storage.`;
  }
  window.localStorage.removeItem(key);
  return null;
}

export async function fetchProjects(): Promise<ProjectList> {
  return request<ProjectList>("/api/projects");
}
