import React from "react";

type Datum = { label: string; value: number };

export function SimpleBarChart({
  data,
  height = 140,
  colorClassName = "fill-emerald-500",
  valueFormatter,
}: {
  data: Datum[];
  height?: number;
  colorClassName?: string;
  valueFormatter?: (v: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));

  return (
    <div className="w-full">
      <div className="flex items-end gap-2 h-[140px]" style={{ height }}>
        {data.map((d) => {
          const h = Math.round((d.value / max) * (height - 18));
          return (
            <div key={d.label} className="flex-1 min-w-0 flex flex-col items-center gap-1">
              <div className="text-[11px] text-slate-500 tabular-nums">
                {valueFormatter ? valueFormatter(d.value) : d.value.toLocaleString("ru")}
              </div>
              <svg width="100%" height={height - 18} viewBox={`0 0 100 ${height - 18}`} preserveAspectRatio="none">
                <rect x="8" y={(height - 18) - h} width="84" height={h} rx="8" className={colorClassName} opacity={0.85} />
                <rect x="8" y="0" width="84" height={(height - 18)} rx="8" className="fill-slate-200" opacity={0.15} />
              </svg>
              <div className="text-[11px] text-slate-500 truncate w-full text-center" title={d.label}>
                {d.label}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

