/* ============================================================================
 * مفرداتُ التشريح بأجهزة الجسم — قائمةُ المالك الثابتة لكلّ العيادات (٢٤/١١): «اكو امراض اريدك تضيفهن
 * بالتشخيص تثبتهم لكل العيادات حتى تسهل عملية الاختيار». ثمانيةُ أجهزةٍ بترتيبه (العامّة، الهضميّ بأمعائه
 * وأعوريه وكبده، القلبُ والتامور، التنفّسيّ بقصبته ورئتيه وأكياسه، الكلى، الطحال، التناسليّ، الجلدُ والعضلاتُ
 * والمفاصل)، وفوقها ما كان بالقائمة قبلها (المعدةُ الغدية، الرأسُ والجيوب، غدّةُ فابريشيا…) — **أُضيف ولم يُشَل**.
 *
 * الرمزُ (`عضو.آفة`) هو ما يُخزَّن (flock_necropsy.findings، `_flock_codes` بـ0265: صيغتُه وحدها، ولا قائمةَ بالخادم)
 * والعرضُ بالجهاز لا بالبادئة: الرمزُ القديم باقٍ برمزه وتغيّر اسمُه وحده (`liver.enlarged` صار «تضخم الكبد»)،
 * فما سُجّل قبلها يُقرأ ويُعدَّل كما هو ولا تنقلب اقتراحاتُ التشخيص. والآفةُ المذكورةُ بجهازين («تجمع سوائل حول
 * القلب» بالعامّة والقلب) **رمزٌ واحد** يُرى بالمكانين — لا رمزان يُعدّان بالملخّص مرّتين.
 *
 * لا نصَّ هنا ولا `t(`: الأسماءُ بقاموس flkv (FlockVisit.tsx مالكُه)، وهذه وحدةٌ صِرفة يفحصها flock-ui-test.
 * ========================================================================= */

export interface NecroSub { k: string; codes: readonly string[] }
export interface NecroSystem { k: string; subs: readonly NecroSub[]; layerOnly?: boolean }

/** «لا توجد آفات تشريحية واضحة»: الطيرُ كلُّه سليم — لا يجتمع مع آفة (اختيارُ آفةٍ يشيله، ولا يُختار فوق آفات). */
export const NIL = "gen.nil";

