/* ============================================================================
 * استيرادُ مكتبة الصور من إكسل (src/lib/libraryImport.ts) — بسلوكه على ملفّاتٍ حقيقيّة البنية.
 *
 * يبني بالذاكرة ملفَّي xlsx بشكلين يُصنعان فعلاً:
 *   (أ) بشكل openpyxl (ملفُّ الموزّع الأوّل): نصٌّ داخليّ، `oneCellAnchor`، أهدافٌ مطلقة، بلا بادئة وسوم.
 *   (ب) بشكل إكسل: نصوصٌ مشتركة ونصٌّ غنيّ وكيانات XML، `xdr:twoCellAnchor`، أهدافٌ نسبيّة `../media`،
 *       صفٌّ بلا صورة وصفٌّ بصورتين، وجزءٌ مخزَّنٌ بلا ضغط بجانب المضغوط.
 * ثمّ يفحص الخطّة: الباركودُ ٨–١٤ رقماً وحده، والموجودُ لنفس الشركة والصنف يُتخطّى، والاسمان برمزين
 * منتجان، والمكرّرُ بالملف مرّةً واحدة. وطفراتٌ على المصدر يجب أن يُمسكها الفحص.
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import zlib from "node:zlib";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const SRC = "src/lib/libraryImport.ts";
async function load(source) {
  const built = await esbuild.build({
    stdin: { contents: source, resolveDir: "src/lib", loader: "ts", sourcefile: "libraryImport.ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", alias: { "@": "./src" },
  });
  const dir = mkdtempSync(join(tmpdir(), "libimp-"));
  const f = join(dir, "m.mjs");
  writeFileSync(f, built.outputFiles[0].text);
  try { return await import(pathToFileURL(f).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

/* ── كاتبُ ZIP صغير: محلّيٌّ + دليلٌ مركزيّ + نهاية (deflate أو تخزين) ── */
function zip(files) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content, store] of files) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const comp = store ? data : zlib.deflateRawSync(data);
    const crc = zlib.crc32(data);
    const nameB = Buffer.from(name, "utf8");
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(store ? 0 : 8, 8); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameB.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(store ? 0 : 8, 10); central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(comp.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameB.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameB, comp);
    centrals.push(central, nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}
const JPG = (n) => Buffer.from([0xff, 0xd8, 0xff, 0xe0, n, n, n, 0xff, 0xd9]);   // بايتاتٌ مميّزة لكلّ صورة

