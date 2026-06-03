import { useId } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export interface CurvePoint {
  label: string;
  value: number;
}

/**
 * Smooth gradient health/activity curve (ref img 1 "Health Curve").
 * Minimal axes, soft area fill, brand-blue stroke.
 */
export function HealthCurve({
  data,
  color = "#1266d8",
  height = 160,
  unit = "",
}: {
  data: CurvePoint[];
  color?: string;
  height?: number;
  unit?: string;
}) {
  const gid = useId().replace(/:/g, "");
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.32} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "rgb(var(--ink-subtle))", fontSize: 11 }}
            dy={6}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={28}
            tick={{ fill: "rgb(var(--ink-subtle))", fontSize: 11 }}
          />
          <Tooltip
            cursor={{ stroke: color, strokeOpacity: 0.25, strokeWidth: 2 }}
            contentStyle={{
              borderRadius: 14,
              border: "1px solid rgb(var(--line))",
              background: "rgb(var(--surface-1))",
              color: "rgb(var(--ink))",
              fontSize: 12,
              boxShadow: "0 18px 48px -16px rgb(var(--shadow) / 0.28)",
            }}
            labelStyle={{ color: "rgb(var(--ink-muted))" }}
            formatter={(v: number) => [`${v}${unit}`, ""]}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={3}
            fill={`url(#grad-${gid})`}
            dot={{ r: 0 }}
            activeDot={{ r: 5, strokeWidth: 2, stroke: "rgb(var(--surface-1))" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Circular progress ring with a center label (ref img 1 "kcal left"). */
export function ProgressRing({
  value,
  max = 100,
  size = 132,
  stroke = 12,
  color = "#1266d8",
  centerTop,
  centerBottom,
}: {
  value: number;
  max?: number;
  size?: number;
  stroke?: number;
  color?: string;
  centerTop?: React.ReactNode;
  centerBottom?: React.ReactNode;
}) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgb(var(--line))" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
          style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.16,1,0.3,1)" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          {centerTop && <p className="font-display text-2xl font-extrabold leading-none text-ink">{centerTop}</p>}
          {centerBottom && <p className="mt-1 text-2xs uppercase tracking-wider text-ink-subtle">{centerBottom}</p>}
        </div>
      </div>
    </div>
  );
}
