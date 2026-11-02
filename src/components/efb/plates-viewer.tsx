import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ExternalLink, FileText, Maximize2, Minus, Moon, Plus, RotateCw, Sun, X } from "lucide-react";
import { PLATE_GROUPS, type Plate, type PlateAirport } from "@/lib/efb/plates";
import { useEfb } from "@/lib/efb/store";
import { cx, IconBtn } from "./ui";

type PlatesResponse = { ok: boolean; cycle: string; from?: string; to?: string; airport: PlateAirport | null };

type PdfDoc = { numPages: number; getPage: (n: number) => Promise<PdfPage>; destroy: () => Promise<void> };
type PdfPage = {
  getViewport: (o: { scale: number; rotation?: number }) => { width: number; height: number };
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => { promise: Promise<void>; cancel: () => void };
};

let pdfjsReady: Promise<{ getDocument: (src: { url: string }) => { promise: Promise<PdfDoc> } }> | null = null;

function loadPdfjs() {
  if (!pdfjsReady) {
    pdfjsReady = (async () => {
      const pdfjs = await import("pdfjs-dist");
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs as unknown as { getDocument: (src: { url: string }) => { promise: Promise<PdfDoc> } };
    })();
  }
  return pdfjsReady;
}

/** Full-screen plates browser and viewer for one airport. */
export function PlatesSheet() {
  const icao = useEfb((s) => s.platesFor);
  const close = useEfb((s) => s.setPlatesFor);
  const mode = useEfb((s) => s.chartMode);
  const [data, setData] = useState<PlatesResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState<Plate | null>(null);

  useEffect(() => {
    if (!icao) return;
    setData(null);
    setFailed(false);
    setOpen(null);
    let cancel = false;
    fetch(`/api/plates/${icao}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((b: PlatesResponse | null) => {
        if (cancel) return;
        if (!b || !b.ok) setFailed(true);
        setData(b);
        // Open the airport diagram straight away when there is one.
        const apd = b?.airport?.plates.find((p) => p.code === "APD");
        if (apd) setOpen(apd);
      })
      .catch(() => {
        if (!cancel) setFailed(true);
      });
    return () => {
      cancel = true;
    };
  }, [icao]);

  const groups = useMemo(() => {
    const plates = data?.airport?.plates ?? [];
    return PLATE_GROUPS.map((g) => ({ ...g, plates: plates.filter((p) => g.codes.includes(p.code)) })).filter((g) => g.plates.length);
  }, [data]);

  if (!icao) return null;
  const airport = data?.airport;

  return (
    <div className="absolute inset-0 z-50 flex animate-fade-in flex-col bg-bg" role="dialog" aria-modal="true" aria-label={`${icao} plates`}>
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-line px-2">
        {open && groups.length > 0 ? (
          <IconBtn label="All charts" onClick={() => setOpen(null)}>
            <ChevronLeft className="size-5" />
          </IconBtn>
        ) : (
          <span className="flex size-11 items-center justify-center text-amber">
            <FileText className="size-5" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            <span className="font-mono text-amber">{icao}</span> {open ? `· ${open.name}` : airport ? `· ${airport.name}` : ""}
          </p>
          <p className="truncate font-mono text-[0.6875rem] text-faint">
            {data?.cycle ? `FAA d-TPP cycle ${data.cycle}${data.to ? ` · valid to ${data.to}` : ""}` : "Loading charts…"}
          </p>
        </div>
        <IconBtn label="Close plates" onClick={() => close(null)}>
          <X className="size-5" />
        </IconBtn>
      </header>

      {open && data?.cycle ? (
        <PdfView key={open.pdf} cycle={data.cycle} plate={open} darkDefault={mode !== "day"} />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mx-auto flex max-w-2xl flex-col gap-5">
            {!data && !failed && <p className="text-sm text-muted">Loading the FAA chart index…</p>}
            {failed && (
              <p className="rounded-[0.75rem] border border-warn/40 bg-warn/10 p-3 text-sm text-warn">
                The FAA chart index did not load. Check the connection and try again.
              </p>
            )}
            {data && !failed && !airport && (
              <p className="text-sm text-muted">The FAA publishes no terminal procedures or diagram for {icao}.</p>
            )}
            {groups.map((g) => (
              <section key={g.id}>
                <h2 className="eyebrow mb-2">{g.label}</h2>
                <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {g.plates.map((p) => (
                    <li key={p.pdf + p.name}>
                      <button
                        onClick={() => setOpen(p)}
                        className="flex w-full items-center gap-2 rounded-[0.75rem] border border-line bg-surface px-3 py-2.5 text-left text-sm hover:border-line-strong hover:bg-hover"
                      >
                        <span className="w-9 shrink-0 font-mono text-[0.625rem] font-bold text-faint">{p.code}</span>
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <p className="text-xs text-faint">
              Charts come straight from the FAA for the current cycle. Not for navigation without checking currency and NOTAMs.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function PdfView({ cycle, plate, darkDefault }: { cycle: string; plate: Plate; darkDefault: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PdfDoc | null>(null);
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [dark, setDark] = useState(darkDefault);
  const [error, setError] = useState("");
  const url = `/api/plates/pdf/${cycle}/${plate.pdf}`;

  useEffect(() => {
    let cancel = false;
    let loaded: PdfDoc | null = null;
    setDoc(null);
    setError("");
    setPage(1);
    loadPdfjs()
      .then((pdfjs) => pdfjs.getDocument({ url }).promise)
      .then((d) => {
        loaded = d;
        if (!cancel) setDoc(d);
      })
      .catch(() => {
        if (!cancel) setError("This chart did not load.");
      });
    return () => {
      cancel = true;
      void loaded?.destroy();
    };
  }, [url]);

  useEffect(() => {
    if (!doc || !canvasRef.current || !wrapRef.current) return;
    let task: { cancel: () => void } | null = null;
    let cancel = false;
    void doc.getPage(page).then((p) => {
      if (cancel || !canvasRef.current || !wrapRef.current) return;
      const base = p.getViewport({ scale: 1, rotation });
      const fit = Math.min((wrapRef.current.clientWidth - 16) / base.width, (wrapRef.current.clientHeight - 16) / base.height);
      const dpr = Math.min(3, window.devicePixelRatio || 1);
      const scale = Math.max(0.2, fit * zoom);
      const vp = p.getViewport({ scale: scale * dpr, rotation });
      const canvas = canvasRef.current;
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
      canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const r = p.render({ canvasContext: ctx, viewport: vp });
      task = r;
      r.promise.catch(() => undefined);
    });
    return () => {
      cancel = true;
      task?.cancel();
    };
  }, [doc, page, zoom, rotation]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-auto bg-raised">
        {!doc && !error && <p className="p-6 text-center text-sm text-muted">Loading chart…</p>}
        {error && <p className="p-6 text-center text-sm text-warn">{error}</p>}
        <div className="flex min-h-full min-w-full items-center justify-center p-2">
          <canvas
            ref={canvasRef}
            className={cx("bg-white shadow-lg transition-[filter]", dark && "[filter:invert(0.92)_hue-rotate(180deg)]", !doc && "hidden")}
          />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 border-t border-line bg-bg px-2 py-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))]">
        <IconBtn label="Zoom out" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>
          <Minus className="size-4" />
        </IconBtn>
        <IconBtn label="Fit" onClick={() => setZoom(1)}>
          <Maximize2 className="size-4" />
        </IconBtn>
        <IconBtn label="Zoom in" onClick={() => setZoom((z) => Math.min(6, z * 1.25))}>
          <Plus className="size-4" />
        </IconBtn>
        <IconBtn label="Rotate" onClick={() => setRotation((r) => (r + 90) % 360)}>
          <RotateCw className="size-4" />
        </IconBtn>
        <IconBtn label={dark ? "Show original colors" : "Night colors"} active={dark} onClick={() => setDark((d) => !d)}>
          {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
        </IconBtn>
        {doc && doc.numPages > 1 && (
          <div className="ml-2 flex items-center gap-1 font-mono text-xs">
            <IconBtn label="Previous page" disabled={page <= 1} onClick={() => setPage((n) => Math.max(1, n - 1))}>
              <ChevronLeft className="size-4" />
            </IconBtn>
            {page}/{doc.numPages}
            <IconBtn label="Next page" disabled={page >= doc.numPages} onClick={() => setPage((n) => Math.min(doc.numPages, n + 1))}>
              <ChevronLeft className="size-4 rotate-180" />
            </IconBtn>
          </div>
        )}
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="ml-auto inline-flex h-9 items-center gap-1 rounded-[0.625rem] px-2 text-xs text-muted hover:bg-hover hover:text-fg"
        >
          PDF <ExternalLink className="size-3.5" />
        </a>
      </div>
    </div>
  );
}