/* (أ) بشكل openpyxl — كما وصل ملفُّ الموزّع. */
function openpyxlBook() {
  const head = ["الصورة", "اسم المنتج", "الماركة", "الوزن", "السعر (د.ع)", "التصنيف", "SKU"];
  const rows = [
    ["", "معلبات قطط بالدجاج 400g", "MOOCHIE", "400g", "2500", "طعام رطب", "8859710209096"],
    ["", "رمل قطط 10 لتر", "", "10L", "9000", "الرمل", "123"],                 // SKU داخليّ ⇒ يُسقط
    ["", "مكافأة سائلة تونة", "INABA", "56g", "1500", "مكافئات", "٤٩٠١١٣٣٧٢٠٥٩٦"],   // أرقامٌ شرقيّة ⇒ تُقبل
    ["", "مكافأة سائلة تونة", "INABA", "56g", "1500", "مكافئات", "4901133720602"],   // نفسُ الاسم برمزٍ آخر ⇒ منتجٌ ثانٍ
    ["", "طعام جاف قطط بالغة", "Felicia", "2kg", "18000", "طعام جاف", ""],
  ];
  const cell = (ref, v, num) => (num ? `<c r="${ref}" t="n"><v>${v}</v></c>` : `<c r="${ref}" t="inlineStr"><is><t>${v}</t></is></c>`);
  const letters = "ABCDEFG";
  const row = (r, vals) => `<row r="${r}">${vals.map((v, i) => (v === "" ? "" : cell(`${letters[i]}${r}`, v, i === 4))).join("")}</row>`;
  const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData>${row(1, head)}${rows.map((v, i) => row(i + 2, v)).join("")}</sheetData><drawing r:id="rId1"/></worksheet>`;
  const anchors = rows.map((_, i) => `<oneCellAnchor><from><col>0</col><colOff>0</colOff><row>${i + 1}</row><rowOff>0</rowOff></from><ext cx="1" cy="1"/><pic><blipFill><a:blip r:embed="rId${i + 1}"/></blipFill></pic><clientData/></oneCellAnchor>`).join("");
  return zip([
    ["[Content_Types].xml", "<Types/>"],
    ["xl/workbook.xml", `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="cats" sheetId="1" r:id="rId1"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="/xl/worksheets/sheet1.xml" Id="rId1"/></Relationships>`],
    ["xl/worksheets/sheet1.xml", sheet],
    ["xl/worksheets/_rels/sheet1.xml.rels", `<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="/xl/drawings/drawing1.xml" Id="rId1"/></Relationships>`],
    ["xl/drawings/drawing1.xml", `<wsDr xmlns:a="a" xmlns:r="r">${anchors}</wsDr>`],
    ["xl/drawings/_rels/drawing1.xml.rels", `<Relationships>${rows.map((_, i) => `<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="/xl/media/image${i + 1}.jpeg" Id="rId${i + 1}"/>`).join("")}</Relationships>`],
    ...rows.map((_, i) => [`xl/media/image${i + 1}.jpeg`, JPG(i + 1), true]),
  ]);
}

/* (ب) بشكل إكسل — نصوصٌ مشتركة، بادئةُ xdr، twoCellAnchor، أهدافٌ نسبيّة، وورقتان. */
function excelBook() {
  const ss = ["Name", "Brand", "Category", "Barcode", "Dog food &amp; treats", "Royal", "Dry", "Bone toy", "Toys", "Shampoo"];
  const si = ss.map((s, i) => (i === 7 ? `<si><r><t>Bone</t></r><r><t xml:space="preserve"> toy</t></r></si>` : `<si><t>${s}</t></si>`)).join("");
  const sheet = `<x:worksheet xmlns:x="m"><x:sheetData>
    <x:row r="1"><x:c r="A1" t="s"><x:v>0</x:v></x:c><x:c r="B1" t="s"><x:v>1</x:v></x:c><x:c r="C1" t="s"><x:v>2</x:v></x:c><x:c r="D1" t="s"><x:v>3</x:v></x:c></x:row>
    <x:row r="2"><x:c r="A2" t="s"><x:v>4</x:v></x:c><x:c r="B2" t="s"><x:v>5</x:v></x:c><x:c r="C2" t="s"><x:v>6</x:v></x:c><x:c r="D2"><x:v>3182550702003.0</x:v></x:c></x:row>
    <x:row r="3"><x:c r="A3" t="s"><x:v>7</x:v></x:c><x:c r="C3" t="s"><x:v>8</x:v></x:c></x:row>
    <x:row r="4"><x:c r="A4" t="s"><x:v>9</x:v></x:c><x:c r="C4" t="s"><x:v>8</x:v></x:c><x:c r="D4"/></x:row>
  </x:sheetData></x:worksheet>`;
  const anchor = (row, rid) => `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>4</xdr:col><xdr:colOff>9</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>5</xdr:col><xdr:row>${row + 1}</xdr:row></xdr:to><xdr:pic><xdr:blipFill><a:blip xmlns:r="r" r:embed="${rid}" cstate="print"/></xdr:blipFill></xdr:pic><xdr:clientData/></xdr:twoCellAnchor>`;
  return zip([
    ["xl/workbook.xml", `<workbook xmlns:r="r"><sheets><sheet name="dogs" sheetId="1" r:id="rId7"/><sheet name="empty" sheetId="2" r:id="rId8"/></sheets></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<Relationships><Relationship Id="rId7" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId8" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`],
    ["xl/sharedStrings.xml", `<sst>${si}</sst>`],
    ["xl/worksheets/sheet1.xml", sheet],
    ["xl/worksheets/sheet2.xml", `<worksheet><sheetData/></worksheet>`, true],
    ["xl/worksheets/_rels/sheet1.xml.rels", `<Relationships><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>`],
    ["xl/drawings/drawing1.xml", `<xdr:wsDr xmlns:xdr="x" xmlns:a="a">${anchor(1, "rIdA")}${anchor(1, "rIdB")}${anchor(3, "rIdC")}</xdr:wsDr>`],
    ["xl/drawings/_rels/drawing1.xml.rels", `<Relationships><Relationship Id="rIdA" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image1.png"/><Relationship Id="rIdB" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"/><Relationship Id="rIdC" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image3.jpeg"/></Relationships>`],
    ["xl/media/image1.png", JPG(11), true], ["xl/media/image2.png", JPG(12), true], ["xl/media/image3.jpeg", JPG(13)],
  ]);
}

