/**
 * مولّد ZIP صغير (بلا ضغط) — لسبب واحد مهم: المتصفح ما يكدر ينزّل ملفاً
 * "قابلاً للتنفيذ". ملف .command على الماك ينزل بلا صلاحية تشغيل، فالدبل-كلك
 * يفتحه بمحرر نصوص بدل ما يشغّله. داخل ZIP نكدر نخزن صلاحيات يونكس (0755)،
 * وFinder يحافظ عليها عند فك الضغط — فيصير التشغيل بدبل-كلك فعلاً.
 *
 * طريقة التخزين "store" (بلا ضغط) لأن الملفات صغيرة، وهيك نتجنب أي اعتماد.
 */

export type ZipEntry = {
  /** اسم الملف داخل الأرشيف (UTF-8 مسموح). */
  name: string;
  content: string;
  /** يُخزَّن بصلاحية 0755 بدل 0644 — ضروري لملفات .command و .sh. */
  executable?: boolean;
};

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** كاتب بايتات صغير — little-endian كما يفرض تنسيق ZIP. */
class Writer {
  private parts: Uint8Array[] = [];
  length = 0;
  push(b: Uint8Array) { this.parts.push(b); this.length += b.length; }
  u16(v: number) { const b = new Uint8Array(2); b[0] = v & 0xff; b[1] = (v >>> 8) & 0xff; this.push(b); }
  u32(v: number) {
    const b = new Uint8Array(4);
    b[0] = v & 0xff; b[1] = (v >>> 8) & 0xff; b[2] = (v >>> 16) & 0xff; b[3] = (v >>> 24) & 0xff;
    this.push(b);
  }
  join(): Uint8Array<ArrayBuffer> {
    const out = new Uint8Array(new ArrayBuffer(this.length));
    let at = 0;
    for (const p of this.parts) { out.set(p, at); at += p.length; }
    return out;
  }
}

/** ختم وقت DOS: ثانيتان لكل وحدة، والسنة من ١٩٨٠. */
function dosStamp(d: Date) {
  return {
    time: ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31),
    date: ((Math.max(0, d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31),
  };
}

export function makeZip(entries: ZipEntry[], now = new Date()): Blob {
  const enc = new TextEncoder();
  const { time, date } = dosStamp(now);
  const files = new Writer();
  const dir = new Writer();
  let count = 0;

  for (const e of entries) {
    const name = enc.encode(e.name);
    const body = enc.encode(e.content);
    const crc = crc32(body);
    const offset = files.length;

    // ترويسة الملف المحلي — العلم 0x0800 يعني أن الاسم UTF-8.
    files.u32(0x04034b50); files.u16(20); files.u16(0x0800); files.u16(0);
    files.u16(time); files.u16(date);
    files.u32(crc); files.u32(body.length); files.u32(body.length);
    files.u16(name.length); files.u16(0);
    files.push(name); files.push(body);

    // الفهرس المركزي — البايت الأعلى 3 يعني "يونكس"، فتُقرأ الصلاحيات أدناه.
    dir.u32(0x02014b50); dir.u16(0x031e); dir.u16(20); dir.u16(0x0800); dir.u16(0);
    dir.u16(time); dir.u16(date);
    dir.u32(crc); dir.u32(body.length); dir.u32(body.length);
    dir.u16(name.length); dir.u16(0); dir.u16(0);
    dir.u16(0); dir.u16(0);
    dir.u32(((e.executable ? 0o100755 : 0o100644) << 16) >>> 0);
    dir.u32(offset);
    dir.push(name);
    count += 1;
  }

  const out = new Writer();
  const filesBytes = files.join();
  const dirBytes = dir.join();
  out.push(filesBytes);
  out.push(dirBytes);
  out.u32(0x06054b50); out.u16(0); out.u16(0);
  out.u16(count); out.u16(count);
  out.u32(dirBytes.length); out.u32(filesBytes.length);
  out.u16(0);

  return new Blob([out.join()], { type: "application/zip" });
}
