import { useEffect, useState } from "react";
import {
  AirportCard,
  BrandMark,
  ChartTools,
  DisplayModeButton,
  Drawer,
  GpsChip,
  InstrumentBar,
  MobileSheet,
  MobileTabs,
  Rail,
  RouteSummaryPill,
  SearchBox,
  ZuluClock,
} from "./panels";
import { Chart } from "./chart";
import { DocumentDesk } from "./documents";
import { DataSourcesSheet, NearestSheet, TfrCard } from "./extras";
import { PlatesSheet } from "./plates-viewer";
import { LiveFeeds, useLive } from "@/lib/efb/live-store";
import { AdsbFeed } from "@/lib/efb/adsb";
import { SyncEngine } from "@/lib/efb/sync-engine";
import { OwnShip } from "./ownship";
import { useEfb } from "@/lib/efb/store";

function useIsDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return desktop;
}

export function Shell() {
  const tab = useEfb((s) => s.tab);
  const mode = useEfb((s) => s.chartMode);
  const selected = useEfb((s) => s.selected);
  const desktop = useIsDesktop();

  useEffect(() => {
    void Promise.resolve(useEfb.persist.rehydrate()).then(() => {
      // On a tablet or PC, open with the plan beside the chart.
      if (window.matchMedia("(min-width: 1024px)").matches && useEfb.getState().tab === "chart") {
        useEfb.getState().setTab("plan");
      }
    });
  }, []);

  // One attribute drives the UI theme and the chart palette.
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.ui = mode;
    root.dataset.chart = mode === "day" ? "day" : "night";
    const meta = document.querySelector('meta[name="theme-color"]');
    const bars: Record<string, string> = { day: "#f4f2ec", red: "#070000", green: "#000a03", yellow: "#0c0a00" };
    meta?.setAttribute("content", bars[mode] ?? "#0a0f0d");
  }, [mode]);

  // Escape closes the airport card, then the panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const s = useEfb.getState();
      if (s.selected) s.select(null);
      else if (s.tab !== "chart") s.setTab("chart");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showDocs = tab === "docs";
  // On phones the airport card and an open sheet would stack; the sheet wins.
  const showCard = desktop || tab === "chart";
  const pickedTfr = useLive((s) => s.pickedTfr);

  return (
    <main className="relative flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <OwnShip />
      <LiveFeeds />
      <AdsbFeed />
      <SyncEngine />
      <header className="z-30 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-bg px-3 sm:gap-3">
        <BrandMark />
        <SearchBox />
        <RouteSummaryPill />
        <div className="ml-auto flex shrink-0 items-center gap-2">
          <OfflineChip />
          <GpsChip />
          <div className="hidden sm:block">
            <ZuluClock />
          </div>
          <div className="md:hidden">
            <DisplayModeButton />
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {desktop && <Rail />}
        {desktop && <Drawer />}

        <section className="relative min-w-0 flex-1 overflow-hidden">
          {showDocs ? (
            <div className="h-full overflow-auto bg-bg">
              <DocumentDesk />
            </div>
          ) : (
            <>
              <Chart />
              <ChartTools />
              {showCard && selected && <AirportCard />}
              {showCard && <TfrCard />}
              <div
                className={`pointer-events-none absolute inset-x-2 bottom-2 z-10 sm:inset-x-3 sm:bottom-3 ${
                  showCard && (selected || pickedTfr) ? "hidden sm:block" : ""
                }`}
              >
                <div className="pointer-events-auto">
                  <InstrumentBar />
                </div>
              </div>
              {!desktop && <MobileSheet />}
            </>
          )}
        </section>
      </div>

      {!desktop && <MobileTabs />}
      <NearestSheet />
      <PlatesSheet />
      <DataSourcesSheet />
    </main>
  );
}

function OfflineChip() {
  const online = useLive((s) => s.online);
  if (online) return null;
  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-warn/50 bg-warn/10 px-2.5 font-mono text-[0.6875rem] text-warn">
      <span className="size-1.5 rounded-full bg-warn" />
      Offline
    </span>
  );
}