async function suite(M, label = "") {
  const before = fails;
  /* (أ) */
  const zA = M.openZip(openpyxlBook());
  const [A] = await M.readWorkbook(zA);
  check(`${label}(أ) الورقةُ باسمها وصفوفُها الخمسة`, A?.name === "cats" && A.rows.length === 5, JSON.stringify({ n: A?.name, r: A?.rows.length }));
  check(`${label}(أ) كلُّ صفٍّ بصورته المثبَّتة به (الصفّ ٢ ← image1)`, A.rows[0]?.image === "xl/media/image1.jpeg" && A.rows[4]?.image === "xl/media/image5.jpeg", A.rows.map((r) => r.image).join(","));
  const bytes = await zA.read(A.rows[2].image);
  check(`${label}(أ) الصورةُ تُقرأ ببايتاتها (مخزّنةٌ بلا ضغط)`, bytes[4] === 3 && bytes.length === 9, [...bytes].join(","));
  const cA = M.guessColumns(A.headers);
  check(`${label}(أ) الأعمدةُ برؤوسها العربيّة`, cA && cA.name === 1 && cA.agency === 2 && cA.section === 5 && cA.barcode === 6, JSON.stringify(cA));
  const pA = M.planImport(A, cA, { company: "اليف هاوس", kind: "قطط" }, []);
  check(`${label}(أ) خمسٌ جديدة على مكتبةٍ فارغة`, pA.counts.new === 5, JSON.stringify(pA.counts));
  check(`${label}(أ) SKU داخليّ (123) يُسقط ويُعدّ، والمنتجُ يبقى`, pA.items[1].barcode === null && pA.items[1].droppedCode === "123" && pA.droppedCodes === 1);
  check(`${label}(أ) الأرقامُ الشرقيّة باركودٌ مقبول`, pA.items[2].barcode === "4901133720596", pA.items[2].barcode);
  check(`${label}(أ) اسمان متطابقان برمزين مختلفين = منتجان`, pA.items[2].status === "new" && pA.items[3].status === "new");
  check(`${label}(أ) بلا ماركة ⇒ وكالةٌ فارغة (null) تُعدّ وحدها`, pA.items[1].agency === null && pA.agencies.get(null) === 1 && pA.agencies.get("INABA") === 2);

  /* الإعادةُ آمنة: ما رُفع لنفس الشركة والصنف يُتخطّى؛ وغيرُهما لا */
  const lib = [
    { id: "1", name: "x", company: "اليف  هاوس", kind: "قطط", agency: null, section: null, barcode: "8859710209096", path: "p", updated_at: "" },
    { id: "2", name: "طعام جاف قطط بالغة", company: "اليف هاوس", kind: "قطط", agency: null, section: null, barcode: null, path: "p", updated_at: "" },
    { id: "3", name: "رمل قطط 10 لتر", company: "اليف هاوس", kind: "كلاب", agency: null, section: null, barcode: null, path: "p", updated_at: "" },
  ];
  const pA2 = M.planImport(A, cA, { company: "اليف هاوس", kind: "قطط" }, lib);
  check(`${label}(أ) الموجودُ بالباركود (والشركةُ بمسافةٍ زائدة) يُتخطّى`, pA2.items[0].status === "exists", pA2.items[0].status);
  check(`${label}(أ) الموجودُ بالاسم حين لا رمز يُتخطّى`, pA2.items[4].status === "exists", pA2.items[4].status);
  check(`${label}(أ) نفسُ الاسم بصنفٍ آخر ليس موجوداً`, pA2.items[1].status === "new", pA2.items[1].status);
  check(`${label}(أ) المجموعُ = الصفوف`, Object.values(pA2.counts).reduce((a, b) => a + b, 0) === 5);

  /* (ب) */
  const zB = M.openZip(excelBook());
  const sheets = await M.readWorkbook(zB);
  const B = sheets[0];
  check(`${label}(ب) ورقتان، والفارغةُ بلا صفوف`, sheets.length === 2 && sheets[1].rows.length === 0, sheets.map((s) => `${s.name}:${s.rows.length}`).join(","));
  check(`${label}(ب) نصٌّ مشترك + كيان XML يُفكّ`, B.rows[0].cells[0] === "Dog food & treats", B.rows[0].cells[0]);
  check(`${label}(ب) النصُّ الغنيّ يُجمع قطعه`, B.rows[1].cells[0] === "Bone toy", B.rows[1].cells[0]);
  check(`${label}(ب) رقمٌ «…003.0» يرجع باركوداً صحيحاً`, B.rows[0].cells[3] === "3182550702003", B.rows[0].cells[3]);
  check(`${label}(ب) twoCellAnchor + هدفٌ نسبيّ ../media`, B.rows[0].image === "xl/media/image1.png" && B.rows[2].image === "xl/media/image3.jpeg", B.rows.map((r) => r.image).join(","));
  check(`${label}(ب) صفٌّ بصورتين: الأولى وتُعدّ اثنتين`, B.rows[0].images === 2);
  check(`${label}(ب) صفٌّ بلا صورة`, B.rows[1].image === null);
  const cB = M.guessColumns(B.headers);
  check(`${label}(ب) الرؤوسُ الإنكليزيّة`, cB && cB.name === 0 && cB.agency === 1 && cB.section === 2 && cB.barcode === 3, JSON.stringify(cB));
  const pB = M.planImport(B, cB, { company: "X", kind: "كلاب" }, []);
  check(`${label}(ب) بلا صورة ⇒ لا يُرفع`, pB.items[1].status === "noImage" && pB.counts.new === 2, JSON.stringify(pB.counts));
  const pB2 = M.planImport({ ...B, rows: [...B.rows, { ...B.rows[0], row: 9 }] }, cB, { company: "X", kind: "كلاب" }, []);
  check(`${label}(ب) المكرّرُ بالملف مرّةً واحدة`, pB2.items[3].status === "dupInFile", pB2.items[3].status);

  /* وحدات */
  check(`${label}الباركود ٨–١٤ رقماً وحده`, M.libraryBarcode("12345678") === "12345678" && M.libraryBarcode("1234567") === null && M.libraryBarcode("AH-2231") === null && M.libraryBarcode(" 4820 0839 0889 7 ") === "4820083908897");
  check(`${label}المسارُ النسبيّ والمطلق`, M.resolvePart("xl/drawings/drawing1.xml", "../media/a.png") === "xl/media/a.png" && M.resolvePart("xl/workbook.xml", "/xl/worksheets/s.xml") === "xl/worksheets/s.xml");
  check(`${label}رأسٌ بلا عمود اسم ⇒ null`, M.guessColumns(["SKU", "Price"]) === null);
  let threw = null;
  try { M.openZip(Buffer.from("not a zip at all")); } catch (e) { threw = e.code; }
  check(`${label}ملفٌّ ليس ZIP يُقال برمزه`, threw === "not_zip", String(threw));
  return fails === before;
}

