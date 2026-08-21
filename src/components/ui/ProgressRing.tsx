/* ============================================================================
 * ProgressRing — حلقة تقدّم بـSVG خالص، بلا أي مكتبة رسوم.
 *
 * فُصلت عن HealthCurve لأن ذاك يستورد recharts (٤٢٨KB): بقاؤهما بملفٍ واحد
 * كان يجرّ مكتبة الرسوم كاملةً إلى كل شاشة تعرض حلقةً بسيطة — وإلى صفحة
 * الهبوط نفسها عبر برميل التصدير.
 * ==========================================================================*/
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
