import { useEffect, useState, type ButtonHTMLAttributes, type ReactNode } from "react";

/** Merge class names, skipping falsy entries. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

/**
 * Numeric text field.
 *
 * The previous inputs read `valueAsNumber` from `<input>` elements without
 * `type="number"`, which is always NaN, so no numeric field could be edited.
 * This keeps a local draft string (so "29." or "-" can be typed), parses it,
 * and commits only finite numbers. It resyncs when the store changes.
 */
export function NumField({
  label,
  value,
  onChange,
  suffix,
  min,
  max,
  decimals,
  className,
  mono = true,
  pad,
}: {
  label?: ReactNode;
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  min?: number;
  max?: number;
  decimals?: number;
  className?: string;
  mono?: boolean;
  /** Zero-pad to this many digits on display (e.g. 3 for headings). */
  pad?: number;
}) {
  const show = (n: number) => {
    if (!Number.isFinite(n)) return "";
    const s = decimals != null ? n.toFixed(decimals) : String(n);
    return pad ? s.padStart(pad, "0") : s;
  };
  const [draft, setDraft] = useState(show(value));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(show(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editing]);

  const commit = (text: string) => {
    const n = Number.parseFloat(text.replace(",", "."));
    if (!Number.isFinite(n)) return;
    let next = n;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    onChange(next);
  };

  const input = (
    <div className="relative">
      <input
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        className={cx("field tnum", mono && "font-mono", suffix && "pr-10")}
        value={draft}
        onFocus={(e) => {
          setEditing(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setEditing(false);
          setDraft(show(value));
        }}
        onChange={(e) => {
          setDraft(e.target.value);
          commit(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
      />
      {suffix && (
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-faint">
          {suffix}
        </span>
      )}
    </div>
  );

  if (!label) return <div className={className}>{input}</div>;
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {input}
    </label>
  );
}

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  mono,
  upper,
  className,
}: {
  label?: ReactNode;
  value: string;
  onChange: (s: string) => void;
  placeholder?: string;
  mono?: boolean;
  upper?: boolean;
  className?: string;
}) {
  const input = (
    <input
      className={cx("field", mono && "font-mono", upper && "uppercase")}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
    />
  );
  if (!label) return <div className={className}>{input}</div>;
  return (
    <label className={cx("flex flex-col gap-1.5", className)}>
      <span className="text-xs font-medium text-muted">{label}</span>
      {input}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md";
  icon?: ReactNode;
};

export function Btn({ variant = "secondary", size = "md", icon, className, children, ...rest }: BtnProps) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-[0.625rem] font-medium transition-[background,border-color,transform] active:scale-[0.98]",
        size === "md" ? "h-11 px-4 text-sm" : "h-9 px-3 text-xs",
        variant === "primary" && "bg-amber text-ink hover:brightness-110",
        variant === "secondary" && "border border-line bg-surface text-fg hover:border-line-strong hover:bg-hover",
        variant === "ghost" && "text-muted hover:bg-hover hover:text-fg",
        variant === "danger" && "text-muted hover:bg-bad/10 hover:text-bad",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}

export function IconBtn({
  label,
  active,
  className,
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; active?: boolean }) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cx(
        "flex size-11 items-center justify-center rounded-[0.625rem] transition-colors",
        active ? "bg-amber-soft text-amber" : "text-fg hover:bg-hover",
        className,
      )}
    >
      {children}
    </button>
  );
}

/** iOS-style switch. */
export function Toggle({ on, onChange, label }: { on: boolean; onChange: (on: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={cx(
        "relative h-7 w-12 shrink-0 rounded-full transition-colors",
        on ? "bg-amber" : "bg-raised ring-1 ring-line-strong",
      )}
    >
      <span
        className={cx(
          "absolute top-1 size-5 rounded-full bg-fg shadow transition-[left]",
          on ? "left-6 bg-ink" : "left-1",
        )}
      />
    </button>
  );
}

/** Segmented control. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className,
}: {
  value: T;
  options: { id: T; label: ReactNode; title?: string }[];
  onChange: (id: T) => void;
  className?: string;
}) {
  return (
    <div className={cx("flex rounded-[0.75rem] border border-line bg-bg p-1", className)} role="tablist">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={on}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={cx(
              "flex h-9 flex-1 items-center justify-center gap-1.5 rounded-[0.5rem] px-3 text-xs font-semibold transition-colors",
              on ? "bg-raised text-fg shadow-sm ring-1 ring-line-strong" : "text-muted hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Display                                                             */
/* ------------------------------------------------------------------ */

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-card border border-line bg-surface", className)}>{children}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2">
      <h2 className="eyebrow">{children}</h2>
      {action}
    </div>
  );
}

