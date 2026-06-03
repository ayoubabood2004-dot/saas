import type { Species } from "@/types";

// Clearer side-profile animal diagrams for anatomical marking. Each is composed of
// simple shapes (body, head, ears, 4 distinct legs, tail, eye) so the species is
// recognisable and the doctor can mark a precise location (joint, fracture, lesion).
// All shapes share the group fill/stroke; eyes/noses override to a darker dot.

const DOG = `
  <path d="M82 112 q-24 -8 -20 -32 q16 2 30 18 q6 8 4 18 z"/>
  <rect x="94" y="150" width="15" height="48" rx="7"/>
  <rect x="116" y="152" width="15" height="46" rx="7"/>
  <rect x="166" y="152" width="15" height="46" rx="7"/>
  <rect x="188" y="150" width="15" height="48" rx="7"/>
  <ellipse cx="140" cy="124" rx="64" ry="34"/>
  <circle cx="210" cy="104" r="26"/>
  <rect x="226" y="102" width="30" height="17" rx="8"/>
  <path d="M192 86 q-8 -28 16 -30 q3 18 -3 32 z"/>
  <circle cx="216" cy="98" r="3.2" fill="#475569" stroke="none"/>
  <circle cx="255" cy="108" r="4" fill="#475569" stroke="none"/>
`;

const CAT = `
  <path d="M86 122 q-30 -6 -32 -46 q-1 -20 11 -17 q-3 16 6 29 q9 18 24 22 z"/>
  <rect x="98" y="150" width="13" height="48" rx="6"/>
  <rect x="118" y="152" width="13" height="46" rx="6"/>
  <rect x="166" y="152" width="13" height="46" rx="6"/>
  <rect x="186" y="150" width="13" height="48" rx="6"/>
  <ellipse cx="140" cy="128" rx="58" ry="30"/>
  <circle cx="204" cy="108" r="22"/>
  <path d="M186 90 l4 -24 l16 14 z"/>
  <path d="M206 88 l10 -20 l8 22 z"/>
  <circle cx="210" cy="104" r="2.8" fill="#475569" stroke="none"/>
  <circle cx="225" cy="112" r="3" fill="#475569" stroke="none"/>
`;

const HORSE = `
  <path d="M84 104 q-16 6 -20 44 q-1 12 6 13 q6 -1 6 -11 q2 -28 14 -40 z"/>
  <rect x="98" y="134" width="14" height="72" rx="7"/>
  <rect x="118" y="136" width="14" height="70" rx="7"/>
  <rect x="160" y="136" width="14" height="70" rx="7"/>
  <rect x="180" y="134" width="14" height="72" rx="7"/>
  <ellipse cx="138" cy="112" rx="60" ry="32"/>
  <path d="M176 106 L194 62 L214 56 L214 74 L196 118 Z"/>
  <ellipse cx="222" cy="58" rx="20" ry="13"/>
  <path d="M206 46 l1 -16 l9 12 z"/>
  <path d="M218 44 l8 -14 l4 16 z"/>
  <path d="M194 64 q-10 6 -15 42 q9 -34 17 -40 z"/>
  <circle cx="224" cy="56" r="3" fill="#475569" stroke="none"/>
  <circle cx="240" cy="62" r="3.4" fill="#475569" stroke="none"/>
`;

const COW = `
  <path d="M74 110 q-12 8 -14 46 q-1 12 6 13 q6 -1 6 -11 q2 -30 10 -42 z"/>
  <ellipse cx="68" cy="166" rx="5" ry="9"/>
  <rect x="92" y="144" width="16" height="56" rx="7"/>
  <rect x="116" y="146" width="16" height="54" rx="7"/>
  <rect x="166" y="146" width="16" height="54" rx="7"/>
  <rect x="190" y="144" width="16" height="56" rx="7"/>
  <ellipse cx="136" cy="116" rx="66" ry="36"/>
  <ellipse cx="116" cy="150" rx="15" ry="11"/>
  <rect x="198" y="96" width="42" height="38" rx="14"/>
  <path d="M204 98 q-6 -20 5 -26 q5 7 4 26 z"/>
  <path d="M232 98 q5 -20 18 -20 q-2 13 -11 22 z"/>
  <path d="M198 108 q-20 2 -28 -8 q12 -7 28 -2 z"/>
  <ellipse cx="116" cy="104" rx="16" ry="11" fill="#94a3b8" stroke="none"/>
  <ellipse cx="158" cy="132" rx="13" ry="9" fill="#94a3b8" stroke="none"/>
  <circle cx="226" cy="108" r="3.4" fill="#475569" stroke="none"/>
  <circle cx="237" cy="126" r="3.4" fill="#475569" stroke="none"/>
`;

const RABBIT = `
  <ellipse cx="196" cy="78" rx="8" ry="32" transform="rotate(-8 196 78)"/>
  <ellipse cx="212" cy="82" rx="8" ry="30" transform="rotate(8 212 82)"/>
  <ellipse cx="120" cy="178" rx="30" ry="13"/>
  <rect x="172" y="150" width="13" height="40" rx="6"/>
  <ellipse cx="150" cy="138" rx="46" ry="42"/>
  <circle cx="108" cy="132" r="11"/>
  <circle cx="202" cy="120" r="24"/>
  <circle cx="210" cy="114" r="3" fill="#475569" stroke="none"/>
  <circle cx="224" cy="124" r="3" fill="#475569" stroke="none"/>
`;

const BIRD = `
  <path d="M96 132 l-46 -10 l42 24 z"/>
  <rect x="128" y="158" width="6" height="34" rx="3"/>
  <rect x="150" y="158" width="6" height="34" rx="3"/>
  <ellipse cx="140" cy="132" rx="48" ry="34"/>
  <path d="M118 118 q36 -8 54 16 q-32 12 -54 -2 z"/>
  <circle cx="196" cy="104" r="21"/>
  <path d="M214 99 l26 6 l-26 9 z"/>
  <circle cx="200" cy="100" r="3" fill="#475569" stroke="none"/>
`;

const PATHS: Record<Species, string> = {
  dog: DOG,
  cat: CAT,
  horse: HORSE,
  cow: COW,
  rabbit: RABBIT,
  bird: BIRD,
  other: DOG,
};

export function silhouetteSvg(species: Species): string {
  const inner = PATHS[species] ?? DOG;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 230"><g fill="#e2e8f0" stroke="#64748b" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${inner}</g></svg>`;
}

export function silhouetteDataUrl(species: Species): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(silhouetteSvg(species))}`;
}
