import {
  mkdir,
  open,
  readFile,
  rename,
  type FileHandle,
} from "node:fs/promises";
import { join, resolve } from "node:path";

import { z } from "zod";

import {
  createFeedbackInputSchema,
  feedbackRecordSchema,
  updateFeedbackInputSchema,
  type CreateFeedbackInput,
  type FeedbackRecord,
  type UpdateFeedbackInput,
} from "../shared/feedback";

const feedbackEnvelopeSchema = z.object({
  version: z.literal(1),
  feedback: z.array(feedbackRecordSchema),
});

type StorageFileSystem = {
  mkdir: typeof mkdir;
  open: typeof open;
  readFile: typeof readFile;
  rename: typeof rename;
};

export class FeedbackConflictError extends Error {
  readonly current: FeedbackRecord;

  constructor(message: string, current: FeedbackRecord) {
    super(message);
    this.name = "FeedbackConflictError";
    this.current = current;
  }
}

export class FeedbackNotFoundError extends Error {
  constructor(id: string) {
    super(`Feedback not found: ${id}`);
    this.name = "FeedbackNotFoundError";
  }
}

export type FeedbackStorageOptions = {
  dataRoot: string;
  now?: () => Date;
  fileSystem?: Partial<StorageFileSystem>;
};

function assertProjectId(projectId: string) {
  if (!/^[a-z0-9][a-z0-9._-]*$/i.test(projectId)) {
    throw new Error(`Invalid project id: ${projectId}`);
  }
}

function sameCreate(
  record: FeedbackRecord,
  input: z.output<typeof createFeedbackInputSchema>,
) {
  return (
    record.screenId === input.screenId &&
    record.version === input.version &&
    record.x === input.x &&
    record.y === input.y &&
    record.note === input.note &&
    record.category === input.category &&
    record.priority === input.priority &&
    record.status === input.status
  );
}

function nextUpdatedAt(now: Date, previous?: string) {
  if (!previous) return now.toISOString();
  const previousTime = new Date(previous).getTime();
  return new Date(Math.max(now.getTime(), previousTime + 1)).toISOString();
}

