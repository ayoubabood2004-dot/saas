/* ============================================================================
 * بطاقةُ التطعيم — توقيعُ الموقع.
 *
 * أكثرُ ما يعرفه الطبيبُ البيطريّ وصاحبُ الحيوان معاً: دفترُ التطعيم بأختامه. فالبطلُ ليس صورةَ
 * شاشةٍ عامّة بل صفحةٌ من سجلّ حيوان: جرعاتٌ مختومةٌ بتاريخها، وجرعةٌ مستحقّة، ورسالةُ تذكيرها
 * جاهزةٌ ترسلها العيادةُ بلمسة — وهذا بالضبط ما يفعله النظام (لا «يرسل تلقائياً»).
 * الأختامُ تنطبع واحداً تلو الآخر عند التحميل، وتسكن لمن طلب تقليلَ الحركة.
 * ==========================================================================*/
import { PawPrint, Send } from "lucide-react";
import type { BookletContent } from "./types";

export function Booklet({ c }: { c: BookletContent }) {
  return (
    <figure className="relative mx-auto w-full max-w-[460px]">
      {/* ظلُّ الورقة الثانية — دفترٌ لا بطاقةٌ مسطّحة */}
      <div aria-hidden className="absolute inset-x-4 -bottom-3 top-4 -z-10 rounded-[28px] bg-stamp-100/70" />
      <div className="overflow-hidden rounded-[28px] border border-rule bg-white shadow-[0_40px_80px_-40px_rgb(15_30_53/0.45)]">
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-rule bg-[linear-gradient(180deg,#F0EEFC,#fff)] px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-stamp text-white"><PawPrint size={20} aria-hidden /></span>
            <div>
              <p className="font-display text-base font-bold text-navy">{c.pet}</p>
              <p className="text-xs text-navy-3">{c.owner}</p>
            </div>
          </div>
          <span className="rounded-full bg-white/80 px-2.5 py-0.5 text-[11px] font-semibold text-navy-3 ring-1 ring-rule">{c.label}</span>
        </div>

        <div className="px-6 pb-6 pt-4">
          <p className="mb-3 font-display text-sm font-semibold text-stamp">{c.title}</p>
          <ol className="space-y-2.5">
            {c.rows.map((r, i) => (
              <li key={r.vaccine} className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-2.5 ${r.status === "due" ? "bg-due-50 ring-1 ring-due/25" : "bg-paper"}`}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-6 text-navy">{r.vaccine}</p>
                  <p className="num font-mono text-xs text-navy-3" dir="ltr">{r.date}</p>
                </div>
                {r.status === "given" ? (
                  <span
                    className="stamp h-12 w-12 animate-stamp bg-white/60 text-[10px] font-bold leading-tight"
                    style={{ animationDelay: `${250 + i * 260}ms` }}
                  >
                    {c.givenStamp}
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full bg-due px-3 py-1 text-xs font-bold text-white">{c.dueBadge}</span>
                )}
              </li>
            ))}
          </ol>

          {/* رسالةُ التذكير جاهزةٌ — والعيادةُ ترسلها بلمسةٍ من واتسابها هي */}
          <div className="mt-5 animate-rise" style={{ animationDelay: `${300 + c.rows.length * 260}ms` }}>
            <div className="rounded-2xl rounded-ss-sm bg-[#DCF8C6] px-4 py-3 text-sm leading-7 text-[#1F2C34] shadow-sm">
              {c.message}
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-navy-3">{c.oneTap}</span>
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-[#25D366] px-3.5 py-1.5 text-xs font-bold text-white">
                <Send size={13} aria-hidden className="rtl:-scale-x-100" /> {c.send}
              </span>
            </div>
          </div>
        </div>
      </div>
    </figure>
  );
}
