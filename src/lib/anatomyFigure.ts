// ============================================================================
// Anatomy figure — ONE cohesive, breed-shaped animal whose interior is divided
// INTO beautifully coloured anatomical regions (a "real anatomy" map). The body
// is a single merged silhouette; the regions tile it and are separated by fine
// internal divider lines; a clean outer outline sits on top so it reads as one
// animal. Breed identity lives in the head, ears, tail and markings overlay.
// AnatomyMap draws `base`, then the clickable coloured `zones`, then `outline`,
// then the `overlay` detail. Facing right, 300×230.
// ============================================================================
import type { Species } from "@/types";

export interface Zone { id: string; d: string; color: string }
export interface Figure { base: string; zones: Zone[]; outline: string; overlay: string }

// ---- Shared anatomical region palette (distinct, harmonious, chart-like) -----
const RC: Record<string, string> = {
  spine: "#b7c6e6", pelvis: "#a3d5a5", abdomen: "#ffce8c", thorax: "#f2a1a1",
  neck: "#f6c69a", head: "#f2b483", oral: "#f8d9bd", foreleg: "#8fc9f2", hindleg: "#80ccc5",
};

// ---- Region tiles for the shared quadruped body (they TILE the silhouette) ----
const QUAD_REG: Record<string, string> = {
  spine:   "M60 100 Q110 84 198 92 L200 112 L64 112 Q58 106 60 100 Z",
  pelvis:  "M64 112 L104 112 L104 152 Q84 156 68 150 Q56 140 56 124 Q56 116 64 112 Z",
  abdomen: "M104 112 L150 112 L150 154 Q126 158 104 152 Z",
  thorax:  "M150 112 L200 112 Q208 120 206 132 Q204 146 196 152 Q172 156 150 154 Z",
  neck:    "M198 92 Q216 90 218 108 Q216 128 202 140 L198 150 Q196 130 197 112 Q197 100 198 92 Z",
  head:    "M212 96 Q210 74 234 72 Q256 74 256 100 Q256 120 240 128 Q220 130 212 118 Q208 108 212 96 Z",
  oral:    "M250 102 Q278 102 282 113 Q280 126 260 128 Q250 126 248 116 Q247 108 250 102 Z",
  foreleg: "M172 150 L200 150 L199 208 Q198 212 188 212 Q174 212 174 206 Z",
  hindleg: "M82 150 L116 150 L112 208 Q108 212 98 210 Q84 208 84 190 Q80 168 82 150 Z",
};
const QUAD_ORDER = ["spine", "pelvis", "abdomen", "thorax", "neck", "foreleg", "hindleg", "head", "oral"];

// Whole-animal outer silhouette for the shared quadruped.
const QUAD_SIL = "M282 113 Q258 98 234 72 Q212 78 212 92 Q206 90 198 92 Q110 84 60 100 Q54 116 56 128 Q60 146 84 150 L84 208 Q84 212 98 212 Q112 212 112 208 L112 152 Q140 158 174 152 L174 208 Q174 212 188 212 Q200 212 200 208 L200 150 Q208 138 210 120 Q212 112 216 108 Q252 118 260 128 Q272 122 282 113 Z";

const zonesFrom = (reg: Record<string, string>, order: string[]): Zone[] =>
  order.map((id) => ({ id, d: reg[id], color: RC[id] ?? "#d8dee6" }));

interface Kit {
  coat: string; ink: string;      // silhouette fill + outer outline colour
  tail: string; ears: string; face: string; feet: string;
  markings?: string; extras?: string;  // realistic coat details + horns/udder/mane
}

