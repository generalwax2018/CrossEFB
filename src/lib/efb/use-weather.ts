import { useEffect, useRef, useState } from "react";
import type { WxBundle } from "./types";
import { fetchWeather } from "./weather";

const wxCache = new Map<string, { at: number; data: WxBundle }>();

export function useWeather(icaos: string[]) {
  const key = icaos.join(",");
  const [data, setData] = useState<WxBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const req = useRef(0);

  const load = async (force: boolean) => {
    if (!key) {
      setData(null);
      setFailed(false);
      return;
    }
    const hit = wxCache.get(key);
    if (!force && hit && Date.now() - hit.at < 5 * 60 * 1000) {
      setData(hit.data);
      setFailed(false);
      return;
    }
    const ticket = ++req.current;
    setLoading(true);
    try {
      const bundle = await fetchWeather({ data: { icaos } });
      if (ticket !== req.current) return;
      const live = bundle.source === "live" && bundle.metars.length > 0;
      if (live) wxCache.set(key, { at: Date.now(), data: bundle });
      setData(bundle);
      setFailed(!live);
    } catch {
      if (ticket !== req.current) return;
      setFailed(true);
    } finally {
      if (ticket === req.current) setLoading(false);
    }
  };

  useEffect(() => {
    void load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading, failed, reload: () => void load(true) };
}
