/* ============================================================================
 * مدخلُ الزائر — الصفحاتُ الثلاثُ العامّة وحدَها.
 *
 * ── لماذا مدخلٌ ثانٍ ─────────────────────────────────────────────────────
 * المقيس على `dist` قبل هذا: فتحُ `/s/:slug` ينزّل **٤٦٣٬٣٤٦ بايتاً مضغوطة**
 * قبل أوّل منتج، حصّةُ `Storefront` منها **١٫٨٪**. الباقي قشرةُ تطبيق العيادة:
 * موجّهٌ بستّين مساراً، وسياقُ الدخول، وعميلُ Supabase، وقاموسان بلغتين. زبونٌ
 * عراقيٌّ على هاتفٍ رخيصٍ وشبكةٍ ضعيفة يدفع ثمنَ شاشةِ الرواتب ليشتري شامبو قطط.
 *
 * ولا يُصلَح هذا بتقسيمٍ كسول: `index.html` تُحمّل `main.tsx` أياً كان المسار،
 * و`main.tsx` تستورد `App` التي تستورد كلَّ شيء. الإصلاحُ الوحيد أن يكون
 * لمسارات `/s/*` **مستندٌ آخر** لا يعرف تطبيقَ العيادة أصلاً.
 *
 * ── ما لا يدخل هنا عمداً ────────────────────────────────────────────────
 * • `repo` — النداءاتُ من `storeApi` (fetch عارٍ، بلا عميل Supabase).
 * • سياقُ الدخول والصلاحيات — الزائرُ بلا جلسةٍ إطلاقاً، وهي ميزةُ المتجر.
 * • تسجيلُ الخدمة العاملة — تطبيقُ العيادة PWA، وصفحةُ الزبون صفحةُ ويب.
 * • الإنكليزية — `store.ts` عربيةٌ وحدَها.
 *
 * وكلُّ إضافةٍ هنا تُقاس: `scripts/store-weight-guard.mjs` يفشّل البناءَ إن
 * تجاوزت حزمةُ الزائر ميزانيّتَها.
 * ==========================================================================*/
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "./i18n/store";
import "./index.css";
import { installDigitNormalizer } from "./lib/digits";
import { Storefront } from "./pages/Storefront";
import { StoreTrack } from "./pages/StoreTrack";
import { TrackJourney } from "./pages/TrackJourney";

// الأرقامُ الشرقية تُحوَّل إلى ٠-٩ بأيّ حقل — الزبونُ يكتب رقمَه بأيّ لوحة.
installDigitNormalizer();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/s/:slug" element={<Storefront />} />
        <Route path="/s/:slug/track" element={<StoreTrack />} />
        <Route path="/t/:token" element={<TrackJourney />} />
        {/* أيُّ مسارٍ آخر ليس للزائر: يرجع لتطبيق العيادة بمستنده. */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
