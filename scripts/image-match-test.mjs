/* ============================================================================
 * مطابقةُ صور المكتبة بمنتجات العيادة (src/lib/imageMatch.ts) — بسلوكها.
 *
 * الباركودُ (والإضافيُّ، وحالةُ الأحرف، والمحارفُ الخفيّة) يغلب، والقصيرُ لا يُطابق؛ الاسمُ بوزن الندرة
 * والحجمُ حَكَم (٢ كغم ≠ ٤٠٠ غم، و٠٫٤ كيلو = ٤٠٠ غم)؛ ما صورتُه من المكتبة لا يُقترح عليه؛ وما عنده صورةٌ
 * قسمٌ وحده بالأكيد وحده؛ و«مو هاي» يصعد البديل. ثمّ طفراتٌ على المصدر يجب أن يمسكها الفحص.
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SRC = "src/lib/imageMatch.ts";
async function load(source) {
  const built = await esbuild.build({
    stdin: { contents: source, resolveDir: "src/lib", loader: "ts", sourcefile: "imageMatch.ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", alias: { "@": "./src" },
  });
  const dir = mkdtempSync(join(tmpdir(), "imatch-"));
  const f = join(dir, "m.mjs");
  writeFileSync(f, built.outputFiles[0].text);
  try { return await import(pathToFileURL(f).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

const L = (id, name, extra = {}) => ({ id, name, barcode: null, company: null, agency: null, path: `library/${id}.webp`, clinic_id: null, ...extra });
const P = (id, name, extra = {}) => ({ id, name, barcode: null, alt_codes: [], company_name: null, image_path: null, ...extra });

const LIB = [
  L("rck2", "Royal Canin Kitten Dry Food 2 kg", { barcode: "3182550702973", company: "Pet Line", agency: "Royal Canin" }),
  L("rck4", "Royal Canin Kitten Dry Food 400g", { barcode: "3182550702416", company: "Pet Line", agency: "Royal Canin" }),
  L("rca2", "Royal Canin Adult Indoor 2kg", { company: "Pet Line", agency: "Royal Canin" }),
  L("whis", "Whiskas Tuna Pouch 85gm", { barcode: "5000166071001" }),
  L("whis2", "Whiskas Chicken Pouch 85gm"),
  L("ar1", "رويال كانين كيتن ٢ كغم"),
  L("mine", "Royal Canin Kitten Dry Food 2 kg (clinic copy)", { barcode: "3182550702973", clinic_id: "C1", path: "C1/lib-mine.webp" }),
  L("vit", "Pet Vitamin Paste 100 ml", { barcode: "6291234567890" }),
  L("vitL", "Pet Vitamin Paste 0.1 L"),
  L("short", "Collar Red", { barcode: "12" }),
  L("felixA", "Felix Salmon In Jelly Senior Pouch Multipack"),
  L("zyl", "Zylkene Capsules"),
  ...Array.from({ length: 60 }, (_, i) => L(`cf${i}`, `Cat Food Generic ${i} pack`)),
];

async function run(m, quiet = false) {
  let fails = 0, passes = 0;
  const check = (name, cond, detail = "") => {
    if (cond) passes++;
    else { fails++; if (!quiet) console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
    if (cond && !quiet) console.log(`   ✓ ${name}`);
  };
  const ids = (xs) => xs.map((x) => x.product.id).sort().join(",");
  const find = (r, pid) => [...r.code, ...r.name, ...r.replace].find((x) => x.product.id === pid);

  // ── الحجم ──
  check("٢ kg = 2000g", m.sizesOf("Food 2 kg").sizes.join() === "g:2000");
  check("0.4 كيلو = 400 غم", m.sizesOf("طعام 0.4 كيلو").sizes.join() === m.sizesOf("طعام 400 غم").sizes.join());
  check("أرقامٌ شرقية وفاصلةٌ عشرية: ٢٫٥ كغم", m.sizesOf("علف ٢,٥ كغم").sizes.join() === "g:2500");
  check("1L = 1000 ml، و0.1 L = 100ml", m.sizesOf("x 1L").sizes.join() === "ml:1000" && m.sizesOf("x 0.1 L").sizes.join() === "ml:100");
  check("12x85g ⇒ 85 غم (المضاعِفُ ليس حجماً)", m.sizesOf("Pouch 12x85g").sizes.join() === "g:85");
  check("«3 in 1» و«15 cats» ليسا حجماً", m.sizesOf("3 in 1 for 15 cats").sizes.length === 0);
  check("وزنٌ وحجمٌ لا يتعارضان (بُعدان)", m.sizesAgree(["g:100"], ["ml:100"]));
  check("حجمٌ بطرفٍ وحده لا يحكم", m.sizesAgree(["g:2000"], []));
  check("٢ كغم ≠ ٤٠٠ غم", !m.sizesAgree(["g:2000"], ["g:400"]));

  // ── الباركود ──
  const prods = [
    P("p1", "رويال كانين قطط صغار", { barcode: "3182550702973" }),            // باركود ⇒ نسخةُ العيادة أوّلاً
    P("p2", "Kitten food", { alt_codes: ["‎5000166071001"] }),              // بالإضافيّ وبمحرفٍ خفيّ
    P("p3", "Collar Red", { barcode: "12" }),                                     // رمزٌ قصير ⇒ يُطابق بالاسم لا بالرمز
    P("p4", "Royal Canin Kitten 2kg"),                                            // اسم ⇒ rck2 لا rck4 (الحجم)
    P("p5", "Royal Canin Kitten 400 g"),                                          // اسم ⇒ rck4
    P("p6", "Cat Food"),                                                          // كلماتٌ شائعة ⇒ ليس أكيداً
    P("p7", "رويال كانين كيتن 2 كيلو"),                                          // عربيّ ⇒ ar1
    P("p8", "Royal Canin Kitten Dry Food 2 kg", { image_path: "C1/own-photo.jpg", barcode: "3182550702973" }), // عنده صورة ⇒ استبدال
    P("p9", "Royal Canin Kitten Dry Food 2 kg", { image_path: "library/rck2.webp" }), // صورتُه من المكتبة ⇒ لا شيء
    P("p10", "Dog Leash Blue"),                                                   // لا شيء
    P("p11", "Pet Vitamin Paste 100ml"),                                          // ٠٫١ لتر = ١٠٠ مل: البديلان معاً
    P("p12", "whiskas tuna pouch", { barcode: "5000166071001".toLowerCase() }),
  ];
  const r = m.matchAll(prods, LIB);
  const p1 = find(r, "p1");
  check("الباركود ⇒ قسمُ الباركود، ونسخةُ العيادة أوّلاً", p1?.how === "code" && r.code.includes(p1) && p1.best.id === "mine" && p1.alts[0]?.id === "rck2", JSON.stringify(p1 && [p1.how, p1.best.id]));
  check("  والباركودُ أكيدٌ ونقاطُه ١", p1?.sure === true && p1?.score === 1);
  check("الرمزُ الإضافيّ بمحرفٍ خفيّ يُطابق", find(r, "p2")?.best.id === "whis" && find(r, "p2")?.how === "code");
  check("رمزٌ قصير (رقمُ رفّ) لا يُطابق بالرمز", find(r, "p3")?.how !== "code");
  const p4 = find(r, "p4");
  check("الاسم مع الحجم: ٢kg ⇒ صورةُ ٢ كغم", p4?.how === "name" && p4.best.path.includes("rck2") || p4?.best.id === "mine", JSON.stringify(p4 && [p4.best.id, p4.alts.map((x) => x.id)]));
  check("  وصورةُ ٤٠٠ غم ليست بديلاً له أصلاً", !(p4?.alts ?? []).some((x) => x.id === "rck4") && p4?.best.id !== "rck4");
  check("٤٠٠ g ⇒ صورةُ ٤٠٠ غم", find(r, "p5")?.best.id === "rck4", JSON.stringify(find(r, "p5")?.best.id));
  const p6 = find(r, "p6");
  check("كلماتٌ بنصف المكتبة لا تصنع اقتراحاً أكيداً", !p6 || p6.sure === false, JSON.stringify(p6 && [p6.best.id, p6.score]));
  check("العربيّ مطبَّعاً: «رويال كانين كيتن 2 كيلو» ⇒ «… ٢ كغم»", find(r, "p7")?.best.id === "ar1", JSON.stringify(find(r, "p7")?.best.id));
  const p8 = find(r, "p8");
  check("عنده صورتُه ⇒ قسمُ «صورة ثانية» بالباركود", !!p8 && r.replace.includes(p8) && p8.how === "code");
  check("صورتُه من المكتبة ⇒ لا اقتراح", !find(r, "p9"));
  check("بلا شيء ⇒ يُعدّ «ماكو»", !find(r, "p10") && r.none >= 1);
  const p11 = find(r, "p11");
  check("١٠٠ مل و٠٫١ لتر حجمٌ واحد", !!p11 && ["vit", "vitL"].includes(p11.best.id) && [p11.best.id, ...p11.alts.map((x) => x.id)].includes("vitL") && [p11.best.id, ...p11.alts.map((x) => x.id)].includes("vit"));
  check("حالةُ الأحرف لا تكسر الباركود", find(r, "p12")?.how === "code");
  check("قسمُ الاسم: الأكيدُ أوّلاً", r.name.every((x, i, a) => i === 0 || !x.sure || a[i - 1].sure));
  check("لا منتجَ بقسمين", new Set([...r.code, ...r.name, ...r.replace].map((x) => x.product.id)).size === r.code.length + r.name.length + r.replace.length);

  // ── الندرة، والكلمةُ الواحدة، والضعيفُ لما عنده صورة ──
  const r6 = m.matchAll([P("f1", "Felix Salmon Cat Food"), P("z1", "Zylkene Drops"), P("img1", "Royal Canin Kitten", { image_path: "C1/own.jpg" })], LIB);
  check("الكلمةُ النادرة تشهد والشائعة لا: «Felix Salmon» يغلب «Cat Food»", find(r6, "f1")?.best.id === "felixA", JSON.stringify(find(r6, "f1") && [find(r6, "f1").best.id, find(r6, "f1").score]));
  check("كلمةٌ واحدة مشتركة باسمٍ من كلمتين لا تكفي (Zylkene Drops ≠ Capsules)", !find(r6, "z1"));
  check("عنده صورة واسمُه يطابق أكثر من صورة ⇒ لا يُقترح عليه تخمين", !find(r6, "img1"));

  // ── «مو هاي» ──
  const rej = new Set([`p1|C1/lib-mine.webp`]);
  const r2 = m.matchAll(prods, LIB, { skip: (pid, path) => rej.has(`${pid}|${path}`) });
  check("«مو هاي» يصعد البديل", find(r2, "p1")?.best.id === "rck2");
  const rej2 = new Set(["p1|C1/lib-mine.webp", "p1|library/rck2.webp"]);
  const r3 = m.matchAll(prods, LIB, { skip: (pid, path) => rej2.has(`${pid}|${path}`) });
  const p1b = find(r3, "p1");
  check("رفضُ كلّ صور الباركود ⇒ يرجع للاسم أو لا شيء (لا يعيد المرفوض)", !p1b || (p1b.best.path !== "C1/lib-mine.webp" && p1b.best.path !== "library/rck2.webp"));

  // ── أحادية الكلمة، والتكرار، والحتمية ──
  const r4 = m.matchAll([P("q1", "Whiskas")], LIB);
  check("اسمٌ بكلمةٍ واحدة نادرة يُقترح (ليس أكيداً)", find(r4, "q1")?.how === "name" && find(r4, "q1")?.sure === false, JSON.stringify(find(r4, "q1") && [find(r4, "q1").sure, find(r4, "q1").score]));
  const dupLib = [...LIB, { ...LIB[0], id: "dup" }];
  const r5 = m.matchAll([P("d1", "x", { barcode: "3182550702973" })], dupLib);
  check("صفّان بالمسار نفسِه صورةٌ واحدة", [find(r5, "d1").best.path, ...find(r5, "d1").alts.map((x) => x.path)].filter((x) => x === "library/rck2.webp").length === 1);
  const a = JSON.stringify(m.matchAll(prods, LIB)), b = JSON.stringify(m.matchAll(prods, [...LIB].reverse()));
  check("الترتيبُ حتميّ (عكسُ المكتبة لا يغيّر النتيجة)", a === b);

  // ── قبل «اقبل الكل»: الحالُ الآن ──
  const items = [...r.code, ...r.replace];
  const fresh = new Map(items.map((x) => [x.product.id, x.product.image_path ?? null]));
  fresh.set("p1", "C1/someone-else.jpg");          // صوّره أحدٌ أثناءها
  fresh.delete("p2");                              // حُذف
  const sp = m.freshSplit(items, fresh);
  check("ما تبدّلت صورتُه لا يُكتب فوقه، وما اختفى لا يُكتب له", sp.changed === 1 && sp.gone === 1 && !sp.go.some((x) => x.product.id === "p1" || x.product.id === "p2") && sp.go.length === items.length - 2);
  const fresh2 = new Map(fresh); fresh2.set("p8", null);
  check("  وما فُصلت صورتُه بعد أن رأيناها «عنده صورة» يُعدّ متبدّلاً", m.freshSplit(items, fresh2).changed === 2);

  // ── الحجم: ٣٠٠٠ منتج × ٣٠٠٠ صورة بزمنٍ معقول ──
  const bigLib = Array.from({ length: 3000 }, (_, i) => L(`b${i}`, `Brand${i % 300} Line${i % 37} Flavor${i % 11} ${(i % 9) + 1}kg`, { barcode: String(6290000000000 + i) }));
  const bigP = Array.from({ length: 3000 }, (_, i) => P(`bp${i}`, `Brand${(i * 7) % 300} Line${i % 37} Flavor${i % 11} ${(i % 9) + 1} kg`, { barcode: i % 3 ? String(6290000000000 + i) : null }));
  const t0 = performance.now();
  const rb = m.matchAll(bigP, bigLib);
  const ms = performance.now() - t0;
  check(`٣٠٠٠×٣٠٠٠ بأقلّ من ثانيتين (${Math.round(ms)} م.ث)`, ms < 2000);
  check("  والباركودُ وجد ثلثيها", rb.code.length === 2000, String(rb.code.length));

  return { fails, passes };
}

const src = readFileSync(SRC, "utf8");
console.log("▸ image-match");
const base = await run(await load(src));

// ── طفراتٌ يجب أن يمسكها الفحص ──
const MUTS = [
  ["الحجمُ لا يحكم", "if (!words.length || !r.words.length || !sizesAgree(sizes, r.sizes)) return 0;", "if (!words.length || !r.words.length) return 0;"],
  ["الرمزُ القصير يُطابق (الطرفان)", [["if (k.length >= MIN_CODE) out.add(k);", "if (k.length >= 1) out.add(k);"], ["if (k.length >= MIN_CODE) { const a = byCode.get(k);", "if (k.length >= 1) { const a = byCode.get(k);"]]],
  ["الوزنُ ثابت (لا ندرة)", "const weight = (w: string) => Math.log(1 + N / (df.get(w) ?? 0.5));", "const weight = (_w: string) => 1;"],
  ["«مو هاي» يُتجاهل", "const skip = opts.skip ?? (() => false);", "const skip = () => false;"],
  ["صورةُ المكتبة الحاليّة لا تُستثنى", "if (has && seenPath.has(cur)) continue;", ""],
  ["كلمةٌ واحدة تكفي", "if (k < 2 && !(words.length === 1 && k === 1)) return 0;", "if (k < 1) return 0;"],
  ["الباركودُ بلا طيّ الحالة", "const k = matchCode(c);", "const k = String(c ?? \"\");"],
  ["نسخةُ العيادة لا تتقدّم", "(a.clinic_id ? 0 : 1) - (b.clinic_id ? 0 : 1) || ", ""],
  ["ما عنده صورة يأخذ الاسمَ الضعيف", "if (has) { if (sure) out.replace.push(item); }", "if (has) { out.replace.push(item); }"],
  ["الصورةُ المتبدّلة تُكتب فوقها", "if ((fresh.get(it.product.id) ?? null) !== (it.product.image_path ?? null)) { changed++; continue; }", ""],
  ["المسارُ المكرّر يُعدّ مرّتين", "if (!r.path || seenPath.has(r.path)) continue;", "if (!r.path) continue;"],
  ["الكيلو بلا ضرب", "[/^(?:kg|kgs|kilo|kilos|كغم|كغ|كيلو|كيلوغرام|كيلوجرام|كجم)$/, \"g\", 1000],", "[/^(?:kg|kgs|kilo|kilos|كغم|كغ|كيلو|كيلوغرام|كيلوجرام|كجم)$/, \"g\", 1],"],
];
let caught = 0, escaped = 0;
for (const [name, from, to] of MUTS) {
  const pairs = Array.isArray(from) ? from : [[from, to]];
  const miss = pairs.find(([f]) => !src.includes(f));
  if (miss) { escaped++; console.error(`   ✗ طفرة «${name}»: ما لكيت نصَّها`); continue; }
  const msrc = pairs.reduce((acc, [f, t]) => acc.replace(f, t), src);
  let res;
  let mm;
  try { mm = await load(msrc); } catch (e) { escaped++; console.error(`   ✗ طفرة «${name}» ما انبنت: ${e.message}`); continue; }
  try { res = await run(mm, true); } catch { res = { fails: 1 }; }
  if (res.fails > 0) { caught++; console.log(`   ✓ طفرة «${name}» انمسكت`); }
  else { escaped++; console.error(`   ✗ طفرة «${name}» مرّت`); }
}

const fails = base.fails + escaped;
console.log(`${fails ? "✗" : "✓"} image-match-test: ${base.passes} نجح، ${base.fails} فشل، وطفرات ${caught}/${MUTS.length}`);
process.exit(fails ? 1 : 0);
