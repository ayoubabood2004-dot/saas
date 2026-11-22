// ============================================================================
// استيرادُ مكتبة الصور من ملف إكسل (المالك، ٢٠/١١).
//
// الشركةُ (الموزّع) تبعث جدولاً: صورةٌ مثبَّتةٌ بخليّة كلّ صفّ، واسمُ المنتج، والماركة (= الوكالة)،
// والتصنيف (= القسم)، والـSKU. والمكتبةُ صارت بأربعة مستويات: شركة ← صنف ← وكالة ← قسم. فالمشغّلُ
// يختار الملفَّ ويكتب الشركةَ والصنفَ، وهذا الملفّ يقرأ الجدولَ والصورَ **داخل المتصفّح** بلا مكتبةٍ إضافيّة:
//   • ZIP: الدليلُ المركزيّ + `DecompressionStream("deflate-raw")` (كروم ١٠٣+، سفاري ١٦٫٤+، فايرفوكس ١١٣+).
//   • الخلايا: نصٌّ داخليّ (`inlineStr`، ما يكتبه openpyxl) ونصوصٌ مشتركة (`sharedStrings`، ما يكتبه إكسل).
//   • الصور: مراسي `oneCellAnchor`/`twoCellAnchor` بالرسمة، وأهدافٌ مطلقة (`/xl/media/…`) ونسبيّة (`../media/…`)،
//     وبادئةُ الوسوم اختياريّة (`xdr:` من إكسل، بلا بادئة من openpyxl).
//
// ولماذا الباركود **٨–١٤ رقماً فقط**: ملفُّ الموزّع فيه SKU داخليّ (٢–٦ أرقام) لصفوفٍ بلا باركود. المكتبةُ
// تُطابَق برمز منتج العيادة، ورمزٌ داخليٌّ قصير يطابق أرقامَ رفوف العيادات (١٢، ٤٥…) فيقترح صورةً غلط بصمت —
// والصمتُ يُصدَّق. فما ليس EAN/UPC/GTIN يُسقط ويُعدّ، والمنتجُ يبقى بالاسم.
//
// والإعادةُ آمنة: ما بالمكتبة أصلاً لنفس الشركة والصنف (بالباركود، وإلا بالاسم مطبَّعاً) يُتخطّى — فملفٌّ
// انقطع رفعُه بنصّه يُعاد كما هو ويُكمِل من حيث وقف، بلا صورةٍ مكرّرة.
// ============================================================================
import { groupKey, matchCode, normalizeCode, searchable } from "./utils";
import { cleanLibName } from "./libraryLevels";
import type { LibraryImage } from "@/types";

/* ── ZIP ─────────────────────────────────────────────────────────────────── */

type ZipEntry = { name: string; method: number; compSize: number; offset: number };

export class XlsxError extends Error {
  /** رمزٌ ثابت تترجمه الشاشة — لا نصٌّ عربيّ هنا. */
  constructor(public code: "not_zip" | "zip64" | "no_inflate" | "bad_method" | "no_sheet" | "no_name_column") {
    super(code);
  }
}

const u16 = (b: Uint8Array, o: number) => b[o] | (b[o + 1] << 8);
const u32 = (b: Uint8Array, o: number) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;

export interface ZipReader {
  has(path: string): boolean;
  read(path: string): Promise<Uint8Array>;
  text(path: string): Promise<string>;
}

/** يقرأ الدليلَ المركزيّ مرّة، ويفكّ الملفَّ عند طلبه وحده (٩٠٠ صورة لا تُفكّ دفعةً واحدة). */
export function openZip(buf: ArrayBuffer | Uint8Array): ZipReader {
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 0xffff); i--) {
    if (u32(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new XlsxError("not_zip");
  const count = u16(b, eocd + 10);
  const cdOffset = u32(b, eocd + 16);
  if (count === 0xffff || cdOffset === 0xffffffff) throw new XlsxError("zip64");
  const entries = new Map<string, ZipEntry>();
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    if (u32(b, p) !== 0x02014b50) throw new XlsxError("not_zip");
    const method = u16(b, p + 10);
    const compSize = u32(b, p + 20);
    const nameLen = u16(b, p + 28), extraLen = u16(b, p + 30), commentLen = u16(b, p + 32);
    const offset = u32(b, p + 42);
    const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nameLen));
    entries.set(name.replace(/^\/+/, ""), { name, method, compSize, offset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  const read = async (path: string): Promise<Uint8Array> => {
    const e = entries.get(path.replace(/^\/+/, ""));
    if (!e) throw new Error(`zip: missing ${path}`);
    if (u32(b, e.offset) !== 0x04034b50) throw new XlsxError("not_zip");
    const start = e.offset + 30 + u16(b, e.offset + 26) + u16(b, e.offset + 28);
    const raw = b.subarray(start, start + e.compSize);
    if (e.method === 0) return raw.slice();
    if (e.method !== 8) throw new XlsxError("bad_method");
    if (typeof DecompressionStream === "undefined") throw new XlsxError("no_inflate");
    const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  };
  return {
    has: (path) => entries.has(path.replace(/^\/+/, "")),
    read,
    text: async (path) => new TextDecoder().decode(await read(path)),
  };
}

/* ── XML بقدر ما يحتاجه الجدول (بلا DOMParser — يجري بالمتصفّح وبفحص node) ─── */

export function decodeXml(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    const cp = k.startsWith("#x") ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
    return Number.isFinite(cp) ? String.fromCodePoint(cp) : "";
  });
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]] = decodeXml(m[3] ?? m[4] ?? "");
  return out;
}

