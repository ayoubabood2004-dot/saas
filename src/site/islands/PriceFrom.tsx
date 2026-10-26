/* «يبدأ من …» بالرئيسية — جزيرةٌ لا نصٌّ ثابت، لأن الرقمَ وعدٌ: يُسأل حيّاً كبطاقات الأسعار فلا
 * تعرض الرئيسيةُ سعراً قديماً بعد أن غيّره المالكُ من لوحته. */
import { useEffect, useState } from "react";
import { editionByCode, fmtPrice, priceFor } from "../editions";
import { livePricing } from "../livePricing";
import type { PricingData } from "../types";

export interface PriceFromProps {
  edition: string;
  data: PricingData;
  from: string;
  perMonth: string;
}

export default function PriceFrom({ edition, data: initial, from, perMonth }: PriceFromProps) {
  const ed = editionByCode(edition)!;
  const [data, setData] = useState(initial);
  useEffect(() => {
    let alive = true;
    livePricing().then((d) => { if (alive && d) setData(d); }).catch(() => { /* يبقى سعرُ البناء */ });
    return () => { alive = false; };
  }, []);
  const basic = priceFor(ed, "basic", data);
  return (
    <p className="font-display text-3xl font-bold">
      <span className="text-base font-semibold text-navy-3">{from} </span>
      <span className="num" dir="auto">{fmtPrice(ed, basic.currency, basic.monthly)}</span>
      <span className="text-base font-semibold text-navy-3"> {perMonth}</span>
    </p>
  );
}