export const NECRO_SYSTEMS: readonly NecroSystem[] = [
  { k: "gen", subs: [{ k: "gen", codes: [
    NIL, "ext.emaciation", "gen.congestion", "gen.hemorrhage", "heart.ascites", "heart.hydropericardium", "gen.polyserositis",
    "gen.adhesions", "gen.organomegaly", "gen.pallor", "gen.jaundice", "ext.dehydration", "gen.edema", "skin.subcut_hemorrhage",
  ] }] },
  { k: "dig", subs: [
    { k: "gut", codes: [
      "gut.necrotic_enteritis", "gut.enlarged", "gut.thin_wall", "gut.thick_wall", "gut.blood", "gut.blood_casts", "gut.caseous",
      "gut.distended", "gut.coccidia", "gut.salmonella",
      "gut.necrosis", "gut.excess_fluid", "gut.orange_mucus", "gut.white_spots", "gut.peyer_hemorrhage", "gut.undigested",
    ] },
    { k: "ceca", codes: ["ceca.hemorrhage", "ceca.enlarged", "ceca.petechiae", "gut.cecal_cores"] },
    { k: "liver", codes: [
      "liver.enlarged", "liver.pale", "liver.congestion", "liver.hemorrhage", "liver.necrosis", "liver.white_spots", "liver.yellow_spots",
      "liver.necrotic_foci", "liver.friable", "liver.fatty", "liver.perihepatitis",
    ] },
    { k: "prov", codes: ["prov.gland_hemorrhage", "prov.proventriculitis", "prov.gizzard_erosion"] },
  ] },
  { k: "heart", subs: [{ k: "heart", codes: [
    "heart.hydropericardium", "heart.pericarditis", "heart.epicardial_hemorrhage", "heart.cardiomegaly", "heart.pale_myocardium",
    "heart.myocardial_necrosis", "heart.fibrin",
  ] }] },
  { k: "resp", subs: [
    { k: "trachea", codes: ["head.tracheitis", "head.congestion", "head.hemorrhage", "head.mucus", "head.mucus_plugs", "head.blood_casts", "head.caseous_plug"] },
    { k: "lung", codes: [
      "lung.congestion", "lung.edema", "lung.pneumonia", "lung.consolidation", "lung.hemorrhage", "lung.airsacculitis", "lung.airsac_cloudy",
      "lung.airsac_thick", "lung.fibrin", "lung.caseous", "lung.fungal_nodules", "lung.airsac_foamy",
    ] },
    { k: "head", codes: ["head.sinusitis", "head.conjunctivitis", "head.diphtheritic", "ext.head_swelling"] },
  ] },
  { k: "kidney", subs: [{ k: "kidney", codes: [
    "kidney.swollen", "kidney.pale", "kidney.congestion", "kidney.nephritis", "kidney.urates", "kidney.ureters_enlarged",
    "kidney.ureters_urates", "kidney.visceral_gout", "kidney.chalky_deposits", "kidney.atrophy",
  ] }] },
  { k: "spleen", subs: [{ k: "spleen", codes: [
    "liver.spleen_enlarged", "spleen.atrophy", "spleen.congestion", "spleen.pale", "spleen.hemorrhage", "spleen.necrotic_foci",
    "spleen.white_spots", "spleen.nodules",
  ] }] },
  { k: "bursa", subs: [{ k: "bursa", codes: ["bursa.edema", "bursa.yellow_exudate", "bursa.hemorrhage", "bursa.atrophy"] }] },
  { k: "repro", layerOnly: true, subs: [{ k: "repro", codes: [
    "repro.salpingitis", "repro.oviduct_caseous", "repro.oophoritis", "repro.ovary_hemorrhage", "repro.ovary_atrophy",
    "repro.abnormal_follicles", "repro.egg_peritonitis", "repro.free_yolk", "repro.oviduct_adhesions", "repro.cystic_oviduct",
  ] }] },
  { k: "msk", subs: [
    { k: "muscle", codes: ["msk.breast_hemorrhage", "msk.thigh_hemorrhage", "msk.muscle_necrosis", "msk.myositis", "msk.pale_muscle"] },
    { k: "joint", codes: ["msk.arthritis", "msk.swollen_joints", "msk.joint_fluid", "msk.tenosynovitis", "msk.rubbery_bones", "msk.td", "msk.fhn", "msk.sciatic"] },
    { k: "skin", codes: [
      "skin.dermatitis", "skin.cellulitis", "skin.abscesses", "skin.tumors", "skin.subcut_hemorrhage",
      "ext.pododermatitis", "ext.hock_burn", "ext.breast_blister", "ext.pox", "ext.vent_pasting", "ext.omphalitis",
    ] },
  ] },
];

/** رموزٌ قبل هذه القائمة ما عادت تُعرض للاختيار (صارت أدقّ: «نزف بعضلات الفخذ/الصدر» ⇐ نزفُ الصدر ونزفُ الفخذ)
 *  — اسمُها باقٍ بالقاموس فيُقرأ ما سُجّل بها ويُشال من «المختار» كما يُشال غيرُه. */
export const RETIRED: readonly { code: string; sub: string }[] = [{ code: "msk.muscle_hemorrhage", sub: "muscle" }];

/** آفاتٌ اسمُها يسمّي عضوَها («تضخم الكبد»، «نزف الأعورين»): تُكتب بالملخّص والتقرير بلا اسم المجموعة. وغيرُها
 *  يُسبق بها («الطحال: وجود بؤر نخرية») — و«العامّة» بلا سابقة أبداً. الإنكليزيةُ مكتوبةٌ بالقاعدة نفسِها. */
export const SELF_NAMED: ReadonlySet<string> = new Set([
  "gut.necrotic_enteritis", "gut.enlarged", "gut.thin_wall", "gut.thick_wall", "gut.blood", "gut.caseous", "gut.distended",
  "ceca.hemorrhage", "ceca.enlarged", "ceca.petechiae", "gut.cecal_cores",
  "liver.enlarged", "liver.pale", "liver.congestion", "liver.hemorrhage", "liver.necrosis", "liver.white_spots", "liver.yellow_spots",
  "liver.friable", "liver.fatty", "liver.perihepatitis",
  "prov.proventriculitis", "prov.gizzard_erosion",
  "heart.hydropericardium", "heart.pericarditis", "heart.epicardial_hemorrhage", "heart.cardiomegaly", "heart.pale_myocardium",
  "heart.myocardial_necrosis", "heart.fibrin",
  "head.tracheitis", "head.congestion", "head.hemorrhage", "head.caseous_plug", "head.sinusitis", "head.conjunctivitis", "ext.head_swelling",
  "lung.congestion", "lung.edema", "lung.pneumonia", "lung.consolidation", "lung.hemorrhage", "lung.airsacculitis", "lung.airsac_cloudy",
  "lung.airsac_thick", "lung.airsac_foamy",
  "kidney.swollen", "kidney.pale", "kidney.congestion", "kidney.nephritis", "kidney.urates", "kidney.ureters_enlarged",
  "kidney.ureters_urates", "kidney.visceral_gout", "kidney.atrophy",
  "liver.spleen_enlarged", "spleen.atrophy", "spleen.congestion", "spleen.pale", "spleen.hemorrhage",
  "repro.salpingitis", "repro.oviduct_caseous", "repro.oophoritis", "repro.ovary_hemorrhage", "repro.ovary_atrophy",
  "repro.egg_peritonitis", "repro.oviduct_adhesions", "repro.cystic_oviduct",
  "msk.breast_hemorrhage", "msk.thigh_hemorrhage", "msk.muscle_hemorrhage", "msk.muscle_necrosis", "msk.pale_muscle",
  "msk.arthritis", "msk.swollen_joints", "msk.joint_fluid", "msk.tenosynovitis", "msk.rubbery_bones", "msk.td", "msk.fhn", "msk.sciatic",
  "skin.dermatitis", "skin.cellulitis", "skin.abscesses", "skin.tumors", "skin.subcut_hemorrhage",
  "ext.pododermatitis", "ext.hock_burn", "ext.breast_blister", "ext.pox", "ext.vent_pasting", "ext.omphalitis",
]);

