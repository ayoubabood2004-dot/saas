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
import { recoverFromStaleShell, recoveryPending } from "@/lib/appUpdate";
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
  /* «تحميل» بنفس الرسمة لا بعدها: المصمِّمُ يفرّغ مسودّته ويطلب الأحدث — لو بقيت الحالةُ «جاهز» رسمةً واحدة لبذر المسودّةَ
     من الصفّ القديم وختمه (فيرفض الحفظُ التالي «تغيّر من جهاز ثاني» مرّةً ثانية، و«أعد المحاولة» بعد فشلٍ تعرض الافتراضيّ كأنه
     تصميمُ العيادة). */
  const reload = useCallback(() => {
    setSt((s) => ({ ...s, status: "loading", error: null }));
    setN((x) => x + 1);
  }, []);
  /* هويّةٌ ثابتة ما لم يتغيّر الصفّ: المستندُ (عشراتُ الكيلوبايتات) لا يُعاد بناؤه مع كلّ رسم. */
  const cfg = useMemo(() => st.row?.cfg ?? cleanRxPad(RX_DEFAULT, { allowData: !supabase }), [st.row]);
  return { ...st, cfg, reload };
}

/** تحميلٌ معلَّقٌ بهذا القدر يُسأل عنه: قطعةُ القاموس فشلت والتعافي (تحديثُ الصفحة) ينتظر نموذجاً فيه عملٌ لم يُحفظ
 *  (holdUpdates) — الوعدُ لا يستقرّ أبداً، فكان «اطبع» يبقى موقوفاً بلا كلمة والورقةُ العربية بعناوين إنكليزية (مقيس). */
export const RX_LABELS_STUCK_MS = 8000;

/** عناوينُ الورقة بلغتها. `ready` = القاموسُ حاضر (الإنكليزيةُ ثابتةٌ دائماً)، و`failed` = تعذّر: رُفض تحميلُه، أو علق والتعافي
 *  ينتظر (`recoveryPending` — الوعدُ لا يستقرّ قبله). الورقةُ العربية لا تُطبع بعناوين إنكليزية بصمت — يُقال، ويبقى مقولاً حتى يصل
 *  القاموس (`retry` لا يُخفيه). و`slow` = علق **ولا تعافٍ ينتظر**: تنزيلٌ بطيءٌ يصل وحده — «تعذّر، حدّث الصفحة» عنه كان كذباً، وتحديثُه
 *  يرمي ما نزل ويبدأ من الصفر (مقيس بخطٍّ بطيءٍ بأوّل زيارة). والقطعةُ التي فشلت لا تصل بنفس الصفحة (المتصفّحُ يحفظ فشلَ الاستيراد حتى
 *  التحديث، مقيس) فـ`reload` يحدّثها بطريق التعافي — والمستدعي يُفلت إمساكَه قبله، ويرجع false إن رُفض (بلا نت، أو جُرّب للتو).
 *  و`tp` مترجمُ لغة الورقة (خاناتُ المريض بلغتها لا بلغة الواجهة). */
export function useRxLabels(lang: RxLang): { labels: RxLabels; ready: boolean; failed: boolean; slow: boolean; retry: () => void; reload: () => Promise<boolean>; tp: TFunction } {
  const { i18n, t } = useTranslation();
  const needLoad = lang === "ar" && !i18n.language.startsWith("ar");
  /* «جاهز» يُحسب بنفس الرسمة من «حُمِّل» — لا حالةٌ تُضبط بأثرٍ بعدها: التصميمُ يصل عربياً بعد أن كان الافتراضيُّ إنكليزياً، وحالةُ
     «جاهز» القديمة كانت تُبذر خاناتِ المريض قبل وصول القاموس (فيسقط مترجمُ الورقة للإنكليزية: «2 years» على ورقةٍ عربية). */
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [parked, setParked] = useState(false);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!needLoad) return;
    let alive = true;
    const timer = window.setTimeout(() => { if (alive) setStuck(true); }, RX_LABELS_STUCK_MS);
    Promise.all([ensureOwned("rx", "ar"), ensureDictionary("ar")]).then(
      () => { if (alive) { setLoaded(true); setFailed(false); } },
      () => { if (alive) setFailed(true); },
    ).finally(() => window.clearTimeout(timer));
    return () => { alive = false; window.clearTimeout(timer); };
  }, [needLoad, n]);
  /* علقَ: يُسأل كلَّ ثانية — تنزيلٌ بطيء يصير عالقاً حين يفشل ويقف التعافي خلف نصٍّ ممسوك. */
  useEffect(() => {
    if (!needLoad || !stuck || loaded) return;
    const check = () => setParked(recoveryPending());
    check();
    const iv = window.setInterval(check, 1000);
    return () => window.clearInterval(iv);
  }, [needLoad, stuck, loaded]);
  const ready = !needLoad || loaded;
  const isFailed = needLoad && !loaded && (failed || (stuck && parked));
  const retry = useCallback(() => setN((x) => x + 1), []);
  const reload = useCallback(() => recoverFromStaleShell(), []);
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
  const tp = useMemo<TFunction>(() => (lang === "ar" && ready ? i18n.getFixedT("ar") : t), [lang, ready, i18n, t]);
  return { labels: lang === "ar" ? labels : RX_LABELS_EN, ready: lang === "ar" ? ready : true, failed: isFailed, slow: needLoad && !loaded && stuck && !isFailed, retry, reload, tp };
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
