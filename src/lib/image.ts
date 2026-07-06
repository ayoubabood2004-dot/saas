// Client-side image preparation for the media vault. Images are downscaled and
// re-encoded to JPEG (Canvas API, no dependency) so uploads stay small and the
// UI stays fast even with many photos. Non-images (e.g. PDF lab reports) pass
// through untouched.

export interface PreparedUpload {
  /** Bytes to upload to storage. */
  blob: Blob;
  /** Inline data URL — used by demo mode (no object storage) and for instant preview. */
  dataUrl: string;
  /** File extension for the storage object name. */
  ext: string;
  contentType: string;
}

/** Thrown when the original file is larger than the hard input cap. */
export class FileTooLargeError extends Error {
  constructor(public readonly maxMb: number) {
    super(`File exceeds ${maxMb} MB`);
    this.name = "FileTooLargeError";
  }
}

const MAX_INPUT_BYTES = 25 * 1024 * 1024; // reject originals over 25 MB before touching the canvas
export const MAX_INPUT_MB = Math.round(MAX_INPUT_BYTES / 1024 / 1024);

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("The file could not be read as an image"));
    img.src = src;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Image compression failed"))), type, quality);
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  // Preferred path: FileReader. Some restricted mobile webviews don't expose it
  // ("Can't find variable: FileReader"), so fall back to ArrayBuffer + base64,
  // which avoids the FileReader global entirely.
  if (typeof FileReader !== "undefined") {
    try {
      return await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error ?? new Error("The file could not be encoded"));
        r.readAsDataURL(blob);
      });
    } catch {
      /* fall through to the manual encoder */
    }
  }
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const CHUNK = 0x8000; // chunk to avoid call-stack limits on large buffers
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  if (typeof btoa === "undefined") throw new Error("This browser cannot encode files");
  return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
}

/**
 * Prepare a file for the media vault.
 * @param file the user-selected file
 * @param opts.maxDim longest edge in px after downscale (default 1600)
 * @param opts.quality JPEG quality 0–1 (default 0.72)
 */
export async function prepareUpload(
  file: File,
  opts: { maxDim?: number; quality?: number } = {},
): Promise<PreparedUpload> {
  // Guard against any non-browser context (defensive — this is a client-only SPA).
  if (typeof window === "undefined" || typeof document === "undefined") {
    throw new Error("Image processing is only available in the browser");
  }
  if (file.size > MAX_INPUT_BYTES) throw new FileTooLargeError(MAX_INPUT_MB);

  // Non-images (PDF lab reports, etc.) are uploaded as-is.
  if (!file.type.startsWith("image/")) {
    const dataUrl = await blobToDataUrl(file);
    const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
    return { blob: file, dataUrl, ext: ext || "bin", contentType: file.type || "application/octet-stream" };
  }

  const maxDim = opts.maxDim ?? 1600;
  const quality = opts.quality ?? 0.72;
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await loadImage(objectUrl);
    // Decompression-bomb guard: a tiny highly-compressible file can decode to a
    // gigapixel bitmap and OOM/hang the tab. Reject anything above 40 megapixels
    // before we ever draw it (a real clinic photo is well under that).
    if ((img.width * img.height) > 40_000_000) throw new FileTooLargeError(MAX_INPUT_MB);
    const longest = Math.max(img.width, img.height) || 1;
    const scale = Math.min(1, maxDim / longest);
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not supported in this browser");
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await canvasToBlob(canvas, "image/jpeg", quality);
    const dataUrl = await blobToDataUrl(blob);
    return { blob, dataUrl, ext: "jpg", contentType: "image/jpeg" };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
