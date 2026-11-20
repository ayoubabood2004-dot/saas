/* البيعُ بسعرين (0282) — ما تحتاجه شاشةُ البيع، بقطعةٍ كسولةٍ واحدة (import() عند أوّل «$» على سطر): الحسابُ الصِّرف والباب. */
export { usdCentsOf, iqdOfCents, usdLabel } from "./dualPrice";
export { dualRate, dualCheckout, dualReady, mixedReady, mixedCheckout } from "./dualApi";
export type { MixedUsdLine, MixedMeta, MixedResult } from "./dualApi";
