// ============================================================================
// مفاتيح الاتصال الدولية — القائمة الكاملة لكل الدول.
//
// كانت القائمة ٣١ دولة فقط، فزبون من السويد (أو أي دولة خارجها) ما يقدر
// يُسجَّل برقمه الصحيح. الآن كل الدول المعترف بها + الأقاليم ذات المفتاح
// المستقل، بأسمائها العربية والإنجليزية.
//
// العلم يُولَّد من رمز الدولة (ISO-3166 alpha-2) بحروف المؤشر الإقليمي بدل
// لصق إيموجي لكل صف — رمز صحيح ⇒ علم صحيح دائماً، ولا مجال لخطأ نسخ.
// ============================================================================
export interface DialCodeInfo {
  code: string; // مثل "+964"
  name: string; // الاسم الإنجليزي (للفرز والبحث)
  nameAr: string;
  iso: string;  // ISO-3166 alpha-2
  flag: string;
}

/** علم الدولة من رمزها: كل حرف يُزاح إلى حرف المؤشر الإقليمي المقابل. */
export function flagOfIso(iso: string): string {
  if (!/^[A-Za-z]{2}$/.test(iso)) return "🌐";
  return String.fromCodePoint(...[...iso.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** [ISO, مفتاح, الاسم الإنجليزي, الاسم العربي] */
const RAW: [string, string, string, string][] = [
  ["AF", "+93", "Afghanistan", "أفغانستان"],
  ["AL", "+355", "Albania", "ألبانيا"],
  ["DZ", "+213", "Algeria", "الجزائر"],
  ["AD", "+376", "Andorra", "أندورا"],
  ["AO", "+244", "Angola", "أنغولا"],
  ["AG", "+1268", "Antigua & Barbuda", "أنتيغوا وبربودا"],
  ["AR", "+54", "Argentina", "الأرجنتين"],
  ["AM", "+374", "Armenia", "أرمينيا"],
  ["AW", "+297", "Aruba", "أروبا"],
  ["AU", "+61", "Australia", "أستراليا"],
  ["AT", "+43", "Austria", "النمسا"],
  ["AZ", "+994", "Azerbaijan", "أذربيجان"],
  ["BS", "+1242", "Bahamas", "الباهاما"],
  ["BH", "+973", "Bahrain", "البحرين"],
  ["BD", "+880", "Bangladesh", "بنغلاديش"],
  ["BB", "+1246", "Barbados", "بربادوس"],
  ["BY", "+375", "Belarus", "بيلاروسيا"],
  ["BE", "+32", "Belgium", "بلجيكا"],
  ["BZ", "+501", "Belize", "بليز"],
  ["BJ", "+229", "Benin", "بنين"],
  ["BM", "+1441", "Bermuda", "برمودا"],
  ["BT", "+975", "Bhutan", "بوتان"],
  ["BO", "+591", "Bolivia", "بوليفيا"],
  ["BA", "+387", "Bosnia & Herzegovina", "البوسنة والهرسك"],
  ["BW", "+267", "Botswana", "بوتسوانا"],
  ["BR", "+55", "Brazil", "البرازيل"],
  ["BN", "+673", "Brunei", "بروناي"],
  ["BG", "+359", "Bulgaria", "بلغاريا"],
  ["BF", "+226", "Burkina Faso", "بوركينا فاسو"],
  ["BI", "+257", "Burundi", "بوروندي"],
  ["KH", "+855", "Cambodia", "كمبوديا"],
  ["CM", "+237", "Cameroon", "الكاميرون"],
  ["CA", "+1", "Canada", "كندا"],
  ["CV", "+238", "Cape Verde", "الرأس الأخضر"],
  ["KY", "+1345", "Cayman Islands", "جزر كايمان"],
  ["CF", "+236", "Central African Republic", "أفريقيا الوسطى"],
  ["TD", "+235", "Chad", "تشاد"],
  ["CL", "+56", "Chile", "تشيلي"],
  ["CN", "+86", "China", "الصين"],
  ["CO", "+57", "Colombia", "كولومبيا"],
  ["KM", "+269", "Comoros", "جزر القمر"],
  ["CG", "+242", "Congo — Brazzaville", "الكونغو"],
  ["CD", "+243", "Congo — Kinshasa", "الكونغو الديمقراطية"],
  ["CR", "+506", "Costa Rica", "كوستاريكا"],
  ["CI", "+225", "Côte d’Ivoire", "ساحل العاج"],
  ["HR", "+385", "Croatia", "كرواتيا"],
  ["CU", "+53", "Cuba", "كوبا"],
  ["CY", "+357", "Cyprus", "قبرص"],
  ["CZ", "+420", "Czechia", "التشيك"],
  ["DK", "+45", "Denmark", "الدنمارك"],
  ["DJ", "+253", "Djibouti", "جيبوتي"],
  ["DM", "+1767", "Dominica", "دومينيكا"],
  ["DO", "+1809", "Dominican Republic", "جمهورية الدومينيكان"],
  ["EC", "+593", "Ecuador", "الإكوادور"],
  ["EG", "+20", "Egypt", "مصر"],
  ["SV", "+503", "El Salvador", "السلفادور"],
  ["GQ", "+240", "Equatorial Guinea", "غينيا الاستوائية"],
  ["ER", "+291", "Eritrea", "إريتريا"],
  ["EE", "+372", "Estonia", "إستونيا"],
  ["SZ", "+268", "Eswatini", "إسواتيني"],
  ["ET", "+251", "Ethiopia", "إثيوبيا"],
  ["FO", "+298", "Faroe Islands", "جزر فارو"],
  ["FJ", "+679", "Fiji", "فيجي"],
  ["FI", "+358", "Finland", "فنلندا"],
  ["FR", "+33", "France", "فرنسا"],
  ["PF", "+689", "French Polynesia", "بولينيزيا الفرنسية"],
  ["GA", "+241", "Gabon", "الغابون"],
  ["GM", "+220", "Gambia", "غامبيا"],
  ["GE", "+995", "Georgia", "جورجيا"],
  ["DE", "+49", "Germany", "ألمانيا"],
  ["GH", "+233", "Ghana", "غانا"],
  ["GI", "+350", "Gibraltar", "جبل طارق"],
  ["GR", "+30", "Greece", "اليونان"],
  ["GL", "+299", "Greenland", "غرينلاند"],
  ["GD", "+1473", "Grenada", "غرينادا"],
  ["GU", "+1671", "Guam", "غوام"],
  ["GT", "+502", "Guatemala", "غواتيمالا"],
  ["GN", "+224", "Guinea", "غينيا"],
  ["GW", "+245", "Guinea-Bissau", "غينيا بيساو"],
  ["GY", "+592", "Guyana", "غيانا"],
  ["HT", "+509", "Haiti", "هايتي"],
  ["HN", "+504", "Honduras", "هندوراس"],
  ["HK", "+852", "Hong Kong", "هونغ كونغ"],
  ["HU", "+36", "Hungary", "المجر"],
  ["IS", "+354", "Iceland", "آيسلندا"],
  ["IN", "+91", "India", "الهند"],
  ["ID", "+62", "Indonesia", "إندونيسيا"],
  ["IR", "+98", "Iran", "إيران"],
  ["IQ", "+964", "Iraq", "العراق"],
  ["IE", "+353", "Ireland", "أيرلندا"],
  ["IL", "+972", "Israel", "إسرائيل"],
  ["IT", "+39", "Italy", "إيطاليا"],
  ["JM", "+1876", "Jamaica", "جامايكا"],
  ["JP", "+81", "Japan", "اليابان"],
  ["JO", "+962", "Jordan", "الأردن"],
  ["KZ", "+7", "Kazakhstan", "كازاخستان"],
  ["KE", "+254", "Kenya", "كينيا"],
  ["KI", "+686", "Kiribati", "كيريباتي"],
  ["XK", "+383", "Kosovo", "كوسوفو"],
  ["KW", "+965", "Kuwait", "الكويت"],
  ["KG", "+996", "Kyrgyzstan", "قيرغيزستان"],
  ["LA", "+856", "Laos", "لاوس"],
  ["LV", "+371", "Latvia", "لاتفيا"],
  ["LB", "+961", "Lebanon", "لبنان"],
  ["LS", "+266", "Lesotho", "ليسوتو"],
  ["LR", "+231", "Liberia", "ليبيريا"],
  ["LY", "+218", "Libya", "ليبيا"],
  ["LI", "+423", "Liechtenstein", "ليختنشتاين"],
  ["LT", "+370", "Lithuania", "ليتوانيا"],
  ["LU", "+352", "Luxembourg", "لوكسمبورغ"],
  ["MO", "+853", "Macau", "ماكاو"],
  ["MG", "+261", "Madagascar", "مدغشقر"],
  ["MW", "+265", "Malawi", "مالاوي"],
  ["MY", "+60", "Malaysia", "ماليزيا"],
  ["MV", "+960", "Maldives", "المالديف"],
  ["ML", "+223", "Mali", "مالي"],
  ["MT", "+356", "Malta", "مالطا"],
  ["MH", "+692", "Marshall Islands", "جزر مارشال"],
  ["MR", "+222", "Mauritania", "موريتانيا"],
  ["MU", "+230", "Mauritius", "موريشيوس"],
  ["MX", "+52", "Mexico", "المكسيك"],
  ["FM", "+691", "Micronesia", "ميكرونيزيا"],
  ["MD", "+373", "Moldova", "مولدوفا"],
  ["MC", "+377", "Monaco", "موناكو"],
  ["MN", "+976", "Mongolia", "منغوليا"],
  ["ME", "+382", "Montenegro", "الجبل الأسود"],
  ["MA", "+212", "Morocco", "المغرب"],
  ["MZ", "+258", "Mozambique", "موزمبيق"],
  ["MM", "+95", "Myanmar", "ميانمار"],
  ["NA", "+264", "Namibia", "ناميبيا"],
  ["NR", "+674", "Nauru", "ناورو"],
  ["NP", "+977", "Nepal", "نيبال"],
  ["NL", "+31", "Netherlands", "هولندا"],
  ["NC", "+687", "New Caledonia", "كاليدونيا الجديدة"],
  ["NZ", "+64", "New Zealand", "نيوزيلندا"],
  ["NI", "+505", "Nicaragua", "نيكاراغوا"],
  ["NE", "+227", "Niger", "النيجر"],
  ["NG", "+234", "Nigeria", "نيجيريا"],
  ["KP", "+850", "North Korea", "كوريا الشمالية"],
  ["MK", "+389", "North Macedonia", "مقدونيا الشمالية"],
  ["NO", "+47", "Norway", "النرويج"],
  ["OM", "+968", "Oman", "عُمان"],
  ["PK", "+92", "Pakistan", "باكستان"],
  ["PW", "+680", "Palau", "بالاو"],
  ["PS", "+970", "Palestine", "فلسطين"],
  ["PA", "+507", "Panama", "بنما"],
  ["PG", "+675", "Papua New Guinea", "بابوا غينيا الجديدة"],
  ["PY", "+595", "Paraguay", "باراغواي"],
  ["PE", "+51", "Peru", "بيرو"],
  ["PH", "+63", "Philippines", "الفلبين"],
  ["PL", "+48", "Poland", "بولندا"],
  ["PT", "+351", "Portugal", "البرتغال"],
  ["PR", "+1787", "Puerto Rico", "بورتوريكو"],
  ["QA", "+974", "Qatar", "قطر"],
  ["RO", "+40", "Romania", "رومانيا"],
  ["RU", "+7", "Russia", "روسيا"],
  ["RW", "+250", "Rwanda", "رواندا"],
  ["WS", "+685", "Samoa", "ساموا"],
  ["SM", "+378", "San Marino", "سان مارينو"],
  ["ST", "+239", "São Tomé & Príncipe", "ساو تومي وبرينسيبي"],
  ["SA", "+966", "Saudi Arabia", "السعودية"],
  ["SN", "+221", "Senegal", "السنغال"],
  ["RS", "+381", "Serbia", "صربيا"],
  ["SC", "+248", "Seychelles", "سيشل"],
  ["SL", "+232", "Sierra Leone", "سيراليون"],
  ["SG", "+65", "Singapore", "سنغافورة"],
  ["SK", "+421", "Slovakia", "سلوفاكيا"],
  ["SI", "+386", "Slovenia", "سلوفينيا"],
  ["SB", "+677", "Solomon Islands", "جزر سليمان"],
  ["SO", "+252", "Somalia", "الصومال"],
  ["ZA", "+27", "South Africa", "جنوب أفريقيا"],
  ["KR", "+82", "South Korea", "كوريا الجنوبية"],
  ["SS", "+211", "South Sudan", "جنوب السودان"],
  ["ES", "+34", "Spain", "إسبانيا"],
  ["LK", "+94", "Sri Lanka", "سريلانكا"],
  ["KN", "+1869", "St. Kitts & Nevis", "سانت كيتس ونيفيس"],
  ["LC", "+1758", "St. Lucia", "سانت لوسيا"],
  ["VC", "+1784", "St. Vincent & Grenadines", "سانت فنسنت والغرينادين"],
  ["SD", "+249", "Sudan", "السودان"],
  ["SR", "+597", "Suriname", "سورينام"],
  ["SE", "+46", "Sweden", "السويد"],
  ["CH", "+41", "Switzerland", "سويسرا"],
  ["SY", "+963", "Syria", "سوريا"],
  ["TW", "+886", "Taiwan", "تايوان"],
  ["TJ", "+992", "Tajikistan", "طاجيكستان"],
  ["TZ", "+255", "Tanzania", "تنزانيا"],
  ["TH", "+66", "Thailand", "تايلاند"],
  ["TL", "+670", "Timor-Leste", "تيمور الشرقية"],
  ["TG", "+228", "Togo", "توغو"],
  ["TO", "+676", "Tonga", "تونغا"],
  ["TT", "+1868", "Trinidad & Tobago", "ترينيداد وتوباغو"],
  ["TN", "+216", "Tunisia", "تونس"],
  ["TR", "+90", "Türkiye", "تركيا"],
  ["TM", "+993", "Turkmenistan", "تركمانستان"],
  ["TV", "+688", "Tuvalu", "توفالو"],
  ["UG", "+256", "Uganda", "أوغندا"],
  ["UA", "+380", "Ukraine", "أوكرانيا"],
  ["AE", "+971", "United Arab Emirates", "الإمارات"],
  ["GB", "+44", "United Kingdom", "بريطانيا"],
  ["US", "+1", "United States", "الولايات المتحدة"],
  ["UY", "+598", "Uruguay", "أوروغواي"],
  ["UZ", "+998", "Uzbekistan", "أوزبكستان"],
  ["VU", "+678", "Vanuatu", "فانواتو"],
  ["VE", "+58", "Venezuela", "فنزويلا"],
  ["VN", "+84", "Vietnam", "فيتنام"],
  ["YE", "+967", "Yemen", "اليمن"],
  ["ZM", "+260", "Zambia", "زامبيا"],
  ["ZW", "+263", "Zimbabwe", "زيمبابوي"],
];

export const DIAL_CODES: DialCodeInfo[] = RAW
  .map(([iso, code, name, nameAr]) => ({ iso, code, name, nameAr, flag: flagOfIso(iso) }))
  .sort((a, b) => a.name.localeCompare(b.name, "en"));

/** الأكثر استعمالاً في عيادات العراق — تُعرض بأعلى القائمة بلا بحث. */
export const POPULAR_ISO = ["IQ", "AE", "SA", "KW", "QA", "BH", "OM", "JO", "LB", "SY", "EG", "TR", "IR", "US", "GB", "DE", "SE"];

export const POPULAR_CODES: DialCodeInfo[] = POPULAR_ISO
  .map((iso) => DIAL_CODES.find((d) => d.iso === iso)!)
  .filter(Boolean);

/** اسم الدولة بلغة الواجهة. */
export const dialName = (d: DialCodeInfo, lang: string): string => (lang.startsWith("ar") ? d.nameAr : d.name);

/** Split a stored phone into its country code (best match) and national digits. */
export function parsePhone(value: string, fallbackCode: string): { code: string; national: string } {
  const v = (value || "").trim();
  const d = v.replace(/\D/g, "");
  if (!d) return { code: fallbackCode, national: "" };
  // Match the longest known code that prefixes the digits — يضمن أن «+1868»
  // (ترينيداد) تسبق «+1» بالمطابقة فلا يُقرأ رقمها كأميركي.
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
