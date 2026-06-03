// Country dialing codes for the per-number country-code selector.
// Lets staff record foreign clients with their own code, overriding the clinic default.
export interface DialCodeInfo {
  code: string; // e.g. "+964"
  name: string;
  flag: string;
}

export const DIAL_CODES: DialCodeInfo[] = [
  { code: "+964", name: "Iraq", flag: "🇮🇶" },
  { code: "+1", name: "USA / Canada", flag: "🇺🇸" },
  { code: "+44", name: "United Kingdom", flag: "🇬🇧" },
  { code: "+971", name: "UAE", flag: "🇦🇪" },
  { code: "+966", name: "Saudi Arabia", flag: "🇸🇦" },
  { code: "+965", name: "Kuwait", flag: "🇰🇼" },
  { code: "+973", name: "Bahrain", flag: "🇧🇭" },
  { code: "+974", name: "Qatar", flag: "🇶🇦" },
  { code: "+968", name: "Oman", flag: "🇴🇲" },
  { code: "+962", name: "Jordan", flag: "🇯🇴" },
  { code: "+961", name: "Lebanon", flag: "🇱🇧" },
  { code: "+963", name: "Syria", flag: "🇸🇾" },
  { code: "+967", name: "Yemen", flag: "🇾🇪" },
  { code: "+20", name: "Egypt", flag: "🇪🇬" },
  { code: "+90", name: "Turkey", flag: "🇹🇷" },
  { code: "+98", name: "Iran", flag: "🇮🇷" },
  { code: "+212", name: "Morocco", flag: "🇲🇦" },
  { code: "+213", name: "Algeria", flag: "🇩🇿" },
  { code: "+216", name: "Tunisia", flag: "🇹🇳" },
  { code: "+218", name: "Libya", flag: "🇱🇾" },
  { code: "+249", name: "Sudan", flag: "🇸🇩" },
  { code: "+49", name: "Germany", flag: "🇩🇪" },
  { code: "+33", name: "France", flag: "🇫🇷" },
  { code: "+39", name: "Italy", flag: "🇮🇹" },
  { code: "+34", name: "Spain", flag: "🇪🇸" },
  { code: "+7", name: "Russia", flag: "🇷🇺" },
  { code: "+91", name: "India", flag: "🇮🇳" },
  { code: "+92", name: "Pakistan", flag: "🇵🇰" },
  { code: "+93", name: "Afghanistan", flag: "🇦🇫" },
  { code: "+86", name: "China", flag: "🇨🇳" },
  { code: "+81", name: "Japan", flag: "🇯🇵" },
];

/** Split a stored phone into its country code (best match) and national digits. */
export function parsePhone(value: string, fallbackCode: string): { code: string; national: string } {
  const v = (value || "").trim();
  const d = v.replace(/\D/g, "");
  if (!d) return { code: fallbackCode, national: "" };
  // Match the longest known code that prefixes the digits.
  const byLen = [...DIAL_CODES].sort((a, b) => b.code.length - a.code.length);
  for (const dc of byLen) {
    const cc = dc.code.replace("+", "");
    if (d.startsWith(cc)) return { code: dc.code, national: d.slice(cc.length) };
  }
  return { code: fallbackCode, national: d };
}

export function flagFor(code: string): string {
  return DIAL_CODES.find((d) => d.code === code)?.flag ?? "🌐";
}
