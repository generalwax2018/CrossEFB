import { useEffect } from "react";
import { create } from "zustand";
import { useEfb } from "./store";
import { LOCAL_ONLY, mergeStates, openState, sealState, syncId } from "./sync";

type SyncStatus = {
  state: "off" | "syncing" | "ok" | "error";
  lastSync: string | null;
  message: string;
  set: (p: Partial<Omit<SyncStatus, "set">>) => void;
};

export const useSyncStatus = create<SyncStatus>((set) => ({
  state: "off",
  lastSync: null,
  message: "",
  set: (p) => set(p),
}));

const REV_KEY = "crossefb-sync-rev";

function readRev(): number {
  try {
    return Number(localStorage.getItem(REV_KEY) ?? "0") || 0;
  } catch {
    return 0;
  }
}

function writeRev(rev: number) {
  try {
    localStorage.setItem(REV_KEY, String(rev));
  } catch {
    /* private mode */
  }
}

function snapshot(): Record<string, unknown> {
  try {
    const raw = JSON.parse(localStorage.getItem("crossefb") ?? "{}") as { state?: Record<string, unknown> };
    const state = { ...(raw.state ?? {}) };
    for (const k of LOCAL_ONLY) delete state[k];
    return state;
  } catch {
    return {};
  }
}

let applying = false;

function apply(state: Record<string, unknown>) {
  applying = true;
  try {
    const keep = useEfb.getState().syncKey;
    useEfb.getState().restore({ app: "crossefb", state: { ...state, syncKey: keep } }, { keepUi: true });
  } finally {
    setTimeout(() => {
      applying = false;
    }, 0);
  }
}

async function pullMerge(code: string, id: string, remote: { rev: number; blob: string | null }, localNewer: boolean) {
  if (!remote.blob) return;
  const opened = await openState(code, remote.blob);
  const merged = mergeStates(snapshot(), opened.state, !localNewer);
  apply(merged);
  writeRev(remote.rev);
  void id;
}

/** Push this device's state; on conflict pull, merge, and push again. */
async function pushOnce(code: string): Promise<void> {
  const id = await syncId(code);
  for (let attempt = 0; attempt < 3; attempt++) {
    const blob = await sealState(code, snapshot());
    const res = await fetch(`/api/sync/${id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ blob, baseRev: readRev() }),
    });
    if (res.ok) {
      const body = (await res.json()) as { rev: number };
      writeRev(body.rev);
      return;
    }
    if (res.status === 409) {
      const cur = (await res.json()) as { rev: number; blob: string | null };
      await pullMerge(code, id, cur, true);
      continue;
    }
    throw new Error(res.status === 503 ? "Sync is not available on this server." : `Sync failed (${res.status}).`);
  }
  throw new Error("Sync kept conflicting. Try again.");
}

/** First contact on this device: pull what exists, merge, then push. */
async function initial(code: string): Promise<void> {
  const id = await syncId(code);
  const res = await fetch(`/api/sync/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status === 503 ? "Sync is not available on this server." : `Sync failed (${res.status}).`);
  const body = (await res.json()) as { rev: number; blob: string | null };
  if (body.blob && body.rev !== readRev()) await pullMerge(code, id, body, false);
  else if (!body.blob) writeRev(0);
  await pushOnce(code);
}

export function resetSyncRev() {
  writeRev(0);
}

/** Mount once. Keeps this device in step with its sync group. */
export function SyncEngine() {
  const code = useEfb((s) => s.syncKey);
  useEffect(() => {
    const status = useSyncStatus.getState();
    if (!code) {
      status.set({ state: "off", message: "" });
      return;
    }
    let cancel = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let busy = false;
    let again = false;

    const run = async (first: boolean) => {
      if (busy) {
        again = true;
        return;
      }
      busy = true;
      useSyncStatus.getState().set({ state: "syncing" });
      try {
        if (first) await initial(code);
        else await pushOnce(code);
        if (!cancel) useSyncStatus.getState().set({ state: "ok", lastSync: new Date().toISOString(), message: "" });
      } catch (e) {
        if (!cancel) useSyncStatus.getState().set({ state: "error", message: e instanceof Error ? e.message : "Sync failed." });
      } finally {
        busy = false;
        if (again && !cancel) {
          again = false;
          void run(false);
        }
      }
    };

    void run(true);
    const unsub = useEfb.subscribe((s, prev) => {
      if (applying || s === prev) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void run(false), 4000);
    });
    const onVis = () => {
      if (document.visibilityState === "visible") void run(true);
    };
    document.addEventListener("visibilitychange", onVis);
    const poll = setInterval(() => void run(true), 5 * 60 * 1000);
    return () => {
      cancel = true;
      unsub();
      if (timer) clearTimeout(timer);
      clearInterval(poll);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [code]);
  return null;
}
