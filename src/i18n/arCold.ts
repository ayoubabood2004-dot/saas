/* ============================================================================
 * القاموسُ العربيُّ البارد — نطاقاتٌ لا تُقرأ بمسار الإقلاع (م٠·١).
 *
 * `ar.json` كلُّه كان يُحمَّل مع الإقلاع: ٧٧ ألف بايتٍ مضغوطة، والقشرةُ تقرأ
 * منها ٢٢ نطاقاً فقط. فانقسم: الحارُّ يُستورد بالاسم بـ`index.ts`، وهذا يُحمَّل
 * كسولاً — وكلُّ شاشةٍ تنتظره قبل رسمها (`page()` بـApp.tsx)، فلا وميض.
 *
 * **والوميضُ ليس نظرياً**: من ٣٤١٩ نداءً لهذه النطاقات، ٧١٨ افتراضيُّها
 * **إنكليزيّ** و٦٣٥ بلا افتراضٍ أصلاً (يظهر المفتاحُ الخامّ). فشاشةٌ تُرسم قبل
 * وصول هذا الملف تعرض لعيادةٍ عراقية «Today» و«claim.notFound».
 *
 * الاستيرادُ **بالاسم** من `ar.json` لا بالافتراضيّ، و**هذا الاستيرادُ وحدَه يُحلّ
 * إلى `ar.json?cold`** (`arColdSplit` بـvite.config.ts): Rollup يقسم بالوحدة لا
 * بالاسم، فبلا ذلك تبقى النصوصُ كلُّها بالإقلاع وهذه الحزمةُ إشاراتٌ إليه — وقد
 * حدث (مقيس). و`ar.json` يبقى المصدرَ الوحيد — الحرّاسُ تقرؤه كما هو. وأيُّ نطاقٍ
 * جديدٍ يُضاف لأحد الملفّين وإلا فشّل `i18n-split-guard`.
 * ========================================================================= */
import {
  cages, catalog, waMsgs, login, sf, track, lib, campaigns, remind, promos, consent,
  medentry, services, pay, purchase, twin, settings, greeting, dashboard, pet,
  wellness, dates, contacts, diet, events, edu, passport, account, qr, media, vitals,
  reading, phone, chart, notes, owner, claim, service, status, booking, dash, snapshot,
  color, breeds, appt, triage, treatment, newCase, meds, vax, consult, petSales,
  presence, outcome, rpt, act, movements, stickyNotes, rem, tplan, lab, charts, staff,
  visit, caps, landing, flow, stock, round, health, portal, barcodeHealth, readerTest,
  cat, farm, mv,
} from "./ar.json";

export default {
  cages, catalog, waMsgs, login, sf, track, lib, campaigns, remind, promos, consent,
  medentry, services, pay, purchase, twin, settings, greeting, dashboard, pet,
  wellness, dates, contacts, diet, events, edu, passport, account, qr, media, vitals,
  reading, phone, chart, notes, owner, claim, service, status, booking, dash, snapshot,
  color, breeds, appt, triage, treatment, newCase, meds, vax, consult, petSales,
  presence, outcome, rpt, act, movements, stickyNotes, rem, tplan, lab, charts, staff,
  visit, caps, landing, flow, stock, round, health, portal, barcodeHealth, readerTest,
  cat, farm, mv,
};
