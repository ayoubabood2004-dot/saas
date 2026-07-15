// ============================================================================
// Anatomy figure — a DETAILED, semi-realistic side-profile animal drawn with
// clear "ink" outlines, defined muscle contours, jointed legs with rounded
// paws and breed-correct heads. AnatomyMap draws the `body` art once, then
// overlays the transparent, clickable `zones` (one per scientific region) that
// highlight on hover / selection. Facing right, 300×230.
// ============================================================================
import type { Species } from "@/types";

export interface Zone { id: string; d: string }
export interface Figure { body: string; zones: Zone[] }

// ---- Clickable anatomical zones over the shared quadruped (300×230) ----------
const QUAD_ZONES: Zone[] = [
  { id: "spine",   d: "M64 100 Q120 84 196 92 L194 106 Q120 96 66 118 Z" },
  { id: "pelvis",  d: "M58 108 Q56 130 66 148 Q86 156 104 152 L104 96 Q80 90 60 106 Z" },
  { id: "abdomen", d: "M104 96 L150 92 L150 152 Q126 156 104 152 Z" },
  { id: "thorax",  d: "M150 92 L196 92 L200 128 Q176 152 150 152 Z" },
  { id: "neck",    d: "M196 92 Q212 92 212 108 Q210 122 200 128 L196 124 Z" },
  { id: "head",    d: "M198 96 C196 82 206 74 220 76 C236 78 244 90 242 104 Q242 118 232 124 Q214 128 202 120 Q196 110 198 96 Z" },
  { id: "oral",    d: "M240 104 C252 104 268 108 268 112 C266 120 252 123 244 119 C240 116 239 110 240 104 Z" },
  { id: "foreleg", d: "M178 146 L198 146 L197 206 Q196 210 188 210 Q179 210 179 205 Z" },
  { id: "hindleg", d: "M88 138 L124 146 L116 204 Q110 210 100 208 Q86 200 88 180 Q82 160 88 138 Z" },
];

// Ear designs keyed by silhouette; each returns coloured SVG with an ink outline.
type EarType = "floppy" | "erect" | "cat" | "tall" | "horse";

interface Kit {
  ink: string; coat: string; shade: string; belly: string; inner: string;
  muzzle: string; nose: string; ear: EarType;
  tail: string; marking?: string; mane?: string;
  hoof?: string; muzzleLen?: number; extras?: string;
}

function earArt(type: EarType, k: Kit): string {
  const ink = k.ink;
  if (type === "erect")
    return `<path d="M214 92 C208 72 213 54 222 54 C231 58 231 80 228 96 Z" fill="${k.coat}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/><path d="M218 88 C215 72 219 60 224 62 C228 68 226 82 225 92 Z" fill="${k.inner}" opacity="0.85"/>`;
  if (type === "cat")
    return `<path d="M212 90 C206 68 210 52 220 52 C226 60 228 76 226 92 Z" fill="${k.coat}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/><path d="M215 86 C212 70 215 60 220 62 C223 68 223 78 222 88 Z" fill="${k.inner}"/><path d="M226 92 C232 74 236 62 244 64 C248 72 246 86 240 96 Z" fill="${k.coat}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/>`;
  if (type === "tall")
    return `<path d="M210 92 C198 54 204 30 216 30 C226 34 226 70 224 96 Z" fill="${k.coat}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/><path d="M214 88 C208 56 212 42 217 44 C222 50 220 74 219 90 Z" fill="${k.inner}"/>`;
  if (type === "horse")
    return `<path d="M212 90 C208 66 214 52 222 54 C228 62 226 80 224 94 Z" fill="${k.coat}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/><path d="M216 86 C214 68 218 60 222 62 C224 70 223 80 222 88 Z" fill="${k.inner}"/>`;
  // floppy (dog / cow)
  return `<path d="M206 90 C190 88 184 106 190 124 C198 138 214 132 216 116 C217 104 214 94 206 90 Z" fill="${k.coat}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"/><path d="M203 100 C196 102 194 114 198 122 C205 128 210 120 210 112 C210 106 208 100 203 100 Z" fill="${k.inner}" opacity="0.8"/>`;
}

