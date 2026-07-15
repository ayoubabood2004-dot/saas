// ============================================================================
// Segmented anatomy figure — a colourful, cartoon-yet-natural animal drawn as
// CLICKABLE anatomical zones separated by sharp dividing lines (no dots/circles).
// Each region is a polygon on a 300×230 canvas facing right; AnatomyMap styles
// the fill by selection state and draws the non-interactive details on top.
// ============================================================================
import type { Species } from "@/types";

export interface FigRegion { id: string; d: string }
export interface Palette { base: string; edge: string; hi: string }
export interface Figure {
  regions: FigRegion[]; // clickable body zones (sharp-edged partitions)
  details: string;      // eyes / ears / nose / markings drawn over the regions (pointer-events:none)
  palette: Palette;
}

const PAL: Record<Species, Palette> = {
  dog:    { base: "#d99a58", edge: "#8a5a2b", hi: "#f4d7ac" },
  cat:    { base: "#e8a24e", edge: "#a86a24", hi: "#f8e3bf" },
  cow:    { base: "#eef1f5", edge: "#8f98a6", hi: "#ffffff" },
  horse:  { base: "#a4693a", edge: "#6e401f", hi: "#c99a63" },
  rabbit: { base: "#cfc8bd", edge: "#8f887c", hi: "#efece6" },
  bird:   { base: "#54bd66", edge: "#2f7d3c", hi: "#9fe0a8" },
  other:  { base: "#c9a878", edge: "#8a6a44", hi: "#e7d6ba" },
};

// Shared quadruped zones. Straight shared edges = the sharp partition lines.
const QUAD: FigRegion[] = [
  { id: "spine",   d: "M62 120 C62 112 74 104 104 102 L150 100 L196 106 L196 122 L150 116 L104 118 C80 120 66 126 62 132 Z" },
  { id: "pelvis",  d: "M62 132 C64 122 78 119 104 118 L104 168 L82 168 C68 168 62 154 62 132 Z" },
  { id: "abdomen", d: "M104 118 L150 116 L150 168 L104 168 Z" },
  { id: "thorax",  d: "M150 116 L196 122 L196 168 L150 168 Z" },
  { id: "neck",    d: "M196 106 L196 168 L210 160 C221 146 223 122 214 111 C208 104 202 104 196 106 Z" },
  { id: "head",    d: "M214 111 C207 92 221 74 241 76 C260 78 266 96 260 111 L266 116 C268 124 260 130 250 128 C244 134 232 134 226 126 C218 124 214 118 214 111 Z" },
  { id: "oral",    d: "M250 108 L268 112 C270 121 261 127 251 124 C244 123 244 112 250 108 Z" },
  { id: "foreleg", d: "M168 160 L192 160 L190 206 C190 210 184 212 180 210 L170 210 C166 210 166 204 167 200 Z" },
  { id: "hindleg", d: "M74 160 L104 162 L102 206 C102 210 96 212 92 210 L80 210 C74 210 74 204 75 200 Z" },
];

// Decorative-only tail (not an anatomical region).
const TAIL = (p: Palette) => `<path d="M40 150 C30 140 34 120 46 112 C54 118 58 128 62 138 L62 156 C56 160 46 158 40 150 Z" fill="${p.base}" stroke="${p.edge}" stroke-width="2.4" stroke-linejoin="round"/>`;

// Common head furniture (eye + mouth) shared by all quadrupeds.
const FACE = (p: Palette, nose: string) =>
  `<ellipse cx="266" cy="116" rx="4.6" ry="3.7" fill="${nose}"/>` +
  `<path d="M262 122 C260 126 254 126 252 123" fill="none" stroke="${p.edge}" stroke-width="1.6" stroke-linecap="round"/>` +
  `<circle cx="240" cy="98" r="3.6" fill="#26201b"/><circle cx="241.3" cy="96.7" r="1.15" fill="#fff"/>`;

