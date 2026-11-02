import { useEffect } from "react";
import { ActivePanel, AirportCard, ChartTools, InstrumentBar, SearchBox, SideNav, ZuluClock } from "./panels";
import { Chart } from "./chart";
import { DocumentDesk } from "./documents";
import { OwnShip } from "./ownship";
import { useEfb } from "@/lib/efb/store";

export function Shell() {
  const tab = useEfb((s) => s.tab);

  useEffect(() => {
    void useEfb.persist.rehydrate();
  }, []);

  const showPanel = tab !== "chart";

  return (
    <main className="flex h-dvh flex-col bg-bg text-fg">
      <OwnShip />
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-3">
        <div className="leading-none">
          <div className="text-sm font-semibold tracking-widest">CROSS EFB</div>
          <div className="mt-1 hidden text-xs text-muted sm:block">Android · PC</div>
        </div>
        <SearchBox />
        <div className="hidden sm:block">
          <ZuluClock />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 flex-col border-r border-line md:flex">
          <SideNav />
          <div className="min-h-0 flex-1 overflow-auto p-3">
            <ActivePanel />
          </div>
        </aside>

        <section className="relative min-w-0 flex-1">
          {tab === "docs" ? (
            <div className="h-full overflow-auto bg-bg p-3">
              <DocumentDesk />
            </div>
          ) : (
            <>
              <Chart />
              <ChartTools />
              <AirportCard />
              {showPanel && (
                <div className="absolute inset-0 z-20 overflow-auto bg-bg p-3 md:hidden">
                  <ActivePanel />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 z-10 border-t border-line bg-bg/95">
                <InstrumentBar />
              </div>
            </>
          )}
        </section>
      </div>

      <nav className="shrink-0 border-t border-line md:hidden">
        <SideNav mobile />
      </nav>
    </main>
  );
}
