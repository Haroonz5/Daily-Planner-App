import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc, setDoc } from "firebase/firestore";

import { db } from "@/constants/firebaseConfig";

export type OfflineQueuedTask = {
  localId: string;
  payload: Record<string, unknown>;
  queuedAt: string;
};

const OFFLINE_TASK_QUEUE_KEY = "dailyDisciplineOfflineTaskQueue";

export const getOfflineTaskQueue = async (): Promise<OfflineQueuedTask[]> => {
  const raw = await AsyncStorage.getItem(OFFLINE_TASK_QUEUE_KEY);
  if (!raw) return [];

  try {
    return JSON.parse(raw) as OfflineQueuedTask[];
  } catch {
    return [];
  }
};

export const enqueueOfflineTask = async (
  payload: Record<string, unknown>
): Promise<OfflineQueuedTask[]> => {
  const current = await getOfflineTaskQueue();
  const next = [
    ...current,
    {
      localId: `offline-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      payload,
      queuedAt: new Date().toISOString(),
    },
  ].slice(-50);

  await AsyncStorage.setItem(OFFLINE_TASK_QUEUE_KEY, JSON.stringify(next));
  return next;
};

export const flushOfflineTaskQueue = async (uid: string) => {
  const current = await getOfflineTaskQueue();
  if (current.length === 0) return { flushed: 0, remaining: 0 };

  const remaining: OfflineQueuedTask[] = [];
  let flushed = 0;

  for (const queued of current) {
    try {
      const taskRef = doc(collection(db, "users", uid, "tasks"));
      // I mark synced tasks as offlineQueued so future analytics can prove the
      // app handled offline work instead of silently dropping user intent.
      await setDoc(taskRef, {
        ...queued.payload,
        offlineQueued: true,
        offlineQueuedAt: queued.queuedAt,
        syncedAt: new Date(),
      });
      flushed += 1;
    } catch {
      remaining.push(queued);
    }
  }

  await AsyncStorage.setItem(OFFLINE_TASK_QUEUE_KEY, JSON.stringify(remaining));
  return { flushed, remaining: remaining.length };
};