const EAR = {
  floppy: (p: Palette) => `<path d="M224 96 C213 86 212 68 223 61 C236 65 239 84 237 100 Z" fill="${p.hi}" stroke="${p.edge}" stroke-width="2" stroke-linejoin="round" opacity="0.95"/>`,
  pointy: (p: Palette) => `<path d="M222 88 L224 60 L240 80 Z" fill="${p.hi}" stroke="${p.edge}" stroke-width="2" stroke-linejoin="round"/><path d="M238 82 L250 60 L252 86 Z" fill="${p.hi}" stroke="${p.edge}" stroke-width="2" stroke-linejoin="round"/>`,
  tall:   (p: Palette) => `<path d="M226 82 C220 52 224 30 234 30 C242 32 240 60 236 84 Z" fill="${p.hi}" stroke="${p.edge}" stroke-width="2" stroke-linejoin="round"/><path d="M240 84 C238 54 246 32 256 34 C262 40 254 64 250 86 Z" fill="${p.hi}" stroke="${p.edge}" stroke-width="2" stroke-linejoin="round"/>`,
};

function quadFigure(species: Species, opts: {
  regions?: FigRegion[]; nose?: string; ear: (p: Palette) => string; extras?: (p: Palette) => string;
}): Figure {
  const p = PAL[species];
  const nose = opts.nose ?? "#3a2a20";
  const details =
    TAIL(p) +
    // soft top light for a rounded, 3D feel
    `<ellipse cx="150" cy="118" rx="86" ry="26" fill="#ffffff" opacity="0.16"/>` +
    `<g style="pointer-events:none">` + opts.ear(p) + (opts.extras?.(p) ?? "") + FACE(p, nose) + `</g>`;
  return { regions: opts.regions ?? QUAD, palette: p, details };
}

export function figureFor(species: Species): Figure {
  switch (species) {
    case "dog":
      return quadFigure("dog", { ear: EAR.floppy });
    case "cat":
      return quadFigure("cat", { ear: EAR.pointy, nose: "#c86a6a" });
    case "horse":
      return quadFigure("horse", {
        ear: EAR.pointy,
        // mane along the neck + crest
        extras: (p) => `<path d="M196 106 C204 96 214 90 224 78 C220 96 214 108 210 120 C204 116 200 110 196 106 Z" fill="${p.edge}" opacity="0.85"/>`,
      });
    case "cow":
      return quadFigure("cow", {
        ear: EAR.floppy, nose: "#c98a8a",
        // little horns + a couple of black patches
        extras: () => `<path d="M226 62 C222 54 224 48 230 48 C232 54 231 60 232 66 Z" fill="#e8ddc7" stroke="#9a8f78" stroke-width="1.4"/><path d="M242 60 C246 52 252 50 256 54 C252 58 248 62 246 68 Z" fill="#e8ddc7" stroke="#9a8f78" stroke-width="1.4"/><ellipse cx="120" cy="140" rx="16" ry="12" fill="#3a3f47" opacity="0.9"/><ellipse cx="176" cy="146" rx="11" ry="9" fill="#3a3f47" opacity="0.9"/>`,
      });
    case "rabbit":
      return quadFigure("rabbit", { ear: EAR.tall, nose: "#c98a8a" });
    case "bird":
      return quadFigure("bird", {
        // pointed beak instead of a muzzle + a yellow crest + tail feathers
        nose: "#e7a11e",
        ear: (p) => `<path d="M228 84 C224 64 230 46 240 46 C246 52 242 72 238 86 Z" fill="#f2c53d" stroke="${p.edge}" stroke-width="1.8" stroke-linejoin="round"/>`,
        extras: () => `<path d="M266 112 L284 116 L266 122 Z" fill="#e7a11e" stroke="#b57d10" stroke-width="1.4" stroke-linejoin="round"/>`,
      });
    default:
      return quadFigure("other", { ear: EAR.floppy });
  }
}