export function createFeedbackStorage(options: FeedbackStorageOptions) {
  const fileSystem: StorageFileSystem = {
    mkdir,
    open,
    readFile,
    rename,
    ...options.fileSystem,
  };
  const now = options.now ?? (() => new Date());
  const mutationQueues = new Map<string, Promise<void>>();

  function paths(projectId: string) {
    assertProjectId(projectId);
    const directory = join(options.dataRoot, projectId);
    return {
      directory,
      current: join(directory, "feedback.json"),
      next: join(directory, "feedback.json.next"),
    };
  }

  async function read(projectId: string): Promise<FeedbackRecord[]> {
    const { current } = paths(projectId);
    let contents: string;
    try {
      contents = await fileSystem.readFile(current, "utf8");
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return [];
      }
      throw error;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch {
      throw new Error(`${current} contains invalid JSON; restore or repair it.`);
    }
    const result = feedbackEnvelopeSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(
        `${current} contains invalid feedback data; restore or repair it.`,
      );
    }
    return result.data.feedback;
  }

  async function syncAndClose(handle: FileHandle) {
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  async function write(projectId: string, feedback: FeedbackRecord[]) {
    const target = paths(projectId);
    await fileSystem.mkdir(target.directory, { recursive: true, mode: 0o700 });
    const envelope = feedbackEnvelopeSchema.parse({ version: 1, feedback });
    const handle = await fileSystem.open(target.next, "w", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(envelope, null, 2)}\n`, "utf8");
      await syncAndClose(handle);
    } catch (error) {
      await handle.close().catch(() => undefined);
      throw error;
    }
    await fileSystem.rename(target.next, target.current);
    const directoryHandle = await fileSystem.open(target.directory, "r");
    await syncAndClose(directoryHandle);
  }

  async function afterPendingMutation(projectId: string) {
    await mutationQueues.get(projectId);
  }

  function serializeMutation<T>(
    projectId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const previous = mutationQueues.get(projectId) ?? Promise.resolve();
    const result = previous.catch(() => undefined).then(operation);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    mutationQueues.set(projectId, tail);
    void tail.finally(() => {
      if (mutationQueues.get(projectId) === tail) {
        mutationQueues.delete(projectId);
      }
    });
    return result;
  }

  async function listFeedback(projectId: string) {
    await afterPendingMutation(projectId);
    return read(projectId);
  }

  function createFeedback(
    projectId: string,
    rawInput: CreateFeedbackInput,
  ): Promise<FeedbackRecord> {
    return serializeMutation(projectId, async () => {
      const input = createFeedbackInputSchema.parse(rawInput);
      const feedback = await read(projectId);
      const existing = feedback.find(
        (item) => item.id === input.clientMutationId,
      );
      if (existing) {
        if (sameCreate(existing, input)) return existing;
        throw new FeedbackConflictError(
          "Feedback mutation id was already used with different content.",
          existing,
        );
      }
      const timestamp = nextUpdatedAt(now());
      const created = feedbackRecordSchema.parse({
        id: input.clientMutationId,
        projectId,
        screenId: input.screenId,
        version: input.version,
        x: input.x,
        y: input.y,
        note: input.note,
        category: input.category,
        priority: input.priority,
        status: input.status,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      await write(projectId, [...feedback, created]);
      return created;
    });
  }

  function updateFeedback(
    projectId: string,
    id: string,
    rawInput: UpdateFeedbackInput,
  ): Promise<FeedbackRecord> {
    return serializeMutation(projectId, async () => {
      const input = updateFeedbackInputSchema.parse(rawInput);
      const feedback = await read(projectId);
      const index = feedback.findIndex((item) => item.id === id);
      if (index < 0) throw new FeedbackNotFoundError(id);
      const current = feedback[index]!;
      if (current.updatedAt !== input.expectedUpdatedAt) {
        throw new FeedbackConflictError(
          "Feedback changed after it was loaded.",
          current,
        );
      }
      const updated = feedbackRecordSchema.parse({
        ...current,
        ...input.patch,
        updatedAt: nextUpdatedAt(now(), current.updatedAt),
      });
      const nextFeedback = [...feedback];
      nextFeedback[index] = updated;
      await write(projectId, nextFeedback);
      return updated;
    });
  }

  function deleteFeedback(
    projectId: string,
    id: string,
    expectedUpdatedAt: string,
  ): Promise<void> {
    return serializeMutation(projectId, async () => {
      const feedback = await read(projectId);
      const current = feedback.find((item) => item.id === id);
      if (!current) throw new FeedbackNotFoundError(id);
      if (current.updatedAt !== expectedUpdatedAt) {
        throw new FeedbackConflictError(
          "Feedback changed after it was loaded.",
          current,
        );
      }
      await write(
        projectId,
        feedback.filter((item) => item.id !== id),
      );
    });
  }

  // Merges records saved elsewhere (the old browser adapter) without touching
  // existing records. Invalid records are reported, never dropped silently.
  function importFeedback(
    projectId: string,
    rawRecords: unknown,
  ): Promise<{ imported: number; skipped: number; invalid: number }> {
    return serializeMutation(projectId, async () => {
      z.array(z.unknown()).parse(rawRecords);
      const records = rawRecords as unknown[];
      const feedback = await read(projectId);
      const ids = new Set(feedback.map((item) => item.id));
      const additions: FeedbackRecord[] = [];
      let skipped = 0;
      let invalid = 0;
      for (const raw of records) {
        const parsed = feedbackRecordSchema.safeParse(
          typeof raw === "object" && raw !== null ? { ...raw, projectId } : raw,
        );
        if (!parsed.success) {
          invalid += 1;
        } else if (ids.has(parsed.data.id)) {
          skipped += 1;
        } else {
          ids.add(parsed.data.id);
          additions.push(parsed.data);
        }
      }
      if (additions.length > 0) {
        await write(projectId, [...feedback, ...additions]);
      }
      return { imported: additions.length, skipped, invalid };
    });
  }

  return {
    listFeedback,
    createFeedback,
    updateFeedback,
    deleteFeedback,
    importFeedback,
  };
}

export type FeedbackStorage = ReturnType<typeof createFeedbackStorage>;

// One instance per data root, so every caller in this process shares a single
// mutation queue and the shared temp file can never be written concurrently.
const sharedStorages = new Map<string, FeedbackStorage>();

export function sharedFeedbackStorage(dataRoot: string): FeedbackStorage {
  const key = resolve(dataRoot);
  let storage = sharedStorages.get(key);
  if (!storage) {
    storage = createFeedbackStorage({ dataRoot: key });
    sharedStorages.set(key, storage);
  }
  return storage;
}

export async function listFeedback(dataRoot: string, projectId: string) {
  return sharedFeedbackStorage(dataRoot).listFeedback(projectId);
}

export async function createFeedback(
  dataRoot: string,
  projectId: string,
  input: CreateFeedbackInput,
) {
  return sharedFeedbackStorage(dataRoot).createFeedback(projectId, input);
}

export async function updateFeedback(
  dataRoot: string,
  projectId: string,
  id: string,
  input: UpdateFeedbackInput,
) {
  return sharedFeedbackStorage(dataRoot).updateFeedback(projectId, id, input);
}

export async function deleteFeedback(
  dataRoot: string,
  projectId: string,
  id: string,
  expectedUpdatedAt: string,
) {
  return sharedFeedbackStorage(dataRoot).deleteFeedback(
    projectId,
    id,
    expectedUpdatedAt,
  );
}