/** نصُّ كلّ `<t>` داخل كتلة — النصُّ الغنيّ (`<r><t>…</t></r>`) يُجمع قطعةً قطعة. */
function textRuns(xml: string): string {
  let s = "";
  for (const m of xml.matchAll(/<(?:\w+:)?t(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?t>/g)) s += decodeXml(m[1]);
  return s;
}

type Rel = { id: string; target: string; type: string };
function parseRels(xml: string): Rel[] {
  return [...xml.matchAll(/<(?:\w+:)?Relationship\b[^>]*>/g)].map((m) => {
    const a = attrs(m[0]);
    return { id: a.Id ?? "", target: a.Target ?? "", type: a.Type ?? "" };
  });
}

/** هدفٌ مطلق (`/xl/media/x`) أو نسبيّ لمجلّد الجزء (`../media/x`). */
export function resolvePart(baseFile: string, target: string): string {
  if (target.startsWith("/")) return target.replace(/^\/+/, "");
  const parts = baseFile.split("/").slice(0, -1);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}
const relsOf = (part: string) => {
  const i = part.lastIndexOf("/");
  return `${part.slice(0, i)}/_rels/${part.slice(i + 1)}.rels`;
};

export function colIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "A";
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export interface SheetRow { row: number; cells: string[]; image: string | null; images: number }
export interface ParsedSheet { name: string; headers: string[]; rows: SheetRow[] }

/** يقرأ كلَّ أوراق الملف: الصفُّ الأوّل رؤوس، وكلُّ صفٍّ بعده خلاياه وصورتُه المثبَّتة (الأولى إن تعدّدت). */
export async function readWorkbook(zip: ZipReader): Promise<ParsedSheet[]> {
  const wbPath = "xl/workbook.xml";
  if (!zip.has(wbPath)) throw new XlsxError("no_sheet");
  const wb = await zip.text(wbPath);
  const wbRels = zip.has(relsOf(wbPath)) ? parseRels(await zip.text(relsOf(wbPath))) : [];
  const shared: string[] = [];
  if (zip.has("xl/sharedStrings.xml")) {
    const ss = await zip.text("xl/sharedStrings.xml");
    for (const m of ss.matchAll(/<(?:\w+:)?si\b[^>]*>([\s\S]*?)<\/(?:\w+:)?si>/g)) shared.push(textRuns(m[1]));
  }
  const sheets: ParsedSheet[] = [];
  for (const m of wb.matchAll(/<(?:\w+:)?sheet\b[^>]*\/?>/g)) {
    const a = attrs(m[0]);
    const rid = a["r:id"] ?? Object.entries(a).find(([k]) => /:id$/.test(k))?.[1];
    const rel = wbRels.find((r) => r.id === rid);
    if (!rel) continue;
    const path = resolvePart(wbPath, rel.target);
    if (!zip.has(path)) continue;
    const xml = await zip.text(path);

    // الصور: ورقة ← رسمة ← مراسٍ ← وسائط
    const imageAt = new Map<number, string[]>();
    if (zip.has(relsOf(path))) {
      for (const dr of parseRels(await zip.text(relsOf(path))).filter((r) => /\/drawing$/.test(r.type))) {
        const dPath = resolvePart(path, dr.target);
        if (!zip.has(dPath)) continue;
        const dXml = await zip.text(dPath);
        const dRels = zip.has(relsOf(dPath)) ? parseRels(await zip.text(relsOf(dPath))) : [];
        for (const an of dXml.matchAll(/<(?:\w+:)?(oneCellAnchor|twoCellAnchor)\b[\s\S]*?<\/(?:\w+:)?\1>/g)) {
          const from = /<(?:\w+:)?from>([\s\S]*?)<\/(?:\w+:)?from>/.exec(an[0])?.[1] ?? "";
          const row = Number(/<(?:\w+:)?row>(\d+)<\//.exec(from)?.[1] ?? NaN);
          const embed = /<(?:\w+:)?blip\b[^>]*\b[\w]+:embed="([^"]+)"/.exec(an[0])?.[1];
          const media = dRels.find((r) => r.id === embed);
          if (!Number.isFinite(row) || !media) continue;
          const list = imageAt.get(row + 1) ?? [];
          list.push(resolvePart(dPath, media.target));
          imageAt.set(row + 1, list);
        }
      }
    }

    // الخلايا
    const grid: { row: number; cells: string[] }[] = [];
    let auto = 0;
    for (const rm of xml.matchAll(/<(?:\w+:)?row\b([^>]*)>([\s\S]*?)<\/(?:\w+:)?row>/g)) {
      const rNum = Number(attrs(`<row ${rm[1]}>`).r ?? ++auto);
      auto = rNum;
      const cells: string[] = [];
      let nextCol = 0;
      for (const cm of rm[2].matchAll(/<(?:\w+:)?c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:\w+:)?c>)/g)) {
        const ca = attrs(`<c ${cm[1]}>`);
        const col = ca.r ? colIndex(ca.r) : nextCol;
        nextCol = col + 1;
        const body = cm[2] ?? "";
        const v = /<(?:\w+:)?v>([\s\S]*?)<\/(?:\w+:)?v>/.exec(body)?.[1];
        let val = "";
        if (ca.t === "inlineStr") val = textRuns(body);
        else if (ca.t === "s") val = shared[Number(v)] ?? "";
        else if (v != null) val = decodeXml(v);
        // رقمٌ كُتب «8859710209096.0» يرجع رقماً صحيحاً — الباركودُ لا يضيع بالفاصلة.
        if (ca.t !== "inlineStr" && ca.t !== "s" && ca.t !== "str" && /^\d+\.0+$/.test(val)) val = val.replace(/\.0+$/, "");
        cells[col] = val.trim();
      }
      for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = "";
      grid.push({ row: rNum, cells });
    }
    if (grid.length === 0) { sheets.push({ name: a.name ?? "", headers: [], rows: [] }); continue; }
    const [head, ...body] = grid;
    sheets.push({
      name: a.name ?? "",
      headers: head.cells,
      rows: body
        .filter((r) => r.cells.some((c) => c) || imageAt.has(r.row))
        .map((r) => ({ row: r.row, cells: r.cells, image: imageAt.get(r.row)?.[0] ?? null, images: imageAt.get(r.row)?.length ?? 0 })),
    });
  }
  if (sheets.length === 0) throw new XlsxError("no_sheet");
  return sheets;
}