/** الأجهزةُ المعروضة لوجبة: التناسليُّ للبيّاض والأمّهات وحدها (كما كان). */
export const systemsFor = (layer: boolean): readonly NecroSystem[] => NECRO_SYSTEMS.filter((s) => !s.layerOnly || layer);

const codesOf = (s: NecroSystem): string[] => s.subs.flatMap((x) => x.codes);
/** كلُّ رمزٍ يُختار (بلا تكرار) — والمتقاعدُ معها لمن يسأل «هل هذا رمزٌ نعرفه؟». */
export const ALL_CODES: readonly string[] = [...new Set(NECRO_SYSTEMS.flatMap(codesOf))];
const KNOWN = new Set([...ALL_CODES, ...RETIRED.map((r) => r.code)]);
export const isKnownLesion = (code: string): boolean => KNOWN.has(code);

/** علامةُ «الجهاز طبيعي» — بادئتُها مفتاحُ الجهاز (`dig.normal`). رموزُ «عضو.normal» من القائمة القديمة تبقى بمكانها (لا تُعدّ آفة). */
export const normalOf = (sysKey: string): string => `${sysKey}.normal`;
export const isMarker = (code: string): boolean => code.endsWith(".normal");

/** أوّلُ مجموعةٍ يظهر فيها الرمز: سابقتُه بالملخّص، ومكانُه بالبحث. */
export function homeOf(code: string): { sys: string; sub: string } | null {
  for (const s of NECRO_SYSTEMS) for (const x of s.subs) if (x.codes.includes(code)) return { sys: s.k, sub: x.k };
  const r = RETIRED.find((x) => x.code === code);
  if (r) { const s = NECRO_SYSTEMS.find((y) => y.subs.some((x) => x.k === r.sub)); if (s) return { sys: s.k, sub: r.sub }; }
  return null;
}

/** الأجهزةُ التي يظهر فيها الرمز (رمزٌ بجهازين يُطفئ «طبيعي» الاثنين). */
export const systemsWith = (code: string): string[] => NECRO_SYSTEMS.filter((s) => codesOf(s).includes(code)).map((s) => s.k);

/** آفاتُ الطير (بلا علامات «طبيعي»). */
export const lesionsOf = (findings: readonly string[]): string[] => findings.filter((f) => !isMarker(f));

/**
 * نقرةُ آفة: تُضاف أو تُشال. الإضافةُ تشيل «لا توجد آفات» و«طبيعي» كلِّ جهازٍ تظهر فيه الآفة (وعلامةَ عضوها القديمة
 * `liver.normal`) — آفةٌ بجهازٍ «طبيعي» تناقضٌ يُطبع للمربي. و«لا توجد آفات» لا تُختار فوق آفات: ترجع كما هي
 * (الشاشةُ تقول «شيل المختار أولاً») — لا مسحٌ صامت لستّ آفاتٍ بنقرةٍ خاطئة.
 */
export function toggleLesion(findings: readonly string[], code: string): string[] {
  if (findings.includes(code)) return findings.filter((f) => f !== code);
  if (code === NIL) return lesionsOf(findings).length ? [...findings] : [...findings, NIL];
  const drop = new Set([NIL, ...systemsWith(code).map(normalOf), `${code.split(".")[0]}.normal`]);
  return [...findings.filter((f) => !drop.has(f)), code];
}

