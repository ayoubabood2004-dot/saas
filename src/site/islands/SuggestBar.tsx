/* اقتراحُ النسخة — لا تحويل. إن دلّ جهازُ الزائر (منطقتُه الزمنية أو لغتُه) على بلدٍ غيرِ نسخة
 * الصفحة المفتوحة، وما اختار نسخةً قبلُ، يظهر شريطٌ يُغلق: «يبيّن إنك بمصر — تشوف صفحة مصر؟».
 * بالخادم لا يُرسم شيء (الحكمُ للجهاز وحده)، فلا يرى الزاحفُ ولا الصفحةُ المولَّدة إلا المحتوى. */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { rememberEdition } from "./EditionSwitcher";

export interface SuggestBarProps {
  current: string;
  names: Record<string, string>;
  tz: Record<string, string>;
  text: string;
  yes: string;
  no: string;
  rest: string;
}

const DISMISS = "dv_suggest_off";

function guess(tz: Record<string, string>, names: Record<string, string>): string | null {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    if (tz[zone]) return tz[zone];
  } catch { /* ignore */ }
  try {
    for (const l of navigator.languages ?? [navigator.language]) {
      const region = /-([A-Za-z]{2})\b/.exec(l ?? "")?.[1]?.toLowerCase();
      if (region && names[region]) return region;
    }
  } catch { /* ignore */ }
  return null;
}

export default function SuggestBar({ current, names, tz, text, yes, no, rest }: SuggestBarProps) {
  const [to, setTo] = useState<string | null>(null);
  useEffect(() => {
    try {
      if (localStorage.getItem("dv_edition") || sessionStorage.getItem(DISMISS)) return;
    } catch { return; }
    const g = guess(tz, names);
    if (g && g !== current) setTo(g);
  }, [current, tz, names]);
  if (!to) return null;
  const close = () => { try { sessionStorage.setItem(DISMISS, "1"); } catch { /* ignore */ } setTo(null); };
  return (
    <div className="border-b border-stamp/15 bg-stamp-50">
      <div className="container flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
        <p className="text-navy-2">{text.replace(/\{\{country\}\}/g, names[to] ?? to)}</p>
        <div className="flex items-center gap-2">
          <a href={`/${to}${rest}`} onClick={() => rememberEdition(to)} className="rounded-full bg-stamp px-4 py-1.5 font-semibold text-white">{yes}</a>
          <button type="button" onClick={() => { rememberEdition(current); close(); }} className="rounded-full px-3 py-1.5 font-semibold text-navy-2 hover:bg-white">{no}</button>
          <button type="button" onClick={close} aria-label={no} className="grid h-8 w-8 place-items-center rounded-full text-navy-3 hover:bg-white"><X size={16} aria-hidden /></button>
        </div>
      </div>
    </div>
  );
}
