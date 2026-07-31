import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Paperclip, Check } from "lucide-react";
import type { DailyNote } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { cn, dateLocale, localISO } from "@/lib/utils";
import { playTap } from "@/lib/sounds";

/**
 * لوحة الملاحظات اللاصقة اليومية — تبدو مثل رزمة أوراق ستيكي حقيقية (خضراء فوق
 * أصفر ووردي، بملقط)، مشتركة بين كل كادر العيادة: ورقة واحدة لكل يوم، تنقّل
 * بالأسهم بين الأيام، وحفظ تلقائي أثناء الكتابة.
 */
export function StickyNotes() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [offset, setOffset] = useState(0); // 0 = اليوم، -1 = أمس، +1 = غداً
  const [note, setNote] = useState<DailyNote | null>(null);
  const [text, setText] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const debounce = useRef<number | undefined>(undefined);
  // النص المكتوب حالياً + يومه — حتى نفرغ الحفظ المعلق قبل تبديل اليوم أو الإغلاق.
  const pending = useRef<{ dateISO: string; text: string; dirty: boolean }>({ dateISO: "", text: "", dirty: false });

  const dateISOOf = (off: number) => {
    const d = new Date();
    d.setDate(d.getDate() + off);
    return localISO(d); // اليوم بالتقويم المحلي — مو غرينتش
  };
  const dateISO = dateISOOf(offset);

  const flush = useCallback(() => {
    const p = pending.current;
    if (!p.dirty) return;
    p.dirty = false;
    void repo.saveDailyNote(p.dateISO, p.text, user?.full_name).catch(() => { /* retried on next keystroke */ });
  }, [user?.full_name]);

  // تحميل ورقة اليوم المعروض (بعد تفريغ أي حفظ معلق ليوم سابق)
  useEffect(() => {
    flush();
    let alive = true;
    setSaveState("idle");
    repo.getDailyNote(dateISO)
      .then((n) => {
        if (!alive) return;
        setNote(n);
        setText(n?.content ?? "");
        pending.current = { dateISO, text: n?.content ?? "", dirty: false };
      })
      .catch(() => { if (alive) { setNote(null); setText(""); pending.current = { dateISO, text: "", dirty: false }; } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateISO]);

  // تفريغ الحفظ المعلق عند مغادرة الصفحة
  useEffect(() => () => flush(), [flush]);

  const onType = (v: string) => {
    setText(v);
    pending.current = { dateISO, text: v, dirty: true };
    setSaveState("saving");
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(() => {
      const p = pending.current;
      p.dirty = false;
      void repo.saveDailyNote(p.dateISO, p.text, user?.full_name)
        .then(() => setSaveState("saved"))
        .catch(() => setSaveState("idle"));
    }, 800);
  };

  const go = (d: number) => { playTap(); setOffset((o) => o + d); };

  const lang = i18n.language === "ar" ? dateLocale() : "en-US";
  const dayDate = new Date(dateISO + "T12:00:00");
  const relLabel = offset === 0 ? t("stickyNotes.today", "اليوم") : offset === -1 ? t("stickyNotes.yesterday", "أمس") : offset === 1 ? t("stickyNotes.tomorrow", "غداً") : null;
  // بالسياق العربي (RTL) السهم الي يشير لليمين يرجع بالزمن — نفس منطق أسهم التنقل بالموقع.
  const PrevIcon = i18n.dir() === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = i18n.dir() === "rtl" ? ChevronLeft : ChevronRight;

  return (
    <div className="relative px-1 pb-2 pt-4">
      {/* الأوراق الخلفية — وردية وصفراء بميلان خفيف مثل الرزمة الحقيقية */}
      <div className="absolute inset-x-4 bottom-0 top-6 -rotate-2 rounded-2xl bg-sky-300 shadow-card dark:bg-sky-400/70" />
      <div className="absolute inset-x-2 bottom-1 top-5 rotate-[1.6deg] rounded-2xl bg-brand-300 shadow-card dark:bg-brand-400/80" />

      {/* الورقة الخضراء العلوية */}
      <div className="relative rounded-2xl bg-brand-100 p-4 shadow-raised dark:bg-[#b7d3f4]">
        {/* الملقط */}
        <Paperclip size={30} strokeWidth={2.5} className="absolute -top-4 start-6 -rotate-[24deg] text-brand-600 drop-shadow-md dark:text-brand-800" aria-hidden />
        {/* طية الزاوية */}
        <span className="pointer-events-none absolute bottom-0 end-0 h-10 w-10 rounded-2xl" style={{ background: "linear-gradient(315deg, rgba(0,0,0,.14), transparent 55%)" }} aria-hidden />

        {/* رأس التاريخ مع أسهم التنقل */}
        <div className="flex items-center justify-between gap-1">
          <button
            onClick={() => go(-1)}
            aria-label={t("stickyNotes.prevDay", "اليوم السابق")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-brand-900/70 transition hover:bg-brand-900/10 hover:text-brand-950 active:scale-95"
          >
            <PrevIcon size={20} strokeWidth={2.5} />
          </button>
          <div className="min-w-0 text-center">
            <p className="truncate font-display text-sm font-extrabold text-brand-950">
              {dayDate.toLocaleDateString(lang, { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <div className="mt-0.5 flex items-center justify-center gap-1.5">
              {relLabel && <span className="rounded-full bg-brand-900/15 px-2 py-0.5 text-2xs font-bold text-brand-950">{relLabel}</span>}
              {offset !== 0 && (
                <button onClick={() => { playTap(); setOffset(0); }} className="rounded-full bg-white/60 px-2 py-0.5 text-2xs font-bold text-brand-800 transition hover:bg-white/80">
                  {t("stickyNotes.backToday", "ارجع لليوم")}
                </button>
              )}
            </div>
          </div>
          <button
            onClick={() => go(1)}
            aria-label={t("stickyNotes.nextDay", "اليوم التالي")}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-brand-900/70 transition hover:bg-brand-900/10 hover:text-brand-950 active:scale-95"
          >
            <NextIcon size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* الورقة المسطّرة */}
        <textarea
          dir="auto"
          value={text}
          onChange={(e) => onType(e.target.value)}
          onBlur={flush}
          placeholder={t("stickyNotes.placeholder", "اكتب ملاحظات اليوم هنا… تشوفها كل عيادتك ✏️")}
          className="mt-2 block min-h-44 w-full resize-y rounded-lg bg-transparent px-1 text-[15px] leading-7 text-brand-950 outline-none placeholder:text-brand-900/45"
          style={{
            backgroundImage: "repeating-linear-gradient(transparent, transparent calc(1.75rem - 1px), rgba(15,81,176,.15) calc(1.75rem - 1px), rgba(15,81,176,.15) 1.75rem)",
            backgroundAttachment: "local",
          }}
        />

        {/* آخر تعديل + حالة الحفظ */}
        <div className="mt-1.5 flex min-h-4 items-center justify-between gap-2 text-2xs font-semibold text-brand-900/60">
          <span className="truncate">
            {note?.updated_by && text.trim() ? t("stickyNotes.lastBy", { name: note.updated_by, defaultValue: "آخر تعديل: {{name}}" }) : ""}
          </span>
          <span className={cn("flex shrink-0 items-center gap-1 transition-opacity", saveState === "idle" && "opacity-0")}>
            {saveState === "saving" ? t("stickyNotes.saving", "يحفظ…") : (<><Check size={12} strokeWidth={3} /> {t("stickyNotes.saved", "انحفظت")}</>)}
          </span>
        </div>
      </div>
    </div>
  );
}