// A detailed quadruped built from a per-species kit: ink-outlined body, jointed
// legs, breed head. Nothing is gradient-shaded — flat fills with a single ink line.
function quadBody(k: Kit): string {
  const ink = k.ink;
  const ml = k.muzzleLen ?? 0;
  const s: string[] = [];
  s.push(`<ellipse cx="150" cy="212" rx="108" ry="9" fill="#1e293b" opacity="0.10"/>`);
  // far legs (behind, darker) tucked under the belly
  s.push(`<g fill="${k.shade}" stroke="${ink}" stroke-width="2" stroke-linejoin="round"><path d="M172 142 C170 162 170 182 171 197 C171 203 174 206 179 206 C184 206 186 202 186 197 C187 180 188 160 190 142 Z"/><path d="M104 142 C101 160 100 180 102 196 C102 202 105 205 110 205 C115 205 117 201 116 196 C115 179 116 159 118 142 Z"/></g>`);
  if (k.hoof) s.push(`<g fill="${k.hoof}" stroke="${ink}" stroke-width="1.6"><rect x="170" y="200" width="18" height="8" rx="2"/><rect x="102" y="199" width="17" height="8" rx="2"/></g>`);
  s.push(k.tail);
  // body silhouette (back, croup, tucked flank, deep chest, neck)
  s.push(`<path d="M196 96 C206 92 214 92 220 96 C214 84 202 84 196 88 C190 78 176 82 168 88 C150 84 120 84 96 90 C78 94 64 96 60 108 C56 120 58 132 66 142 C74 150 88 152 104 152 C104 158 96 160 92 150 C104 156 128 156 150 150 C150 156 166 158 176 150 C186 146 194 136 198 124 C204 122 210 116 210 108 C208 102 202 98 196 96 Z" fill="${k.coat}" stroke="${ink}" stroke-width="2.6" stroke-linejoin="round"/>`);
  // lighter chest / belly
  s.push(`<path d="M104 138 C130 148 160 148 190 134 C188 148 172 156 150 156 C126 156 108 152 100 146 Z" fill="${k.belly}" opacity="0.85"/>`);
  s.push(k.marking ?? "");
  // near legs: front column + hind haunch
  s.push(`<g fill="${k.coat}" stroke="${ink}" stroke-width="2.4" stroke-linejoin="round"><path d="M180 146 C179 165 178 183 179 199 C179 205 182 208 188 208 C194 208 196 204 195 199 C194 182 195 164 197 146 Z"/><path d="M90 138 C82 150 82 168 90 180 C86 188 87 198 94 205 C100 210 110 209 114 203 C116 198 113 194 108 193 C112 178 117 160 122 146 C114 138 100 134 90 138 Z"/></g>`);
  if (k.hoof) s.push(`<g fill="${k.hoof}" stroke="${ink}" stroke-width="1.8"><rect x="178" y="202" width="18" height="9" rx="2"/><rect x="92" y="200" width="24" height="9" rx="2"/></g>`);
  else s.push(`<g stroke="${ink}" stroke-width="1.3" fill="none" stroke-linecap="round"><path d="M185 208 L185 202 M191 208 L191 202"/><path d="M98 205 L98 199 M105 205 L105 199"/></g>`);
  // muscle / topography contours
  s.push(`<g stroke="${ink}" stroke-width="1.5" stroke-opacity="0.42" fill="none" stroke-linecap="round"><path d="M188 102 C184 118 183 134 186 146"/><path d="M96 96 C90 112 91 130 100 144"/><path d="M108 130 C130 138 156 138 182 128"/></g>`);
  s.push(k.mane ?? "");
  // head: ear, skull + cheek, muzzle, eye, nose, mouth
  s.push(earArt(k.ear, k));
  s.push(`<path d="M198 96 C196 82 206 74 220 76 C236 78 244 90 242 104 C${258 + ml} 106 ${268 + ml} 110 ${268 + ml} 112 C${266 + ml} 122 250 124 240 118 C238 128 226 130 214 126 C202 122 196 110 198 96 Z" fill="${k.coat}" stroke="${ink}" stroke-width="2.6" stroke-linejoin="round"/>`);
  s.push(`<path d="M240 104 C252 104 ${262 + ml} 108 ${268 + ml} 112 C${266 + ml} 118 256 120 246 116 C242 114 240 108 240 104 Z" fill="${k.muzzle}" opacity="0.5"/>`);
  s.push(`<path d="M224 92 C230 90 236 92 239 96" stroke="${ink}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`);
  s.push(`<ellipse cx="230" cy="99" rx="4" ry="4.6" fill="#241a12"/><circle cx="231.4" cy="97.2" r="1.4" fill="#fff"/>`);
  s.push(`<ellipse cx="${265 + ml}" cy="112" rx="5.6" ry="4.6" fill="${k.nose}"/><ellipse cx="${263 + ml}" cy="110.6" rx="1.5" ry="1.1" fill="#fff" opacity="0.35"/>`);
  s.push(`<path d="M${262 + ml} 118 C256 124 248 124 243 120 C241 126 232 127 227 123" stroke="${ink}" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);
  s.push(k.extras ?? "");
  return s.join("");
}

export function figureFor(species: Species): Figure {
  switch (species) {
    case "dog":
      return { zones: QUAD_ZONES, body: quadBody({
        ink: "#4a3320", coat: "#e0a15a", shade: "#c98a45", belly: "#f6e2c0", inner: "#8a5a34",
        muzzle: "#4a3626", nose: "#1c1712", ear: "floppy",
        tail: `<path d="M64 106 C44 104 30 120 26 144 C24 160 32 172 44 172 C40 158 42 140 56 130 C64 124 70 116 72 110 Z" fill="#e0a15a" stroke="#4a3320" stroke-width="2.4" stroke-linejoin="round"/>`,
        marking: `<path d="M96 90 C120 84 152 84 180 90 C190 100 190 122 182 138 C158 146 120 146 94 140 C86 120 88 100 96 90 Z" fill="#4a3626"/>`,
      }) };
    case "cat":
      return { zones: QUAD_ZONES, body: quadBody({
        ink: "#5a4a3a", coat: "#efa44e", shade: "#d8892f", belly: "#fbe7c4", inner: "#f2c9a0",
        muzzle: "#8a5a2c", nose: "#e07b7b", ear: "cat",
        tail: `<path d="M62 118 C40 116 30 138 32 158 C33 170 44 172 48 164 C44 152 50 138 62 132 C70 128 72 120 70 114 Z" fill="#efa44e" stroke="#5a4a3a" stroke-width="2.4" stroke-linejoin="round"/>`,
        marking: `<g stroke="#c9791f" stroke-width="4.5" fill="none" stroke-linecap="round" stroke-opacity="0.85"><path d="M104 92 C102 108 102 128 106 142"/><path d="M124 90 C122 108 122 130 126 146"/><path d="M144 90 C142 110 142 132 146 150"/><path d="M168 96 C168 112 168 130 172 144"/></g>`,
      }) };
    case "horse":
      return { zones: QUAD_ZONES, body: quadBody({
        ink: "#3a2a1c", coat: "#a4693a", shade: "#8a5730", belly: "#c08a54", inner: "#5e3718",
        muzzle: "#5e3718", nose: "#2b241c", ear: "horse", hoof: "#2f261c", muzzleLen: 10,
        tail: `<path d="M62 104 C42 108 34 130 32 170 C31 186 42 188 48 178 C44 158 52 138 64 126 C70 120 70 110 68 104 Z" fill="#2b1c10" stroke="#3a2a1c" stroke-width="2.2" stroke-linejoin="round"/>`,
        mane: `<path d="M198 92 C212 68 226 56 233 60 C229 76 219 92 210 104 C206 100 202 96 198 92 Z" fill="#2b1c10" stroke="#3a2a1c" stroke-width="1.6" stroke-linejoin="round"/><path d="M224 60 C222 50 228 46 232 50 C232 58 229 62 227 66 Z" fill="#2b1c10" stroke="#3a2a1c" stroke-width="1.4" stroke-linejoin="round"/>`,
      }) };
    case "cow":
      return { zones: QUAD_ZONES, body: quadBody({
        ink: "#4a4640", coat: "#f4f5f7", shade: "#dfe3ea", belly: "#ffffff", inner: "#e6b8b8",
        muzzle: "#f0c9c0", nose: "#d99a9a", ear: "floppy", hoof: "#5b5550",
        tail: `<path d="M66 108 C48 106 40 130 40 152 C40 168 50 168 54 158 C50 140 60 130 70 124 Z" fill="#f4f5f7" stroke="#4a4640" stroke-width="2.2" stroke-linejoin="round"/><path d="M50 158 C46 172 54 178 60 170 C60 162 56 158 50 158 Z" fill="#3b3f46"/>`,
        marking: `<path d="M100 92 C122 86 146 90 150 112 C150 132 130 140 108 138 C90 134 88 100 100 92 Z" fill="#3b3f46"/><ellipse cx="172" cy="116" rx="14" ry="12" fill="#3b3f46"/><ellipse cx="128" cy="152" rx="14" ry="8" fill="#f0c9c0"/>`,
        extras: `<path d="M226 78 C220 66 224 58 232 60 C236 68 234 78 230 86 Z" fill="#e6dcc4" stroke="#4a4640" stroke-width="1.6" stroke-linejoin="round"/><path d="M238 80 C236 66 242 60 248 64 C248 74 244 82 240 88 Z" fill="#e6dcc4" stroke="#4a4640" stroke-width="1.6" stroke-linejoin="round"/>`,
      }) };
    case "rabbit":
      return { zones: QUAD_ZONES, body: quadBody({
        ink: "#6b5f52", coat: "#d9d2c6", shade: "#c2bab0", belly: "#f6f3ec", inner: "#efd6d6",
        muzzle: "#b9aa9a", nose: "#d98a8a", ear: "tall",
        tail: `<circle cx="60" cy="146" r="16" fill="#f6f3ec" stroke="#6b5f52" stroke-width="2.2"/>`,
      }) };
    case "bird":
      return { zones: BIRD_ZONES, body: birdBody() };
    default:
      return { zones: QUAD_ZONES, body: quadBody({
        ink: "#5a4a36", coat: "#cdae82", shade: "#b3946a", belly: "#eaddc4", inner: "#a98a5a",
        muzzle: "#8a6f4a", nose: "#2b2b2b", ear: "floppy",
        tail: `<path d="M64 106 C44 104 30 120 26 144 C24 160 32 172 44 172 C40 158 42 140 56 130 C64 124 70 116 72 110 Z" fill="#cdae82" stroke="#5a4a36" stroke-width="2.4" stroke-linejoin="round"/>`,
      }) };
  }
}

// ---- Bird — a plump songbird with outlined body, wing, beak, crest, legs ------
const BIRD_ZONES: Zone[] = [
  { id: "head",    d: "M188 74 C186 52 200 44 214 48 C230 52 232 74 224 88 C214 98 196 92 188 74 Z" },
  { id: "beak",    d: "M228 70 L264 80 L230 90 Z" },
  { id: "neck",    d: "M186 88 Q182 104 194 118 L206 110 Q198 98 194 90 Z" },
  { id: "spine",   d: "M96 100 Q150 82 190 92 L186 106 Q150 94 100 114 Z" },
  { id: "thorax",  d: "M150 108 C182 104 190 128 186 146 Q168 150 150 148 Q148 128 150 108 Z" },
  { id: "wing",    d: "M96 106 C140 98 176 118 176 124 C150 150 108 142 98 132 C88 124 90 112 96 106 Z" },
  { id: "abdomen", d: "M104 136 Q140 152 172 144 Q164 166 128 166 Q104 158 104 136 Z" },
  { id: "hindleg", d: "M134 156 L134 190 M127 191 L142 191 M156 154 L156 190 M149 191 L164 191" },
];

function birdBody(): string {
  const ink = "#2f5a34";
  return `
  <ellipse cx="150" cy="204" rx="86" ry="8" fill="#1e293b" opacity="0.10"/>
  <g stroke="#e0961c" stroke-width="4.5" stroke-linecap="round" fill="none"><path d="M134 158 L134 190 M127 192 L142 192"/><path d="M156 156 L156 190 M149 192 L164 192"/></g>
  <path d="M92 118 C66 110 50 120 46 124 C64 130 84 130 96 128 Z" fill="#3f9e50" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/>
  <path d="M186 92 C226 96 234 120 232 138 C230 166 190 174 150 172 C110 170 90 150 88 128 C86 104 118 84 150 84 C168 84 178 88 186 92 Z" fill="#57bd67" stroke="${ink}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M150 108 C182 104 190 128 186 146 C180 164 144 162 132 156 C126 136 134 116 150 108 Z" fill="#d8f0d8"/>
  <path d="M96 106 C140 98 176 118 176 124 C150 150 108 142 98 132 C88 124 90 112 96 106 Z" fill="#3f9e50" stroke="${ink}" stroke-width="2.2" stroke-linejoin="round"/>
  <g stroke="#2f7d3c" stroke-width="1.5" stroke-opacity="0.6" fill="none"><path d="M110 112 C138 118 158 128 168 124"/><path d="M104 122 C130 128 150 136 160 134"/></g>
  <path d="M188 74 C186 52 200 44 214 48 C230 52 232 74 224 88 C214 98 196 92 188 74 Z" fill="#57bd67" stroke="${ink}" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M206 52 C202 32 212 26 220 30 C224 40 218 52 214 58 Z" fill="#f2c53d" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/>
  <path d="M228 70 L264 80 L230 90 C226 84 226 76 228 70 Z" fill="#e7a11e" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>
  <path d="M245 80 L232 82" stroke="${ink}" stroke-width="1.3"/>
  <circle cx="212" cy="70" r="4.6" fill="#20160f"/><circle cx="213.6" cy="68.2" r="1.5" fill="#fff"/>`;
}
