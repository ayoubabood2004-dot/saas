/* ============================================================================
 * راجيتةُ العيادة (0261) — بابٌ واحد للسحابة وللتجريبيّ. خارج repo.ts (حزمةُ الإقلاع وفسحتُها بضعُ مئات بايت).
 *
 * العقد:
 *  • القراءةُ ترمي عند أيّ فشل — لا «ماكو راجيتات» ولا «ماكو خطة» عن خطأ (قائمةٌ ناقصة أخطرُ من خطأ ظاهر).
 *  • جدولٌ غائب (واجهةٌ سبقت هجرتها: 42P01/PGRST205) يُرمى `rx_missing` — الشاشةُ تطبع بالتصميم الافتراضيّ وتُخفي
 *    السجلّ والحفظ بصمت، لا «تعذّر» دائم.
 *  • الكتابةُ تُسمع: التصميمُ بشرط «كما فُتح» (updated_at يختمه الخادم) ⇒ `rx_stale`، لا دوسٌ صامت؛ والإلغاءُ صفرُ
 *    صفوفٍ ⇒ `rx_stale` كذلك (أُلغيت من جهازٍ ثانٍ). ورفضُ المحفّز (تجميد/مدير) يصل برسالته وhint الخادم.
 *  • «القراءة فقط» (اشتراكٌ منتهٍ) يمنع الكتابةَ بخطأ repo نفسِه (ReadOnlyError).
 *  • الصورُ ملفّاتٌ بالدلو بمجلّد العيادة **كما يؤكّدها الخادم** (my_workspace — لا مفتاحُ العيادة المحلّيّ).
 * ========================================================================= */
import { supabase } from "./supabase";
import { isConfigReadOnly } from "./clinicSync";
import { assertUploadableImage } from "./repo";
import type { PreparedUpload } from "./image";
import { cleanLine, cleanRxBody, cleanRxFields, cleanRxPad, type RxFields, type RxPadConfig } from "./rxLayout";

export interface RxPadRow { cfg: RxPadConfig; updated_at: string }
export interface RxRecord {
  id: string;
  pet_id: string;
  visit_id: string | null;
  author_id: string | null;
  doctor_name: string;
  pet_name: string;
  fields: RxFields;
  body: string;
  issued_at: string;
  voided_at: string | null;
  void_reason: string | null;
}
export interface RxNew { pet_id: string; visit_id?: string | null; pet_name: string; doctor_name: string; fields: RxFields; body: string }
export interface RxNote { note_text: string; created_at: string }
/** سقفُ قراءة الملاحظات المنظّمة: بلا خطةٍ فيها وقد بلغته ⇒ «تعذّر» لا «ماكو» (قائمةٌ ناقصة لا تُصدَّق). */
export const RX_NOTES_LIMIT = 200;

export interface RxApi {
  /** تصميمُ العيادة، أو null (لم يُحفظ بعد ⇒ الافتراضيّ). */
  getPad(): Promise<RxPadRow | null>;
  /** `expect`: updated_at كما فُتح، أو null لأوّل حفظ. */
  savePad(cfg: RxPadConfig, expect: string | null): Promise<RxPadRow>;
  listForPet(petId: string): Promise<RxRecord[]>;
  add(r: RxNew): Promise<RxRecord>;
  voidRx(id: string, reason: string): Promise<RxRecord>;
  uploadImage(kind: "bg" | "emblem", up: PreparedUpload): Promise<string>;
  /** ملاحظاتُ الحيوان السريرية (CLINRX1) قراءةً طازجة ترمي — «من خطة العلاج» لا تقول «ماكو» عن فشل. */
  notes(petId: string): Promise<RxNote[]>;
}

type PgErr = { message: string; code?: string; details?: string; hint?: string };
const serverError = (e: PgErr) => Object.assign(new Error(e.message), { code: e.code, details: e.details, hint: e.hint });
export const rxStale = () => Object.assign(new Error("rx_stale"), { code: "rx_stale" });
export const rxMissing = () => Object.assign(new Error("rx_missing"), { code: "rx_missing" });
const MISSING = new Set(["42P01", "PGRST205", "PGRST202"]);
/** خطأُ الخادم مترجَماً: جدولٌ غائب ⇒ rx_missing، وغيرُه كما هو برمزه وhint. */
const fail = (e: PgErr) => (MISSING.has(e.code ?? "") ? rxMissing() : serverError(e));
export const isRxMissing = (e: unknown) => (e as { code?: string } | null)?.code === "rx_missing";
export const isRxStale = (e: unknown) => (e as { code?: string } | null)?.code === "rx_stale";

function writable(): void {
  if (isConfigReadOnly()) throw Object.assign(new Error("READ_ONLY"), { name: "ReadOnlyError" });
}

const COLS = "id,pet_id,visit_id,author_id,doctor_name,pet_name,fields,body,issued_at,voided_at,void_reason";
export function readRx(r: Record<string, unknown>): RxRecord {
  return {
    id: String(r.id),
    pet_id: String(r.pet_id),
    visit_id: typeof r.visit_id === "string" ? r.visit_id : null,
    author_id: typeof r.author_id === "string" ? r.author_id : null,
    doctor_name: typeof r.doctor_name === "string" ? r.doctor_name : "",
    pet_name: typeof r.pet_name === "string" ? r.pet_name : "",
    fields: cleanRxFields(r.fields),
    body: typeof r.body === "string" ? r.body : "",
    issued_at: String(r.issued_at ?? ""),
    voided_at: typeof r.voided_at === "string" ? r.voided_at : null,
    void_reason: typeof r.void_reason === "string" ? r.void_reason : null,
  };
}
/** ما يُرسل للإدخال: منظَّفاً كما يقبله القيد (النصُّ ١–٨٠٠٠، الأسماءُ ≤ ١٢٠). */
export function rxInsertRow(r: RxNew) {
  return {
    pet_id: r.pet_id,
    visit_id: r.visit_id ?? null,
    pet_name: cleanLine(r.pet_name, 120) || null,
    doctor_name: cleanLine(r.doctor_name, 120) || null,
    fields: cleanRxFields(r.fields),
    body: cleanRxBody(r.body),
  };
}
const MIME_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

