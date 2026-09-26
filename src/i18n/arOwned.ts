/* محمّلاتُ النطاقات المملوكة لصفحةٍ واحدة (`owned` بـhot-paths.json).
 *
 * داخل Vite يستبدل `i18nSplit()` محتواها بخريطةِ `ns → () => import(…)` — حزمةٌ صغيرةٌ
 * لكلّ نطاقٍ تصل مع صفحته وحدَها (`page(load, [ns])`). وخارجه (tsc، وحُزمُ esbuild
 * بالفحوص) هي خريطةٌ فارغة: `arCold.ts` هناك القاموسُ كاملاً فالنطاقُ حاضرٌ أصلاً. */
const owned: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {};
export default owned;
