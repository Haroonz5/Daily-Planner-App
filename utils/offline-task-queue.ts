import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, deleteDoc, doc, setDoc, updateDoc } from "firebase/firestore";

import { db } from "@/constants/firebaseConfig";

export type OfflineMutationType = "createTask" | "updateTask" | "deleteTask";

export type OfflineQueuedTask = {
  localId: string;
  type: OfflineMutationType;
  payload: Record<string, unknown>;
  documentId?: string | null;
  queuedAt: string;
  attempts: number;
  clientRevision: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  lastError?: string | null;
};

export type OfflineFlushResult = {
  flushed: number;
  remaining: number;
  failed: number;
  deferred: number;
};

export type OfflineSyncSummary = {
  total: number;
  ready: number;
  deferred: number;
  failed: number;
  oldestQueuedAt?: string | null;
  nextRetryAt?: string | null;
};

const OFFLINE_TASK_QUEUE_KEY = "dailyDisciplineOfflineTaskQueue";
const MAX_QUEUE_SIZE = 100;
const BASE_RETRY_MS = 30 * 1000;
const MAX_RETRY_MS = 30 * 60 * 1000;

const getNowIso = () => new Date().toISOString();

const nextLocalId = () =>
  `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const normalizeQueuedMutation = (item: any): OfflineQueuedTask | null => {
  if (!item || typeof item !== "object") return null;

  // I keep this migration so older queued tasks from previous tester builds do
  // not disappear after the new offline sync engine ships.
  if (!item.type) {
    return {
      localId: String(item.localId ?? nextLocalId()),
      type: "createTask",
      payload: item.payload ?? {},
      documentId: item.documentId ?? null,
      queuedAt: String(item.queuedAt ?? getNowIso()),
      attempts: Number(item.attempts ?? 0),
      clientRevision: Number(item.clientRevision ?? Date.now()),
      lastAttemptAt: item.lastAttemptAt ?? null,
      nextRetryAt: item.nextRetryAt ?? null,
      lastError: item.lastError ?? null,
    };
  }

  if (!["createTask", "updateTask", "deleteTask"].includes(item.type)) {
    return null;
  }

  return {
    localId: String(item.localId ?? nextLocalId()),
    type: item.type,
    payload: item.payload ?? {},
    documentId: item.documentId ?? null,
    queuedAt: String(item.queuedAt ?? getNowIso()),
    attempts: Number(item.attempts ?? 0),
    clientRevision: Number(item.clientRevision ?? Date.now()),
    lastAttemptAt: item.lastAttemptAt ?? null,
    nextRetryAt: item.nextRetryAt ?? null,
    lastError: item.lastError ?? null,
  };
};

const saveQueue = async (queue: OfflineQueuedTask[]) => {
  await AsyncStorage.setItem(OFFLINE_TASK_QUEUE_KEY, JSON.stringify(queue));
};

export const getOfflineTaskQueue = async (): Promise<OfflineQueuedTask[]> => {
  const raw = await AsyncStorage.getItem(OFFLINE_TASK_QUEUE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown[];
    return parsed.map(normalizeQueuedMutation).filter(Boolean) as OfflineQueuedTask[];
  } catch {
    return [];
  }
};

export const getOfflineSyncSummary = async (): Promise<OfflineSyncSummary> => {
  const queue = await getOfflineTaskQueue();
  const now = Date.now();
  const ready = queue.filter(
    (item) => !item.nextRetryAt || new Date(item.nextRetryAt).getTime() <= now
  ).length;
  const deferredItems = queue.filter(
    (item) => item.nextRetryAt && new Date(item.nextRetryAt).getTime() > now
  );
  const failed = queue.filter((item) => item.attempts > 0).length;

  return {
    total: queue.length,
    ready,
    deferred: deferredItems.length,
    failed,
    oldestQueuedAt: queue[0]?.queuedAt ?? null,
    nextRetryAt:
      deferredItems
        .map((item) => item.nextRetryAt)
        .filter(Boolean)
        .sort()[0] ?? null,
  };
};

export const enqueueOfflineMutation = async ({
  type,
  payload = {},
  documentId = null,
}: {
  type: OfflineMutationType;
  payload?: Record<string, unknown>;
  documentId?: string | null;
}): Promise<OfflineQueuedTask[]> => {
  const current = await getOfflineTaskQueue();
  const mutation: OfflineQueuedTask = {
    localId: nextLocalId(),
    type,
    payload,
    documentId,
    queuedAt: getNowIso(),
    attempts: 0,
    clientRevision: Date.now(),
    lastAttemptAt: null,
    nextRetryAt: null,
    lastError: null,
  };

  const withoutDuplicateCreate =
    type === "createTask" && payload.clientRequestId
      ? current.filter(
          (item) => item.payload.clientRequestId !== payload.clientRequestId
        )
      : current;

  const next = [...withoutDuplicateCreate, mutation].slice(-MAX_QUEUE_SIZE);
  await saveQueue(next);
  return next;
};

export const enqueueOfflineTask = async (
  payload: Record<string, unknown>
): Promise<OfflineQueuedTask[]> =>
  enqueueOfflineMutation({ type: "createTask", payload });

export const enqueueOfflineTaskUpdate = async (
  documentId: string,
  payload: Record<string, unknown>
): Promise<OfflineQueuedTask[]> =>
  enqueueOfflineMutation({ type: "updateTask", documentId, payload });

export const enqueueOfflineTaskDelete = async (
  documentId: string
): Promise<OfflineQueuedTask[]> =>
  enqueueOfflineMutation({ type: "deleteTask", documentId, payload: {} });

const getRetryDate = (attempts: number) => {
  const delay = Math.min(BASE_RETRY_MS * 2 ** Math.max(attempts - 1, 0), MAX_RETRY_MS);
  return new Date(Date.now() + delay).toISOString();
};

const applyMutation = async (uid: string, queued: OfflineQueuedTask) => {
  if (queued.type === "createTask") {
    const taskRef = queued.documentId
      ? doc(db, "users", uid, "tasks", queued.documentId)
      : doc(collection(db, "users", uid, "tasks"));

    // I mark synced tasks as offlineQueued so future analytics can prove the
    // app handled offline work instead of silently dropping user intent.
    await setDoc(
      taskRef,
      {
        ...queued.payload,
        offlineQueued: true,
        offlineQueuedAt: queued.queuedAt,
        offlineClientRevision: queued.clientRevision,
        syncedAt: new Date(),
      },
      { merge: true }
    );
    return;
  }

  if (!queued.documentId) {
    throw new Error(`${queued.type} needs a documentId`);
  }

  if (queued.type === "updateTask") {
    await updateDoc(doc(db, "users", uid, "tasks", queued.documentId), {
      ...queued.payload,
      offlineSyncedAt: new Date(),
      offlineClientRevision: queued.clientRevision,
    });
    return;
  }

  await deleteDoc(doc(db, "users", uid, "tasks", queued.documentId));
};

export const flushOfflineTaskQueue = async (
  uid: string
): Promise<OfflineFlushResult> => {
  const current = await getOfflineTaskQueue();
  if (current.length === 0) {
    return { flushed: 0, remaining: 0, failed: 0, deferred: 0 };
  }

  const remaining: OfflineQueuedTask[] = [];
  let flushed = 0;
  let failed = 0;
  let deferred = 0;
  const now = Date.now();

  for (const queued of current) {
    if (queued.nextRetryAt && new Date(queued.nextRetryAt).getTime() > now) {
      remaining.push(queued);
      deferred += 1;
      continue;
    }

    try {
      await applyMutation(uid, queued);
      flushed += 1;
    } catch (error) {
      const attempts = queued.attempts + 1;
      failed += 1;
      remaining.push({
        ...queued,
        attempts,
        lastAttemptAt: getNowIso(),
        nextRetryAt: getRetryDate(attempts),
        lastError: error instanceof Error ? error.message : "Sync failed",
      });
    }
  }

  await saveQueue(remaining);
  return { flushed, remaining: remaining.length, failed, deferred };
};
