/* ============================================================================
 * راجيتةُ العيادة (0261) — مالكُ نطاق rx: زرُّ «راجيتة» بسجلّ الحيوان (وصفحة الحالة)، وبطاقتُها بالإعدادات.
 *
 * النطاقُ مملوك (hot-paths.json) — النصفُ الباردُ ممتلئ: هذا الملفُّ يُحمَّل كسولاً بـpage(…, ["rx"]) من ملفّ
 * الحيوان وصفحة الحالة والإعدادات، ونصُّ الزرّ نفسُه من هنا (لا يقرأ rx.* غيرُ هذا الملفّ ورفاقِه). والنافذةُ
 * والمصمِّمُ رفيقان ثقيلان يُحمَّلان عند الفتح وحدَه — ملفُّ الحيوان لا يحمل محرّرَ التصميم.
 * ========================================================================= */
import { Suspense, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui";
import { LoadBoundary } from "@/components/LoadBoundary";
import { page } from "@/lib/lazyPage";
import { playTap } from "@/lib/sounds";
import { rxApi, isRxMissing } from "@/lib/rxApi";
import type { RxPadConfig } from "@/lib/rxLayout";
import type { Pet } from "@/types";

const loadSheet = () => page(() => import("./RxSheet").then((m) => ({ default: m.RxSheet })), ["rx"]);
let SheetLazy = loadSheet();
const loadDesigner = () => page(() => import("./RxDesigner").then((m) => ({ default: m.RxDesigner })), ["rx"]);
let DesignerLazy = loadDesigner();

/** ℞ — حرفُ الوصفة بخطّ الأيقونات نفسِه (لا خطَّ يُنزَّل له). */
export function RxGlyph({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M6 20V4h5.5a4 4 0 0 1 0 8H6" />
      <path d="M10.5 12 19 20.5" />
      <path d="M13.5 20.5 19 15" />
    </svg>
  );
}

/** زرُّ «راجيتة» ونافذتُها. `visitId`: من صفحة الحالة — الراجيتةُ تُربط بها. */
export function RxButton({ pet, visitId = null, variant = "ghost" }: { pet: Pet; visitId?: string | null; variant?: "ghost" | "secondary" | "outline" }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  return (
    <>
      <Button size="sm" variant={variant} leftIcon={<RxGlyph size={16} />} onClick={() => { playTap(); setOpen(true); }} data-rx-open>
        {t("rx.btn")}
      </Button>
      {open && (
        <LoadBoundary scope="rx-sheet" onRetry={() => { SheetLazy = loadSheet(); setTick((n) => n + 1); }}>
          <Suspense fallback={null}>
            <SheetLazy pet={pet} visitId={visitId} onClose={() => setOpen(false)} />
          </Suspense>
        </LoadBoundary>
      )}
    </>
  );
}

type CardState = { status: "loading" } | { status: "ready"; cfg: RxPadConfig | null } | { status: "missing" } | { status: "error" };

/** بطاقةُ الإعدادات: ما عليه التصميمُ الآن بسطر، وزرُّ المصمِّم. */
export function RxSettingsCard() {
  const { t } = useTranslation();
  const [st, setSt] = useState<CardState>({ status: "loading" });
  const [n, setN] = useState(0);
  const [open, setOpen] = useState(false);
  const [, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setSt({ status: "loading" });
    rxApi.getPad().then(
      (row) => { if (alive) setSt({ status: "ready", cfg: row?.cfg ?? null }); },
      (e: unknown) => { if (alive) setSt(isRxMissing(e) ? { status: "missing" } : { status: "error" }); },
    );
    return () => { alive = false; };
  }, [n]);

  const cfg = st.status === "ready" ? st.cfg : null;
  const paper = (cfg?.paper ?? "a5").toUpperCase();
  return (
    <div className="card mb-4 p-5" data-rx-card>
      <h2 className="mb-1 flex items-center gap-2 font-bold text-ink"><RxGlyph size={18} className="text-brand-600" /> {t("rx.settingsTitle")}</h2>
      <p className="mb-4 text-xs text-ink-subtle">{t("rx.settingsHint")}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" leftIcon={<RxGlyph size={15} />} onClick={() => { playTap(); setOpen(true); }} disabled={st.status === "loading"} data-rx-design>
          {t("rx.design")}
        </Button>
        {st.status === "ready" && (
          <span className="chip bg-surface-2 text-xs text-ink-muted" data-rx-summary>
            {cfg?.mode === "image" ? t("rx.summaryImage", { paper }) : t("rx.summaryTemplate", { paper })}
            {cfg && cfg.doctors.length > 0 && cfg.mode === "template" ? ` · ${t("rx.summaryDoctors", { n: cfg.doctors.length })}` : ""}
          </span>
        )}
      </div>
      {st.status === "missing" && <p className="mt-3 text-xs text-warn-700 dark:text-warn-300" data-rx-missing>{t("rx.needsUpdate")}</p>}
      {st.status === "error" && (
        <div className="mt-3 flex items-center gap-2 text-xs text-danger-700 dark:text-danger-300">
          <span>{t("rx.loadFail")}</span>
          <button className="font-semibold underline" onClick={() => setN((x) => x + 1)}>{t("common.retry")}</button>
        </div>
      )}
      {open && (
        <LoadBoundary scope="rx-designer" onRetry={() => { DesignerLazy = loadDesigner(); setTick((x) => x + 1); }}>
          <Suspense fallback={null}>
            <DesignerLazy onClose={() => setOpen(false)} onSaved={() => setN((x) => x + 1)} />
          </Suspense>
        </LoadBoundary>
      )}
    </div>
  );
}