/* ── تعيينُ الأعمدة وخطّةُ الاستيراد ──────────────────────────────────────── */

export interface ColumnMap { name: number; agency: number | null; section: number | null; barcode: number | null }

/* رؤوسٌ معروفة بالطيّ نفسِه (searchable) — عربيّةٌ وإنكليزيّة. بياناتُ مطابقة لا نصٌّ معروض (i18n-data). */
const HEADS: Record<keyof ColumnMap, string[]> = {
  name: ["اسم المنتج", "الاسم", "اسم المادة", "المنتج", "name", "product", "product name", "item"],   /* i18n-data: رؤوسُ أعمدةٍ تُطابَق بها جداولُ الموزّعين — لا نصٌّ معروض */
  agency: ["الماركة", "الوكالة", "البراند", "العلامة التجارية", "brand", "agency", "manufacturer"],   /* i18n-data: رؤوسُ أعمدةٍ تُطابَق بها جداولُ الموزّعين — لا نصٌّ معروض */
  section: ["التصنيف", "القسم", "الفئة", "المجموعة", "category", "section", "group"],   /* i18n-data: رؤوسُ أعمدةٍ تُطابَق بها جداولُ الموزّعين — لا نصٌّ معروض */
  barcode: ["sku", "الباركود", "باركود", "barcode", "ean", "upc", "gtin"],   /* i18n-data: رؤوسُ أعمدةٍ تُطابَق بها جداولُ الموزّعين — لا نصٌّ معروض */
};

/** يجد الأعمدة برؤوسها؛ null إن لم يوجد عمودُ اسم (لا استيرادَ بلا اسم). */
export function guessColumns(headers: string[]): ColumnMap | null {
  const keys = headers.map((h) => searchable(h ?? ""));
  const find = (cands: string[]) => {
    for (const c of cands) { const i = keys.indexOf(searchable(c)); if (i >= 0) return i; }
    return null;
  };
  const name = find(HEADS.name);
  if (name == null) return null;
  return { name, agency: find(HEADS.agency), section: find(HEADS.section), barcode: find(HEADS.barcode) };
}

