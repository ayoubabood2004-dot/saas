import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { DIAL_CODES, POPULAR_CODES, POPULAR_ISO, dialName, parsePhone, type DialCodeInfo } from "@/lib/dialcodes";
import { getDialCode } from "@/lib/settings";

/**
 * Phone entry with a per-number country-code selector. Defaults to the clinic's
 * configured code, but can be changed per number (foreign clients). Emits a stored
 * string like "+1 5551234567"; pass "" for empty.
 *
 * القائمة تغطي كل دول العالم، فالتنظيم مهم: مجموعة «الأكثر استعمالاً» أولاً
 * ثم كل الدول مرتّبة. ومربع البحث لا يظهر إلا بالطلب (أو تلقائياً إذا الرقم
 * المعروض لدولة غير شائعة) — فالنماذج التسعة التي فيها هاتف تبقى نظيفة،
 * والوصول لأي دولة يبقى بضغطة وكتابة حرفين.
 */
export function PhoneInput({ value, onChange }: { value: string; onChange: (full: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const fallback = getDialCode();
  // Initialise once from the incoming value; the component remounts when a modal reopens.
  const parsed = parsePhone(value, fallback);
  const [code, setCode] = useState(parsed.code);
  const [national, setNational] = useState(parsed.national);
  const [q, setQ] = useState("");
  // رقم أجنبي غير شائع؟ نفتح البحث فوراً — الموظف يعرف وين هو بلا تخمين.
  const [searchOpen, setSearchOpen] = useState(
    () => !POPULAR_ISO.includes(DIAL_CODES.find((d) => d.code === parsed.code)?.iso ?? "IQ"),
  );

  const emit = (c: string, n: string) => {
    const nat = n.replace(/\D/g, "");
    onChange(nat ? `${c} ${nat}` : "");
  };
  const pick = (c: string) => { setCode(c); emit(c, national); };

  // مفتاح مخصّص غير موجود بالقائمة (عيادة ضبطت مفتاحاً يدوياً) يبقى مختاراً.
  const custom: DialCodeInfo | null = DIAL_CODES.some((d) => d.code === code)
    ? null
    : { code, name: code, nameAr: code, iso: "", flag: "🌐" };

  const term = q.trim();
  const tl = term.toLowerCase();
  const digits = term.replace(/\D/g, "");
  const matches = term
    ? DIAL_CODES.filter((d) =>
      d.name.toLowerCase().includes(tl)
      || d.nameAr.includes(term)
      || d.iso.toLowerCase() === tl
      || (digits && d.code.replace("+", "").startsWith(digits)))
    : [];

  // الاسم أولاً ثم العلم ثم المفتاح: يجعل بحث المتصفح الفوري (بالكتابة داخل
  // القائمة) يطابق اسم الدولة بدل ما يتعثّر بالإيموجي.
  const label = (d: DialCodeInfo) => `${dialName(d, lang)} ${d.flag} ${d.code}`;

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <select
          className="input w-36 shrink-0 px-2"
          value={code}
          onChange={(e) => pick(e.target.value)}
          aria-label={t("phone.country", "الدولة")}
        >
          {custom && <option value={custom.code}>{custom.flag} {custom.code}</option>}
          {term ? (
            <optgroup label={t("phone.results", "نتائج البحث")}>
              {matches.length === 0
                ? <option value={code} disabled>{t("phone.noMatch", "لا نتائج")}</option>
                : matches.map((d) => <option key={d.iso + d.code} value={d.code}>{label(d)}</option>)}
            </optgroup>
          ) : (
            <>
              <optgroup label={t("phone.popular", "الأكثر استعمالاً")}>
                {POPULAR_CODES.map((d) => <option key={"p" + d.iso} value={d.code}>{label(d)}</option>)}
              </optgroup>
              <optgroup label={t("phone.allCountries", "كل الدول")}>
                {DIAL_CODES.map((d) => <option key={d.iso + d.code} value={d.code}>{label(d)}</option>)}
              </optgroup>
            </>
          )}
        </select>
        <input
          type="tel"
          inputMode="tel"
          className="input flex-1"
          value={national}
          placeholder={t("phone.number")}
          onChange={(e) => { setNational(e.target.value); emit(code, e.target.value); }}
        />
      </div>

      {searchOpen ? (
        <div className="relative">
          <Search size={13} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-2.5 rtl:right-2.5" />
          <input
            autoFocus
            className="input h-8 py-0 text-xs ltr:pl-8 rtl:pr-8"
            value={q}
            onChange={(e) => {
              const v = e.target.value;
              setQ(v);
              // أول مطابقة تُختار فوراً — كتابة «السويد» أو «46» تكفي.
              const s = v.trim(), sl = s.toLowerCase(), dg = s.replace(/\D/g, "");
              const first = s
                ? DIAL_CODES.find((d) => d.nameAr.startsWith(s) || d.name.toLowerCase().startsWith(sl))
                  ?? (dg ? DIAL_CODES.find((d) => d.code.replace("+", "") === dg) : undefined)
                  ?? (dg ? DIAL_CODES.find((d) => d.code.replace("+", "").startsWith(dg)) : undefined)
                : undefined;
              if (first) pick(first.code);
            }}
            placeholder={t("phone.searchCountry", "ابحث عن الدولة أو المفتاح…")}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="text-2xs font-semibold text-brand-600 underline decoration-dotted underline-offset-2 transition hover:text-brand-700"
        >
          {t("phone.otherCountry", "🌐 دولة أخرى؟ ابحث عنها")}
        </button>
      )}
    </div>
  );
}