function quadFigure(k: Kit): Figure {
  const base = `
    <ellipse cx="150" cy="216" rx="104" ry="9" fill="#1e293b" opacity="0.10"/>
    <g fill="${k.coat}"><path d="M164 152 h20 v58 q0 4 -10 4 q-12 0 -12 -8 Z"/><path d="M96 152 h20 v58 q0 4 -10 4 q-16 0 -16 -12 Z"/></g>
    <path d="${QUAD_SIL}" fill="${k.coat}"/>
    ${k.markings ?? ""}
    ${k.tail}`;
  const outline = `<path d="${QUAD_SIL}" fill="none" stroke="${k.ink}" stroke-width="2.6" stroke-linejoin="round"/>`;
  const overlay = `${k.feet}${k.ears}${k.face}${k.extras ?? ""}`;
  return { base, zones: zonesFrom(QUAD_REG, QUAD_ORDER), outline, overlay };
}

// ---- Head / feature part builders -------------------------------------------
const eye = (color: string, slit = false) =>
  `<ellipse cx="240" cy="103" rx="5" ry="5.6" fill="${color}"/>` +
  (slit ? `<ellipse cx="240" cy="103" rx="1.6" ry="4.6" fill="#12210f"/>` : `<circle cx="240" cy="103" r="2.4" fill="#0e2136"/>`) +
  `<circle cx="241.6" cy="101.2" r="1.3" fill="#fff"/><path d="M233 97 C236 94 244 94 248 97" stroke="#4b3a2b" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
const nose = (color: string) =>
  `<ellipse cx="281" cy="115" rx="5.4" ry="4.4" fill="${color}"/><ellipse cx="279" cy="113.4" rx="1.4" ry="1" fill="#fff" opacity="0.45"/><path d="M277 122 C271 127 262 127 257 123" stroke="#5a4535" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
const whiteMuzzle = `<path d="M250 104 Q278 104 283 114 Q281 126 261 128 Q250 126 248 116 Z" fill="#f4f8fb"/>`;

const earTriangle = (coat: string, ink: string, inner: string) =>
  `<path d="M214 92 L210 56 L238 82 Z" fill="${coat}" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/><path d="M216 86 L215 66 L231 82 Z" fill="${inner}"/><path d="M234 84 L246 54 L260 80 Z" fill="${coat}" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/><path d="M238 80 L246 62 L255 78 Z" fill="${inner}"/>`;
const earPointy = (coat: string, ink: string, inner: string) =>
  `<path d="M214 94 L206 62 L236 84 Z" fill="${coat}" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/><path d="M217 88 L213 70 L230 84 Z" fill="${inner}"/><path d="M236 86 L250 60 L262 82 Z" fill="${coat}" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/><path d="M240 82 L249 66 L257 80 Z" fill="${inner}"/>`;
const earFloppy = (coat: string, ink: string, inner: string) =>
  `<path d="M214 92 C206 62 218 50 232 54 C240 66 236 92 226 104 C220 106 216 100 214 92 Z" fill="${coat}" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/><path d="M218 88 C214 66 222 58 230 62 C234 74 230 90 224 98 Z" fill="${inner}"/>`;
const earTall = (coat: string, ink: string, inner: string) =>
  `<path d="M214 92 C202 50 208 26 220 26 C230 30 230 68 228 96 Z" fill="${coat}" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/><path d="M218 88 C212 54 216 40 221 42 C226 48 224 74 223 90 Z" fill="${inner}"/><path d="M232 88 C224 52 232 34 242 36 C248 46 242 78 236 98 Z" fill="${coat}" stroke="${ink}" stroke-width="1.8" stroke-linejoin="round"/><path d="M235 84 C230 54 236 44 241 46 C244 54 240 76 237 88 Z" fill="${inner}"/>`;

const socks = (ink: string) =>
  `<path d="M174 196 h26 v10 q0 6 -12 6 q-14 0 -14 -8 Z" fill="#eef2f5"/><path d="M84 196 h30 v10 q0 6 -12 6 q-18 0 -18 -14 Z" fill="#eef2f5"/><g stroke="${ink}" stroke-width="1.2" fill="none" stroke-linecap="round"><path d="M182 212 v-6 M190 212 v-6 M96 214 v-6 M104 214 v-6"/></g>`;
