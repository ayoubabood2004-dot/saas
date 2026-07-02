// recharts is ~434 KB (the app's single heaviest vendor chunk). The Dashboard is
// the post-login home screen, so importing recharts here statically made the
// first meaningful paint wait on that download. Isolating every recharts-backed
// chart in this one module lets the Dashboard lazy-load it AFTER paint — the page
// renders instantly with skeletons and the charts stream in a beat later.
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import { HealthCurve, type CurvePoint } from "@/components/ui";
import type { Species } from "@/types";

export function SpeciesDonut({ data, colors }: { data: { species: Species; value: number }[]; colors: Record<Species, string> }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="species" innerRadius={52} outerRadius={76} paddingAngle={3} stroke="none">
          {data.map((d) => <Cell key={d.species} fill={colors[d.species]} />)}
        </Pie>
      </PieChart>
    </ResponsiveContainer>
  );
}

export function ActivityCurve({ data, unit = "" }: { data: CurvePoint[]; unit?: string }) {
  return <HealthCurve data={data} unit={unit} />;
}
