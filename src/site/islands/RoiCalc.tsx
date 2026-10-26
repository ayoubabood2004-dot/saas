/* حاسبةُ الجرعات المعزّزة الفائتة — بأرقام العيادة نفسها لا بأرقامنا. النتيجةُ تقديرٌ يقوله
 * سطرُ الملاحظة صراحةً؛ لا وعدَ بأن النظام يستردّها كلَّها. */
import { useState } from "react";
import { editionByCode, fmtPrice } from "../editions";

export interface RoiCalcProps {
  edition: string;
  currency: string;
  title: string;
  sub: string;
  missedLabel: string;
  feeLabel: string;
  result: string;
  note: string;
  defaults: { missed: number; fee: number };
}

export default function RoiCalc(p: RoiCalcProps) {
  const ed = editionByCode(p.edition)!;
  const [missed, setMissed] = useState(p.defaults.missed);
  const [fee, setFee] = useState(p.defaults.fee);
  const total = Math.max(0, missed) * Math.max(0, fee);
  const field = "mt-1.5 w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-base text-navy outline-none focus:border-brand-400";
  return (
    <div className="card grid gap-6 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div>
        <h3 className="font-display text-xl font-bold">{p.title}</h3>
        <p className="mt-2 text-sm leading-7 text-navy-3">{p.sub}</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold text-navy-2">
            {p.missedLabel}
            <input type="number" inputMode="numeric" min={0} dir="ltr" value={missed} onChange={(e) => setMissed(Number(e.target.value) || 0)} className={field} />
          </label>
          <label className="text-sm font-semibold text-navy-2">
            {p.feeLabel} ({ed.lang === "ar" ? ed.symAr : ed.symEn})
            <input type="number" inputMode="numeric" min={0} dir="ltr" value={fee} onChange={(e) => setFee(Number(e.target.value) || 0)} className={field} />
          </label>
        </div>
      </div>
      <div className="flex flex-col justify-center rounded-2xl bg-stamp-50 p-6">
        <p className="font-display text-2xl font-bold leading-snug text-stamp" aria-live="polite">
          {p.result.replace("{{amount}}", fmtPrice(ed, p.currency, total))}
        </p>
        <p className="mt-3 text-xs leading-6 text-navy-3">{p.note}</p>
      </div>
    </div>
  );
}