const cloud: RxApi = {
  async getPad() {
    const { data, error } = await supabase!.from("clinic_rx_pad").select("config,updated_at").limit(1);
    if (error) throw fail(error);
    const row = (data ?? [])[0] as { config?: unknown; updated_at?: string } | undefined;
    return row ? { cfg: cleanRxPad(row.config), updated_at: String(row.updated_at) } : null;
  },
  async savePad(cfg, expect) {
    writable();
    const config = cleanRxPad(cfg);
    const res = expect === null
      ? await supabase!.from("clinic_rx_pad").insert({ config }).select("config,updated_at")
      : await supabase!.from("clinic_rx_pad").update({ config }).eq("updated_at", expect).select("config,updated_at");
    if (res.error) {
      if (res.error.code === "23505") throw rxStale();
      throw fail(res.error);
    }
    const row = (res.data ?? [])[0] as { config?: unknown; updated_at?: string } | undefined;
    if (!row) throw rxStale();
    return { cfg: cleanRxPad(row.config), updated_at: String(row.updated_at) };
  },
  async listForPet(petId) {
    const { data, error } = await supabase!.from("pet_prescriptions").select(COLS).eq("pet_id", petId).order("issued_at", { ascending: false }).limit(200);
    if (error) throw fail(error);
    return (data ?? []).map((r) => readRx(r as Record<string, unknown>));
  },
  async add(r) {
    writable();
    const { data, error } = await supabase!.from("pet_prescriptions").insert(rxInsertRow(r)).select(COLS).single();
    if (error) throw fail(error);
    return readRx(data as Record<string, unknown>);
  },
  async voidRx(id, reason) {
    writable();
    const { data, error } = await supabase!.from("pet_prescriptions")
      .update({ voided_at: new Date().toISOString(), void_reason: cleanLine(reason, 200) || null })
      .eq("id", id).is("voided_at", null).select(COLS);
    if (error) throw fail(error);
    if (!data || data.length === 0) throw rxStale();
    return readRx(data[0] as Record<string, unknown>);
  },
  async uploadImage(kind, up) {
    writable();
    assertUploadableImage(up);
    /* مجلّدُ الدلو = auth_clinic() (سياسةُ 0174) — يُسأل الخادمُ لا المفتاحُ المحلّيّ ("default" للمالك، وعيادةٌ أخرى
       للمشغّل الداخل: درسُ ١٣/١٠). */
    const ws = await supabase!.rpc("my_workspace");
    if (ws.error) throw serverError(ws.error);
    const clinic = (ws.data as { clinic_id?: string | null } | null)?.clinic_id;
    if (!clinic) throw new Error("no_clinic_for_image");
    const type = (up.contentType || up.blob.type || "").toLowerCase();
    const path = `${clinic}/rx-${kind}-${Date.now().toString(36)}.${MIME_EXT[type] ?? "jpg"}`;
    const res = await supabase!.storage.from("product-images").upload(path, up.blob, { contentType: type || "image/jpeg", cacheControl: "31536000", upsert: false });
    if (res.error) throw res.error;
    return path;
  },
  async notes(petId) {
    /* علامةُ الملاحظة المنظّمة محاطةٌ بمحرفَي تحكّم (\x01CLINRX1\x01، clinicalRecord.ts) — و`_` بـlike محرفٌ واحدٌ أيّاً كان،
       فالنمطُ يطابقها بلا محارف تحكّمٍ بالرابط. `CLINRX1%` وحدَه لا يطابق أيَّ خطةٍ أبداً («ماكو خطة» عن كلّ حيوان). */
    const { data, error } = await supabase!.from("pet_notes").select("note_text,created_at").eq("pet_id", petId)
      .like("note_text", "_CLINRX1_%").order("created_at", { ascending: false }).limit(RX_NOTES_LIMIT);
    if (error) throw serverError(error);
    return (data ?? []) as RxNote[];
  },
};

/* التجريبيّ: نفسُ العقد على localStorage، كسولٌ من باب repoDemo وحده (demoRx.ts). */
const local = () => import("./repoDemo").then((m) => m.loadDemoRx());
const demo: RxApi = {
  getPad: async () => (await local()).demoRxGetPad(),
  savePad: async (cfg, e) => { writable(); return (await local()).demoRxSavePad(cfg, e); },
  listForPet: async (id) => (await local()).demoRxList(id),
  add: async (r) => { writable(); return (await local()).demoRxAdd(r); },
  voidRx: async (id, reason) => { writable(); return (await local()).demoRxVoid(id, reason); },
  uploadImage: async (kind, up) => { writable(); return (await local()).demoRxUpload(kind, up); },
  notes: async (id) => (await local()).demoRxNotes(id),
};

export const rxApi: RxApi = supabase ? cloud : demo;