/** EAN-8 / UPC-A / EAN-13 / GTIN-14 — وغيرُه رمزٌ داخليّ للموزّع لا يُحفظ باركوداً. */
export function libraryBarcode(raw: string): string | null {
  const c = normalizeCode(raw ?? "");
  return /^\d{8,14}$/.test(c) ? c : null;
}

export type PlanStatus = "new" | "exists" | "dupInFile" | "noImage" | "noName";
export interface PlanItem {
  row: number; name: string; agency: string | null; section: string | null;
  barcode: string | null; droppedCode: string | null; image: string | null; status: PlanStatus;
}
export interface ImportPlan {
  items: PlanItem[];
  counts: Record<PlanStatus, number>;
  /** وكالةٌ ← عددُ ما يُضاف لها (null = بلا وكالة). */
  agencies: Map<string | null, number>;
  sections: Map<string | null, number>;
  droppedCodes: number;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/** الخطّة قبل أيّ رفع: ما يُضاف، وما موجودٌ أصلاً (بالشركة والصنف نفسيهما)، وما لا يُرفع ولماذا. */
export function planImport(
  sheet: ParsedSheet, cols: ColumnMap, ctx: { company: string; kind: string }, existing: LibraryImage[],
): ImportPlan {
  const cKey = groupKey(ctx.company), kKey = groupKey(ctx.kind);
  const here = existing.filter((r) => groupKey(r.company ?? "") === cKey && groupKey(r.kind ?? "") === kKey);
  /* الهويّة: الباركودُ نفسُه = المنتجُ نفسُه. والاسمُ وحده يكفي **حين لا يميّز باركودٌ بينهما** (طرفٌ بلا
   * رمز) — اسمان متطابقان برمزين مختلفين منتجان (حجمان مثلاً؛ بالملف صفّان كهذين). */
  type Seen = { codes: Set<string>; names: Map<string, Set<string>> };
  const mk = (): Seen => ({ codes: new Set(), names: new Map() });
  const add = (s: Seen, nk: string, ck: string) => {
    if (ck) s.codes.add(ck);
    const set = s.names.get(nk) ?? new Set<string>();
    set.add(ck);
    s.names.set(nk, set);
  };
  const hit = (s: Seen, nk: string, ck: string) => {
    if (ck && s.codes.has(ck)) return true;
    const set = s.names.get(nk);
    return !!set && (!ck || set.has(""));
  };
  const before = mk(), inFile = mk();
  // الاسمُ المحفوظُ يمرّ من `cleanLibName` كالآتي من الملف — صفٌّ قديمٌ بـ«&#8211;» نصّاً وصفٌّ جديدٌ بـ«–» منتجٌ واحد.
  for (const r of here) add(before, searchable(cleanLibName(r.name)), r.barcode ? matchCode(r.barcode) : "");
  const items: PlanItem[] = [];
  const counts: Record<PlanStatus, number> = { new: 0, exists: 0, dupInFile: 0, noImage: 0, noName: 0 };
  const agencies = new Map<string | null, number>(), sections = new Map<string | null, number>();
  let droppedCodes = 0;
  for (const r of sheet.rows) {
    const cell = (i: number | null) => (i == null ? "" : (r.cells[i] ?? "").trim());
    // ترميزُ HTML المضاعَف بجداول الموزّعين («&#8211;» نصّاً) يُفكّ قبل كلّ شيء (cleanLibName).
    const name = clip(cleanLibName(cell(cols.name)), 120);
    const agency = clip(cleanLibName(cell(cols.agency)), 80) || null;
    const section = clip(cleanLibName(cell(cols.section)), 80) || null;
    const rawCode = cell(cols.barcode);
    const barcode = libraryBarcode(rawCode);
    const droppedCode = !barcode && rawCode ? rawCode : null;
    if (droppedCode) droppedCodes++;
    const nk = searchable(name), ck = barcode ? matchCode(barcode) : "";
    let status: PlanStatus = "new";
    if (!name) status = "noName";
    else if (!r.image) status = "noImage";
    else if (hit(before, nk, ck)) status = "exists";
    else if (hit(inFile, nk, ck)) status = "dupInFile";
    if (status === "new") {
      add(inFile, nk, ck);
      agencies.set(agency, (agencies.get(agency) ?? 0) + 1);
      sections.set(section, (sections.get(section) ?? 0) + 1);
    }
    counts[status]++;
    items.push({ row: r.row, name, agency, section, barcode, droppedCode, image: r.image, status });
  }
  return { items, counts, agencies, sections, droppedCodes };
}

/** نوعُ الصورة من امتدادها — لـFile قبل إعادة الترميز. */
export function mediaType(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return ext === "png" ? "image/png" : ext === "gif" ? "image/gif" : ext === "webp" ? "image/webp" : ext === "bmp" ? "image/bmp" : "image/jpeg";
}
