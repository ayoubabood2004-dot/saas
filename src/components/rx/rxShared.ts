/* ============================================================================
 * راجيتةُ العيادة (0261) — ما تشترك به نافذةُ الراجيتة ومصمِّمُها: تحميلُ التصميم، وعناوينُ الورقة بلغتها، وتجميعُ
 * المستند من التصميم + إعدادات العيادة (الاسم، الشعار، الدوام، الحسابات) + خانات المريض.
 *
 * رفيقٌ لنطاق rx المملوك (hot-paths.json): لا يستورده إلا مالكُه (RxPad) ورفاقُه. وعناوينُ الورقة العربية تُقرأ
 * بـgetFixedT("ar") — الورقةُ بلغتها لا بلغة الواجهة؛ وواجهةٌ إنكليزية بورقةٍ عربية تنتظر قاموسَها أوّلاً
 * (ensureOwned/ensureDictionary) فلا يُطبع مفتاحٌ خام.
 * ========================================================================= */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { ensureDictionary, ensureOwned } from "@/i18n";
import { getClinicLogo, getClinicName, getClinicSocials, getClockFormat, getWorkHours } from "@/lib/settings";
import { productImageUrl } from "@/lib/storeLib";
import { describeDbError } from "@/lib/errors";
import { supabase } from "@/lib/supabase";
import { rxApi, isRxMissing, type RxPadRow } from "@/lib/rxApi";
import { RX_DEFAULT, RX_LABELS_EN, cleanRxPad, hoursLine, type RxFields, type RxLabels, type RxLang, type RxPadConfig } from "@/lib/rxLayout";
import type { RxDocInput } from "@/lib/rxPrint";

export type PadStatus = "loading" | "ready" | "error" | "missing";
export interface PadState { status: PadStatus; row: RxPadRow | null; cfg: RxPadConfig; error: unknown; reload: () => void }

/** تصميمُ العيادة: الافتراضيُّ ما لم يُحفظ، وعند غياب الجدول (`missing`) — الطباعةُ تعمل دائماً، والفشلُ يُقال. */
export function useRxPad(): PadState {
  const [st, setSt] = useState<{ status: PadStatus; row: RxPadRow | null; error: unknown }>({ status: "loading", row: null, error: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setSt((s) => ({ ...s, status: "loading", error: null }));
    rxApi.getPad().then(
      (row) => { if (alive) setSt({ status: "ready", row, error: null }); },
      (e: unknown) => { if (alive) setSt({ status: isRxMissing(e) ? "missing" : "error", row: null, error: e }); },
    );
    return () => { alive = false; };
  }, [n]);
  const reload = useCallback(() => setN((x) => x + 1), []);
  /* هويّةٌ ثابتة ما لم يتغيّر الصفّ: المستندُ (عشراتُ الكيلوبايتات) لا يُعاد بناؤه مع كلّ رسم. */
  const cfg = useMemo(() => st.row?.cfg ?? cleanRxPad(RX_DEFAULT, { allowData: !supabase }), [st.row]);
  return { ...st, cfg, reload };
}

/** عناوينُ الورقة بلغتها. `ready` = القاموسُ حاضر (الإنكليزيةُ ثابتةٌ دائماً). */
export function useRxLabels(lang: RxLang): { labels: RxLabels; ready: boolean } {
  const { i18n } = useTranslation();
  const needLoad = lang === "ar" && !i18n.language.startsWith("ar");
  const [ready, setReady] = useState(!needLoad);
  useEffect(() => {
    if (!needLoad) { setReady(true); return; }
    let alive = true;
    setReady(false);
    Promise.all([ensureOwned("rx", "ar"), ensureDictionary("ar")]).then(() => { if (alive) setReady(true); }, () => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, [needLoad]);
  const labels = useMemo<RxLabels>(() => {
    if (lang !== "ar") return RX_LABELS_EN;
    const ta = i18n.getFixedT("ar");
    return {
      canine: ta("rx.lbl.canine"), feline: ta("rx.lbl.feline"), exotic: ta("rx.lbl.exotic"), date: ta("rx.lbl.date"),
      name: ta("rx.lbl.name"), age: ta("rx.lbl.age"), owner: ta("rx.lbl.owner"), weight: ta("rx.lbl.weight"),
      hours: ta("rx.lbl.hours"), tel: ta("rx.lbl.tel"), signature: ta("rx.lbl.signature"), am: ta("rx.lbl.am"), pm: ta("rx.lbl.pm"),
    };
    // `ready`: بعد وصول القاموس العربيّ لواجهةٍ إنكليزية تُقرأ العناوينُ من جديد.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang, ready, i18n]);
  return { labels: lang === "ar" ? labels : RX_LABELS_EN, ready: lang === "ar" ? ready : true };
}

/** "2026-11-05" ⇒ "05/11/2026" — كما تُكتب التواريخ على الراجيتات هنا (يوم/شهر/سنة، أرقامٌ غربية). */
export function rxDateText(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** صورةُ التصميم رابطاً: مسارُ الدلو ⇒ رابطُه العامّ، و`data:` (التجريبيّ) كما هي. */
export const rxImageUrl = (path: string | null): string | null => productImageUrl(path);

/** المستندُ كاملاً: التصميمُ + العيادةُ كما بإعداداتها لحظةَ الطباعة + خاناتُ المريض والوصفة. */
export function rxDoc(cfg: RxPadConfig, labels: RxLabels, fields: RxFields, body: string, doctor: string, docTitle: string): RxDocInput {
  const socials = getClinicSocials();
  const hours = cfg.hours === "off" ? "" : cfg.hours === "custom" ? cfg.hoursText : hoursLine(getWorkHours(), getClockFormat(), labels.am, labels.pm);
  return {
    cfg,
    clinic: {
      title: cfg.title || getClinicName(),
      subtitle: cfg.subtitle,
      logoUrl: getClinicLogo(),
      emblemUrl: rxImageUrl(cfg.emblemPath),
      bgUrl: rxImageUrl(cfg.bgPath),
      hours,
      socials: [
        { kind: "fb" as const, handle: (socials.facebook || "").trim() },
        { kind: "ig" as const, handle: (socials.instagram || "").trim() },
      ].filter((s) => s.handle),
    },
    fields,
    dateText: rxDateText(fields.date),
    body,
    doctor,
    labels,
    docTitle,
  };
}

/** رسالةُ فشلٍ تقولها الشاشة: رفضُ المحفّز برمزه (تجميد، مدير، ملغاة)، وتغيّرٌ من جهازٍ ثانٍ، وغيرُها كما يقولها النظام. */
export function rxErrorText(e: unknown, t: TFunction): string {
  const err = (e && typeof e === "object" ? e : {}) as { message?: string; code?: string };
  if (err.code === "rx_stale") return t("rx.stale");
  if (err.message === "rx_void_manager") return t("rx.voidManagerOnly");
  if (err.message === "rx_frozen" || err.message === "rx_voided") return t("rx.frozen");
  return describeDbError(e, t);
}