/** «طبيعي» لجهاز: يشيل آفاتِه كلَّها ويضع علامتَه — ونقرةٌ ثانية تشيل العلامة وحدها. */
export function toggleNormal(findings: readonly string[], sys: NecroSystem): string[] {
  const mark = normalOf(sys.k);
  if (findings.includes(mark)) return findings.filter((f) => f !== mark);
  const mine = new Set(codesOf(sys));
  return [...findings.filter((f) => !mine.has(f) || f === NIL), mark];
}

/** «الباقي طبيعي»: كلُّ جهازٍ معروض بلا آفةٍ ولا علامة يصير طبيعياً — ما فيه آفةٌ لا يُمسّ. */
export function restNormal(findings: readonly string[], shown: readonly NecroSystem[]): string[] {
  const out = [...findings];
  for (const s of shown) {
    const mark = normalOf(s.k);
    if (out.includes(mark)) continue;
    if (codesOf(s).some((c) => c !== NIL && out.includes(c))) continue;
    out.push(mark);
  }
  return out;
}

/** حالُ الجهاز على بطاقته: عددُ آفاته المختارة، و«طبيعي» (علامتُه أو «لا توجد آفات» للطير كلّه). */
export function systemState(findings: readonly string[], sys: NecroSystem): { n: number; normal: boolean } {
  const n = codesOf(sys).filter((c) => c !== NIL && findings.includes(c)).length;
  return { n, normal: n === 0 && (findings.includes(normalOf(sys.k)) || findings.includes(NIL)) };
}

/** «تضخم الكبد (Hepatomegaly)» ⇒ الاسمُ ومصطلحُه: اللاتينيُّ بين قوسين بآخر اسمٍ عربيّ (كما كتبه المالك). الإنكليزيُّ بلا قوسين يبقى كما هو. */
const TERM = /^(.*\p{Script=Arabic}.*?)\s*\(([^()\p{Script=Arabic}]*[A-Za-z][^()\p{Script=Arabic}]*)\)\s*$/u;
export function splitTerm(label: string): { main: string; term: string | null } {
  const m = TERM.exec(label);
  return m ? { main: m[1], term: m[2] } : { main: label, term: null };
}

/**
 * اسمُ الآفة بنصّ الملخّص والتقرير: بلا المصطلح اللاتينيّ (النصُّ للمربي)، ومسبوقٌ بمجموعته إن كان لا يسمّي عضوَه
 * («الطحال: وجود بؤر نخرية») — «تضخم الكبد» وحدها تكفي، والعامّةُ بلا سابقة. ورمزٌ لا نعرفه (نسخةٌ أحدث كتبته) كما
 * كان: «العضو: الآفة». الأسماءُ من القاموس بيد من يسأل (هذه الوحدةُ بلا نصّ).
 */
export function lesionText(code: string, name: (code: string) => string, group: (sub: string) => string, organ: (prefix: string) => string): string {
  const main = splitTerm(name(code)).main;
  const home = homeOf(code);
  if (!home) return `${organ(code.split(".")[0])}: ${main}`;
  return home.sub === "gen" || SELF_NAMED.has(code) ? main : `${group(home.sub)}: ${main}`;
}

/** البحثُ بالقائمة كلّها: كلُّ كلمةٍ من السؤال تُطابَق باسم الآفة (ومصطلحه) أو باسم جهازها ومجموعتها — **الطرفان من الدالّة
 *  نفسِها** (searchable: همزة/ة/ى والأرقام)؛ تطبيعُ طرفٍ واحد يفشل بصمتٍ ويبدو أنه يعمل. وما طابقه اسمُه أوّلاً: «الاكياس» تُرجع
 *  آفاتِ الأكياس قبل «احتقان الرئتين» الذي جاء باسم مجموعته («الرئتان والأكياس الهوائية»). والرمزُ بجهازين يُرجَع مرّةً. */
export function findLesions(
  q: string, systems: readonly NecroSystem[], name: (code: string) => string, group: (sys: string, sub: string) => string, norm: (s: string) => string,
): string[] {
  const words = q.split(/\s+/).map(norm).filter(Boolean);
  if (!words.length) return [];
  const own: string[] = [], ctx: string[] = [];
  for (const s of systems) for (const sub of s.subs) for (const code of sub.codes) {
    if (own.includes(code) || ctx.includes(code)) continue;
    const a = norm(name(code)), g = norm(group(s.k, sub.k));
    if (words.every((w) => a.includes(w))) own.push(code);
    else if (words.every((w) => a.includes(w) || g.includes(w))) ctx.push(code);
  }
  return [...own, ...ctx];
}