console.log("▸ استيرادُ مكتبة الصور من إكسل");
const src = readFileSync(SRC, "utf8");
await suite(await load(src));

/* طفرات: كلُّ واحدةٍ تكسر سطراً معقولاً ويجب أن تُسقط فحصاً. */
const MUTANTS = [
  ["الباركود يقبل أيَّ رمز", /\/\^\\d\{8,14\}\$\/\.test\(c\)/, "c.length > 0"],
  ["الهدفُ النسبيّ يُعامَل مطلقاً", 'if (seg === "..") parts.pop();', 'if (seg === "..") {}'],
  ["الصفُّ يأخذ صورةَ الصفّ الذي قبله", "imageAt.set(row + 1, list);", "imageAt.set(row + 2, list);"],
  ["الاسمُ وحده يكفي ولو اختلف الرمز", 'return !!set && (!ck || set.has(""));', "return !!set;"],
  ["الموجودُ بلا اعتبار الصنف", 'groupKey(r.kind ?? "") === kKey', "true"],
  ["النصوصُ المشتركة تُهمل", 'else if (ca.t === "s") val = shared[Number(v)] ?? "";', 'else if (ca.t === "s") val = v ?? "";'],
];
console.log("▸ طفرات (كلُّها يجب أن تُمسك)");
for (const [what, from, to] of MUTANTS) {
  const mutated = src.replace(from, to);
  if (mutated === src) { fails++; console.error(`   ✗ الطفرة «${what}» لم تجد سطرَها — حدّث الفحص`); continue; }
  const quiet = console.log, quietErr = console.error, saved = fails, savedP = passes;
  console.log = () => {}; console.error = () => {};
  let caught;
  try { caught = !(await suite(await load(mutated), "")); } catch { caught = true; }
  console.log = quiet; console.error = quietErr; fails = saved; passes = savedP;
  check(`طفرة «${what}» يمسكها الفحص`, caught);
}

console.log(`${fails ? "✗" : "✓"} library-import-test: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