const toes = (ink: string) =>
  `<g stroke="${ink}" stroke-width="1.3" fill="none" stroke-linecap="round"><path d="M182 212 v-7 M190 212 v-7 M96 214 v-7 M104 214 v-7"/></g>`;
const hooves = (ink: string) =>
  `<g fill="#2f261c" stroke="${ink}" stroke-width="1.2"><rect x="173" y="205" width="26" height="9" rx="2"/><rect x="84" y="205" width="30" height="9" rx="2"/></g>`;

export function figureFor(species: Species): Figure {
  switch (species) {
    case "dog": // Siberian Husky — grey/white, triangular ears, blue eye, mask, curled tail
      return quadFigure({
        coat: "#d3dbe1", ink: "#7f8c99",
        markings: `<path d="M60 100 Q110 84 198 92 Q207 96 203 120 Q150 128 96 126 Q64 124 58 116 Q56 108 60 100 Z" fill="#aab6c0"/><path d="M96 126 Q140 138 176 132 Q188 130 200 138 Q196 150 174 154 Q120 158 96 152 Z" fill="#f2f6f9"/><path d="M200 120 Q210 128 200 150 Q192 150 190 138 Q194 128 200 120 Z" fill="#f2f6f9"/>`,
        tail: `<path d="M62 102 C40 98 28 74 44 60 C57 49 73 56 70 70 C62 63 51 70 52 82 C53 95 60 101 70 106 Z" fill="#c3ccd4" stroke="#7f8c99" stroke-width="1.6" stroke-linejoin="round"/><path d="M44 60 C52 53 65 54 70 64 C61 61 53 65 50 74 Z" fill="#f2f6f9"/>`,
        ears: earTriangle("#c8d0d8", "#7f8c99", "#efe7de"),
        feet: socks("#8994a0"),
        face: `<path d="M232 94 C246 90 258 100 258 112 C242 120 224 122 214 116 C210 102 218 92 232 94 Z" fill="#6b7883" opacity="0.5"/>${whiteMuzzle}${nose("#20232a")}${eye("#4a90c2")}`,
      });
    case "cat": // orange tabby — pointy ears, green eye (slit), pink nose, up-curled tail
      return quadFigure({
        coat: "#e79a4a", ink: "#a06c34",
        markings: `<path d="M60 100 Q110 86 198 92 Q204 98 200 116 Q150 122 96 120 Q64 118 58 112 Q56 106 60 100 Z" fill="#d07f2c"/><path d="M96 126 Q140 138 176 132 Q186 148 150 154 Q118 156 96 150 Z" fill="#fbe7c4"/><g stroke="#c9791f" stroke-width="4" stroke-opacity="0.55" fill="none" stroke-linecap="round"><path d="M108 94 V120"/><path d="M128 92 V122"/><path d="M148 92 V122"/><path d="M170 96 V118"/></g>`,
        tail: `<path d="M62 104 C40 100 30 78 44 62 C58 50 74 58 70 72 C62 66 52 72 52 86 C53 100 60 106 70 110 Z" fill="#e79a4a" stroke="#a06c34" stroke-width="1.6" stroke-linejoin="round"/><g stroke="#c9791f" stroke-width="3.5" stroke-opacity="0.5" fill="none" stroke-linecap="round"><path d="M40 74 H56 M42 88 H58"/></g>`,
        ears: earPointy("#e79a4a", "#a06c34", "#f6c79b"),
        feet: toes("#a06c34"),
        face: `${nose("#e07b7b")}${eye("#7cae54", true)}<g stroke="#c98a44" stroke-width="1.2" fill="none" stroke-linecap="round" opacity="0.8"><path d="M258 116 H236 M258 120 H238"/></g>`,
      });
    case "horse": // bay horse — mane, small ears, long muzzle, hooves
      return {
        ...quadFigure({
          coat: "#9a6b3f", ink: "#5e4630",
          markings: `<path d="M60 100 Q110 86 198 92 Q204 98 200 116 Q150 122 96 120 Q64 118 58 112 Q56 106 60 100 Z" fill="#7a4f28"/><path d="M96 128 Q140 138 176 132 Q186 148 150 154 Q118 156 96 150 Z" fill="#b3855a"/>`,
          tail: `<path d="M60 104 C40 108 32 132 32 172 C31 186 42 188 48 178 C44 158 52 138 64 126 C70 120 68 110 66 104 Z" fill="#3a2412" stroke="#5e4630" stroke-width="1.6" stroke-linejoin="round"/>`,
          ears: earPointy("#9a6b3f", "#5e4630", "#7d5330"),
          feet: hooves("#3a2a1c"),
          face: `${nose("#2b241c")}${eye("#3a2a1c")}`,
          extras: `<path d="M198 92 C212 68 226 56 233 60 C229 76 219 92 210 104 C206 100 202 96 198 92 Z" fill="#3a2412" stroke="#5e4630" stroke-width="1.4" stroke-linejoin="round"/>`,
        }),
      };
    case "cow": // Holstein — floppy ears, horns, udder, hooves, pink muzzle
      return quadFigure({
        coat: "#eef1f4", ink: "#8a9098",
        markings: `<g fill="#2f333b"><path d="M96 96 Q120 88 140 96 Q150 116 136 130 Q108 134 92 124 Q86 104 96 96 Z"/><ellipse cx="176" cy="114" rx="16" ry="13"/><ellipse cx="118" cy="142" rx="12" ry="8"/></g>`,
        tail: `<path d="M66 104 C48 100 40 128 40 150 C40 166 50 166 54 156 C50 138 60 128 70 122 Z" fill="#eef1f4" stroke="#8a9098" stroke-width="1.6" stroke-linejoin="round"/><path d="M50 156 C46 170 54 176 60 168 C60 160 56 156 50 156 Z" fill="#3b3f46"/>`,
        ears: earFloppy("#eef1f4", "#8a9098", "#e6b8b8"),
        feet: hooves("#5b5550"),
        face: `${whiteMuzzle}<path d="M250 104 Q278 104 283 114 Q281 126 261 128 Q250 126 248 116 Z" fill="#f0c9c0"/>${nose("#d99a9a")}${eye("#3a2a1c")}`,
        extras: `<path d="M226 78 C220 66 224 58 232 60 C236 68 234 78 230 86 Z" fill="#e6dcc4" stroke="#8a9098" stroke-width="1.4" stroke-linejoin="round"/><path d="M238 80 C236 66 242 60 248 64 C248 74 244 82 240 88 Z" fill="#e6dcc4" stroke="#8a9098" stroke-width="1.4" stroke-linejoin="round"/><ellipse cx="150" cy="176" rx="14" ry="9" fill="#f0c9c0" stroke="#8a9098" stroke-width="1.2"/>`,
      });
    case "rabbit": // tall-eared rabbit — puff tail, pink nose
      return quadFigure({
        coat: "#d9d2c6", ink: "#a89e90",
        markings: `<path d="M60 100 Q110 86 198 92 Q204 98 200 116 Q150 122 96 120 Q64 118 58 112 Q56 106 60 100 Z" fill="#c2b7a6"/><path d="M96 128 Q140 138 176 132 Q186 148 150 154 Q118 156 96 150 Z" fill="#f6f3ec"/>`,
        tail: `<circle cx="60" cy="118" r="15" fill="#f6f3ec" stroke="#a89e90" stroke-width="1.6"/>`,
        ears: earTall("#d9d2c6", "#a89e90", "#efd6d6"),
        feet: toes("#a89e90"),
        face: `${nose("#d98a8a")}${eye("#5a4636")}`,
      });
    case "bird":
      return birdFigure();
    default:
      return quadFigure({
        coat: "#cdae82", ink: "#8a6f4a",
        tail: `<path d="M62 102 C42 98 30 78 44 64 C57 53 73 60 70 74 C62 68 52 74 52 86 C53 98 60 104 70 108 Z" fill="#cdae82" stroke="#8a6f4a" stroke-width="1.6" stroke-linejoin="round"/>`,
        ears: earFloppy("#cdae82", "#8a6f4a", "#b3946a"),
        feet: toes("#8a6f4a"),
        face: `${nose("#2b2b2b")}${eye("#3a2a1c")}`,
      });
  }
}

