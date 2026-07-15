// ============================================================================
// Anatomy figure — a clean FLAT-VECTOR animal (modern illustration style) whose
// side-profile body is divided into anatomical zones by fine topographic lines.
// AnatomyMap draws the `body` art once, then overlays the transparent, clickable
// `zones` (one per scientific region) that highlight on hover / selection.
// ============================================================================
import type { Species } from "@/types";

export interface Zone { id: string; d: string }
export interface Figure { body: string; zones: Zone[] }

// ---- Clickable anatomical zones over the shared flat quadruped (300×230) ------
const QUAD_ZONES: Zone[] = [
  { id: "spine",   d: "M64 104 Q120 90 198 96 L196 110 Q120 100 66 118 Z" },
  { id: "pelvis",  d: "M58 118 Q56 134 66 152 Q86 158 104 153 L104 100 Q80 94 62 108 Z" },
  { id: "abdomen", d: "M104 100 L150 95 L150 156 Q126 160 104 153 Z" },
  { id: "thorax",  d: "M150 95 L196 93 L201 150 Q174 158 150 156 Z" },
  { id: "neck",    d: "M196 93 Q210 95 211 112 Q211 132 203 150 L196 152 Z" },
  { id: "head",    d: "M191 104 A22 22 0 1 1 233 100 Q234 116 224 122 Q205 125 196 116 Q191 111 191 104 Z" },
  { id: "oral",    d: "M228 96 Q252 96 264 108 Q262 120 248 121 Q232 121 226 111 Q224 102 228 96 Z" },
  { id: "foreleg", d: "M172 148 L193 148 L193 208 Q193 213 184 213 Q173 213 173 206 Z" },
  { id: "hindleg", d: "M95 148 L114 148 L114 208 Q114 213 105 213 Q95 213 95 206 Z" },
];

interface Kit {
  coat: string; dark: string; belly: string; muzzle: string;
  nose: string; ear: string; tail: string; extras?: string; feet?: string;
}

