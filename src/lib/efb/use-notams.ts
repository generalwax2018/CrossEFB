import { useEffect, useState } from "react";
import type { NotamPack } from "./notams";

const cache = new Map<string, { at: number; body: NotamPack }>();

/** NOTAMs for a set of airports. `configured` is false until FAA keys are set on the host. */
export function useNotams(icaos: string[]) {
  const key = [...new Set(icaos)].sort().join(",");
  const [pack, setPack] = useState<NotamPack | null>(null);
  useEffect(() => {
    if (!key) {
      setPack(null);
      return;
    }
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < 5 * 60 * 1000) {
      setPack(hit.body);
      return;
    }
    let cancel = false;
    void fetch(`/api/notams?ids=${key}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: NotamPack | null) => {
        if (cancel || !b) return;
        cache.set(key, { at: Date.now(), body: b });
        setPack(b);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [key]);
  return pack;
}