/** Small labeled numeric readout. */
export function Readout({
  label,
  value,
  unit,
  tone,
  className,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "warn" | "bad" | "good";
  className?: string;
}) {
  return (
    <div className={cx("min-w-0 rounded-[0.75rem] border border-line bg-surface px-3 py-2", className)}>
      <div className="truncate text-[0.6875rem] font-semibold tracking-wider text-muted uppercase">{label}</div>
      <div
        className={cx(
          "tnum mt-0.5 truncate font-mono text-lg leading-tight font-medium",
          tone === "warn" && "text-warn",
          tone === "bad" && "text-bad",
          tone === "good" && "text-good",
        )}
      >
        {value}
        {unit && <span className="ml-1 text-xs font-normal text-muted">{unit}</span>}
      </div>
    </div>
  );
}

export type FltCat = "VFR" | "MVFR" | "IFR" | "LIFR" | string;

export function catColor(cat: FltCat | null | undefined): string {
  switch ((cat ?? "").toUpperCase()) {
    case "VFR":
      return "var(--color-vfr)";
    case "MVFR":
      return "var(--color-mvfr)";
    case "IFR":
      return "var(--color-ifr)";
    case "LIFR":
      return "var(--color-lifr)";
    default:
      return "var(--color-faint)";
  }
}

/** Flight-category pill using the standard VFR/MVFR/IFR/LIFR colors. */
export function CatBadge({ cat, className }: { cat: FltCat | null | undefined; className?: string }) {
  const label = (cat ?? "").toUpperCase() || "—";
  const known = ["VFR", "MVFR", "IFR", "LIFR"].includes(label);
  return (
    <span
      className={cx(
        "inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 font-mono text-[0.6875rem] font-semibold",
        className,
      )}
      style={{
        color: catColor(cat),
        background: known ? `color-mix(in srgb, ${catColor(cat)} 16%, transparent)` : "var(--color-raised)",
      }}
    >
      <span className="size-1.5 rounded-full" style={{ background: catColor(cat) }} />
      {known ? label : "NO WX"}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="hidden h-5 min-w-5 items-center justify-center rounded border border-line-strong px-1 font-mono text-[0.625rem] text-muted sm:inline-flex">
      {children}
    </kbd>
  );
}

/**
 * Runway + wind diagram. Draws the runway at its heading and the wind
 * arrow coming from `wdir`. Head/cross components are shown beside it.
 */
export function WindRunway({
  rwyHdg,
  rwyLabel,
  wdir,
  wspd,
  size = 88,
}: {
  rwyHdg: number;
  rwyLabel?: string;
  wdir: number | null;
  wspd: number | null;
  size?: number;
}) {
  const c = size / 2;
  const r = c - 6;
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Wind and runway">
      <circle cx={c} cy={c} r={r} fill="var(--color-bg)" stroke="var(--color-line-strong)" />
      {ticks.map((t) => {
        const a = ((t - 90) * Math.PI) / 180;
        const long = t % 90 === 0;
        const r1 = r - (long ? 6 : 3);
        return (
          <line
            key={t}
            x1={(c + Math.cos(a) * r1).toFixed(2)}
            y1={(c + Math.sin(a) * r1).toFixed(2)}
            x2={(c + Math.cos(a) * r).toFixed(2)}
            y2={(c + Math.sin(a) * r).toFixed(2)}
            stroke={long ? "var(--color-muted)" : "var(--color-line-strong)"}
            strokeWidth={long ? 1.2 : 0.8}
          />
        );
      })}
      <text x={c} y={13} textAnchor="middle" fontSize={8} fill="var(--color-muted)" fontFamily="var(--font-mono)">
        N
      </text>
      <g transform={`rotate(${rwyHdg} ${c} ${c})`}>
        <rect x={c - 5} y={c - r + 12} width={10} height={(r - 12) * 2} rx={2} fill="var(--color-raised)" stroke="var(--color-line-strong)" />
        <line x1={c} y1={c - r + 16} x2={c} y2={c + r - 16} stroke="var(--color-muted)" strokeDasharray="3 3" strokeWidth={1} />
      </g>
      {wdir != null && (wspd ?? 0) > 0 && (
        <g transform={`rotate(${wdir} ${c} ${c})`}>
          <line x1={c} y1={c - r + 2} x2={c} y2={c - 8} stroke="var(--color-cyan)" strokeWidth={2.4} strokeLinecap="round" />
          <polygon points={`${c},${c - 4} ${c - 5},${c - 13} ${c + 5},${c - 13}`} fill="var(--color-cyan)" />
        </g>
      )}
      {rwyLabel && (
        <text
          x={c}
          y={size - 4}
          textAnchor="middle"
          fontSize={8}
          fill="var(--color-fg)"
          fontFamily="var(--font-mono)"
          fontWeight={600}
        >
          {rwyLabel}
        </text>
      )}
    </svg>
  );
}