// A flat, clean quadruped built from a per-species kit. Subtle division lines
// mark the region boundaries; nothing is gradient-shaded.
function quadBody(k: Kit): string {
  const eye = `<circle cx="220" cy="100" r="4.4" fill="#2b2b2b"/><circle cx="221.7" cy="98.2" r="1.4" fill="#fff"/>`;
  const nose = `<ellipse cx="261" cy="109" rx="5.2" ry="4.4" fill="${k.nose}"/><path d="M252 117 Q246 122 239 118" stroke="${k.dark}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
  return `
  <ellipse cx="150" cy="210" rx="104" ry="8" fill="#1e293b" opacity="0.09"/>
  <g fill="${k.dark}"><rect x="158" y="150" width="14" height="58" rx="6"/><rect x="82" y="150" width="14" height="58" rx="6"/></g>
  ${k.tail}
  <path d="M60 112 Q60 92 96 90 Q150 86 196 92 Q212 94 216 112 Q218 134 210 150 Q150 160 96 154 Q64 150 58 132 Q56 120 60 112 Z" fill="${k.coat}"/>
  <path d="M96 132 Q150 140 200 132 Q198 150 168 156 Q120 160 96 152 Z" fill="${k.belly}"/>
  ${k.extras ?? ""}
  <g fill="${k.coat}"><rect x="176" y="148" width="15" height="60" rx="6.5"/><rect x="98" y="148" width="15" height="60" rx="6.5"/></g>
  ${k.feet ?? ""}
  ${k.ear}
  <circle cx="212" cy="104" r="22" fill="${k.coat}"/>
  <path d="M228 96 Q252 96 264 108 Q262 120 248 121 Q232 121 226 111 Q224 102 228 96 Z" fill="${k.muzzle}"/>
  ${nose}${eye}
  <g stroke="${k.dark}" stroke-width="1.4" stroke-opacity="0.55" fill="none" stroke-linecap="round">
    <path d="M196 94 Q199 112 195 150"/>
    <path d="M150 90 Q148 112 150 156"/>
    <path d="M104 90 Q100 112 104 154"/>
    <path d="M64 104 Q120 90 198 96" stroke-opacity="0.4"/>
    <path d="M194 96 Q196 108 200 118" stroke-opacity="0.45"/>
  </g>`;
}

const ear = {
  floppy: (k: Kit) => `<path d="M206 92 Q192 92 190 112 Q192 130 210 124 Q216 112 212 98 Z" fill="${k.dark}"/>`,
  pointy: (k: Kit, inner: string) => `<path d="M204 86 L200 58 L224 78 Z" fill="${k.dark}"/><path d="M208 82 L206 66 L217 78 Z" fill="${inner}"/>`,
  tall: (k: Kit, inner: string) => `<path d="M204 88 Q196 44 212 42 Q222 48 216 92 Z" fill="${k.dark}"/><path d="M208 86 Q204 56 212 56 Q218 62 214 86 Z" fill="${inner}"/>`,
};

export function figureFor(species: Species): Figure {
  switch (species) {
    case "dog":
      return { zones: QUAD_ZONES, body: quadBody({
        coat: "#e0a15a", dark: "#c17e3a", belly: "#f6e2c0", muzzle: "#f6e2c0", nose: "#2b2b2b",
        ear: ear.floppy({ coat: "", dark: "#b06a34", belly: "", muzzle: "", nose: "", ear: "", tail: "" }),
        extras: `<path d="M100 92 Q150 88 176 92 Q186 112 178 138 Q140 146 100 142 Q94 116 100 92 Z" fill="#6e4a2c"/>`,
        tail: `<path d="M66 112 Q44 108 36 138 Q34 154 48 156 Q44 138 58 130 Q66 124 70 116 Z" fill="#e0a15a"/>`,
      }) };
    case "cat":
      return { zones: QUAD_ZONES, body: quadBody({
        coat: "#efa44e", dark: "#d0842f", belly: "#fbe7c4", muzzle: "#fbe7c4", nose: "#e07b7b",
        ear: ear.pointy({ coat: "", dark: "#c47a2a", belly: "", muzzle: "", nose: "", ear: "", tail: "" }, "#f2c78e"),
        extras: `<g stroke="#cf8330" stroke-width="4" fill="none" stroke-linecap="round"><path d="M100 96 V132"/><path d="M120 94 V134"/><path d="M140 93 V135"/></g>`,
        tail: `<path d="M64 120 Q38 118 34 150 Q34 166 46 164 Q42 146 58 136 Q66 130 68 122 Z" fill="#efa44e"/>`,
      }) };
    case "horse":
      return { zones: QUAD_ZONES, body: quadBody({
        coat: "#a4693a", dark: "#82552c", belly: "#c08a54", muzzle: "#8a5730", nose: "#2b241c",
        ear: ear.pointy({ coat: "", dark: "#7d4a24", belly: "", muzzle: "", nose: "", ear: "", tail: "" }, "#5e3718"),
        extras: `<path d="M214 58 Q222 82 206 116 Q202 100 196 100 Q204 78 214 58 Z" fill="#3a2412"/>`,
        tail: `<path d="M62 108 Q40 116 40 168 Q42 180 50 174 Q46 150 62 130 Q68 122 68 110 Z" fill="#3a2412"/>`,
        feet: `<g fill="#3a2a1a"><rect x="175" y="201" width="17" height="9" rx="2"/><rect x="97" y="201" width="17" height="9" rx="2"/></g>`,
      }) };
    case "cow":
      return { zones: QUAD_ZONES, body: quadBody({
        coat: "#f2f3f6", dark: "#d7dce3", belly: "#ffffff", muzzle: "#f6d9d3", nose: "#d99a9a",
        ear: ear.floppy({ coat: "", dark: "#cdd3dc", belly: "", muzzle: "", nose: "", ear: "", tail: "" }),
        extras: `<ellipse cx="120" cy="118" rx="20" ry="15" fill="#3b3f46"/><ellipse cx="176" cy="116" rx="12" ry="10" fill="#3b3f46"/><path d="M204 62 Q200 52 208 50 Q212 56 210 66 Z" fill="#e6dcc4"/><path d="M214 60 Q220 50 226 54 Q222 60 220 68 Z" fill="#e6dcc4"/><ellipse cx="128" cy="152" rx="13" ry="8" fill="#f0c9c0"/>`,
        tail: `<path d="M66 112 Q46 108 40 150 Q40 168 50 166 Q46 138 60 128 Q68 122 70 114 Z" fill="#f2f3f6"/><path d="M46 166 Q44 178 52 180 Q56 174 54 166 Z" fill="#3b3f46"/>`,
        feet: `<g fill="#7c8592"><rect x="175" y="201" width="17" height="9" rx="2"/><rect x="97" y="201" width="17" height="9" rx="2"/></g>`,
      }) };
    case "rabbit":
      return { zones: QUAD_ZONES, body: quadBody({
        coat: "#d6cfc3", dark: "#c2bab0", belly: "#f4f1eb", muzzle: "#f4f1eb", nose: "#d99a9a",
        ear: ear.tall({ coat: "", dark: "#c2bab0", belly: "", muzzle: "", nose: "", ear: "", tail: "" }, "#eddede"),
        tail: `<circle cx="60" cy="150" r="15" fill="#f4f1eb"/>`,
      }) };
    case "bird":
      return { zones: BIRD_ZONES, body: birdBody() };
    default:
      return { zones: QUAD_ZONES, body: quadBody({
        coat: "#cdae82", dark: "#a98a5a", belly: "#eaddc4", muzzle: "#eaddc4", nose: "#2b2b2b",
        ear: ear.floppy({ coat: "", dark: "#a98a5a", belly: "", muzzle: "", nose: "", ear: "", tail: "" }),
        tail: `<path d="M66 112 Q46 108 38 138 Q36 154 50 156 Q46 138 60 130 Q68 124 70 116 Z" fill="#cdae82"/>`,
      }) };
  }
}

// ---- Bird — a plump flat songbird with wing + beak + crest + tail feathers ----
const BIRD_ZONES: Zone[] = [
  { id: "head",    d: "M188 74 Q186 52 210 52 Q234 54 232 80 Q226 98 200 96 Q188 90 188 74 Z" },
  { id: "beak",    d: "M230 74 L262 82 L232 92 Z" },
  { id: "neck",    d: "M186 88 Q182 104 190 118 L204 112 Q200 100 196 92 Z" },
  { id: "spine",   d: "M96 100 Q150 84 190 94 L186 108 Q150 96 100 114 Z" },
  { id: "thorax",  d: "M150 108 Q182 104 188 130 Q184 150 156 150 Q150 130 150 108 Z" },
  { id: "wing",    d: "M96 106 Q140 98 172 122 Q146 148 104 138 Q86 122 96 106 Z" },
  { id: "abdomen", d: "M104 138 Q136 154 168 146 Q160 168 124 166 Q104 158 104 138 Z" },
  { id: "hindleg", d: "M134 158 L134 192 M127 193 L142 193 M156 156 L156 192 M149 193 L164 193" },
];

function birdBody(): string {
  return `
  <ellipse cx="150" cy="204" rx="86" ry="8" fill="#1e293b" opacity="0.09"/>
  <g stroke="#e0961c" stroke-width="4" stroke-linecap="round" fill="none"><path d="M134 158 L134 192 M127 193 L142 193"/><path d="M156 156 L156 192 M149 193 L164 193"/></g>
  <path d="M92 118 Q66 110 50 122 Q70 128 96 128 Z" fill="#3fa050"/>
  <path d="M186 92 Q226 96 232 132 Q230 168 178 170 Q112 172 92 128 Q86 98 128 88 Q158 82 186 92 Z" fill="#57bd67"/>
  <path d="M150 108 Q182 104 188 130 Q182 160 132 158 Q128 128 150 108 Z" fill="#bfe8c4"/>
  <path d="M96 106 Q140 98 172 122 Q146 148 104 138 Q86 122 96 106 Z" fill="#3fa050"/>
  <g stroke="#2f7d3c" stroke-width="1.4" stroke-opacity="0.55" fill="none"><path d="M112 114 Q140 118 158 130"/><path d="M108 124 Q134 128 150 138"/></g>
  <path d="M188 74 Q186 52 210 52 Q234 54 232 80 Q226 98 200 96 Q188 90 188 74 Z" fill="#57bd67"/>
  <path d="M204 54 Q200 36 210 34 Q216 38 214 56 Z" fill="#f2c53d"/>
  <path d="M230 74 L262 82 L232 92 Z" fill="#e7a11e"/>
  <circle cx="214" cy="72" r="4.4" fill="#20160f"/><circle cx="215.6" cy="70.4" r="1.4" fill="#fff"/>
  <g stroke="#2f7d3c" stroke-width="1.4" stroke-opacity="0.5" fill="none" stroke-linecap="round"><path d="M186 88 Q182 104 190 118"/><path d="M150 106 Q150 128 156 150"/></g>`;
}