// ---- Bird — a plump songbird with coloured anatomical regions -----------------
const BIRD_REG: Record<string, string> = {
  head:    "M188 74 C186 52 200 44 214 48 C230 52 232 74 224 88 C214 98 196 92 188 74 Z",
  beak:    "M228 70 L264 80 L230 90 Z",
  neck:    "M186 88 Q182 104 194 118 L206 110 Q198 98 194 90 Z",
  spine:   "M96 100 Q150 82 190 92 L186 106 Q150 94 100 114 Z",
  thorax:  "M150 108 C182 104 190 128 186 146 Q168 150 150 148 Q148 128 150 108 Z",
  wing:    "M96 106 C140 98 176 118 176 124 C150 150 108 142 98 132 C88 124 90 112 96 106 Z",
  abdomen: "M104 136 Q140 152 172 144 Q164 166 128 166 Q104 158 104 136 Z",
};
const BIRD_ORDER = ["head", "beak", "neck", "spine", "thorax", "wing", "abdomen"];
const BIRD_RC: Record<string, string> = { ...RC, beak: "#f6c56a", wing: "#8fc9f2" };

function birdFigure(): Figure {
  const ink = "#7f8c99";
  const base = `
    <ellipse cx="150" cy="204" rx="86" ry="8" fill="#1e293b" opacity="0.10"/>
    <g stroke="#e0961c" stroke-width="4.5" stroke-linecap="round" fill="none"><path d="M134 158 L134 190 M127 192 L142 192"/><path d="M156 156 L156 190 M149 192 L164 192"/></g>
    <path d="M92 118 C66 110 50 120 46 124 C64 130 84 130 96 128 Z" fill="#8a6f4a"/>
    <path d="M186 92 C226 96 234 120 232 138 C230 166 190 174 150 172 C110 170 90 150 88 128 C86 104 118 84 150 84 C168 84 178 88 186 92 Z" fill="#b98a53"/>
    <path d="M150 108 C182 104 190 128 186 146 C178 164 140 162 128 156 Q122 132 150 108 Z" fill="#e7a86a"/>
    <path d="M96 100 Q150 84 190 94 Q186 108 150 100 Q110 96 96 112 Z" fill="#8a6f4a"/>`;
  const zones: Zone[] = BIRD_ORDER.map((id) => ({ id, d: BIRD_REG[id], color: BIRD_RC[id] ?? "#d8dee6" }));
  const outline = `<path d="M186 92 C226 96 234 120 232 138 C230 166 190 174 150 172 C110 170 90 150 88 128 C86 104 118 84 150 84 C168 84 178 88 186 92 Z" fill="none" stroke="${ink}" stroke-width="2.6" stroke-linejoin="round"/>`;
  const overlay = `
    <path d="M206 52 C202 32 212 26 220 30 C224 40 218 52 214 58 Z" fill="#f2c53d" stroke="${ink}" stroke-width="1.6" stroke-linejoin="round"/>
    <path d="M228 70 L264 80 L230 90 C226 84 226 76 228 70 Z" fill="none" stroke="${ink}" stroke-width="2" stroke-linejoin="round"/>
    <path d="M245 80 L232 82" stroke="${ink}" stroke-width="1.2"/>
    <circle cx="212" cy="70" r="4.6" fill="#20160f"/><circle cx="213.6" cy="68.2" r="1.5" fill="#fff"/>`;
  return { base, zones, outline, overlay };
}
