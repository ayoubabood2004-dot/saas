import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { isAppHost } from "@/lib/appUrl";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { CommandPaletteProvider } from "@/components/CommandPaletteProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RoleSelect } from "@/components/RoleSelect";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { FeatureGate } from "@/components/FeatureGate";
import { Assistant } from "@/components/Assistant";
import { useSubscription } from "@/lib/subscription";
import { Spinner, useToast } from "@/components/ui";
import { repo } from "@/lib/repo";
import { retryImport } from "@/lib/appUpdate";
import { useNavFolded } from "@/lib/navFold";

/** كل صفحة كسولة تمر من هنا: لو فشل تحميلها لأن الجهاز ماسك قشرة قديمة بعد
 *  نشر جديد، يُمسح المخبأ وتُجلب النسخة الجديدة تلقائياً — مرة واحدة. */
const page: typeof lazy = (load) => lazy(() => retryImport(load));

// Route-level code splitting — each page is its own chunk.
const Login = page(() => import("@/pages/Login").then((m) => ({ default: m.Login })));
const Dashboard = page(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const OwnerDashboard = page(() => import("@/pages/OwnerDashboard").then((m) => ({ default: m.OwnerDashboard })));
const PetPassport = page(() => import("@/pages/PetPassport").then((m) => ({ default: m.PetPassport })));
const VisitPage = page(() => import("@/pages/VisitPage"));
const ScanChart = page(() => import("@/pages/ScanChart").then((m) => ({ default: m.ScanChart })));
const BookingWizard = page(() => import("@/pages/BookingWizard").then((m) => ({ default: m.BookingWizard })));
const Reception = page(() => import("@/pages/Reception").then((m) => ({ default: m.Reception })));
const Consultation = page(() => import("@/pages/Consultation").then((m) => ({ default: m.Consultation })));
const Settings = page(() => import("@/pages/Settings").then((m) => ({ default: m.Settings })));
const ActivityLog = page(() => import("@/pages/ActivityLog").then((m) => ({ default: m.ActivityLog })));
const ClinicRecords = page(() => import("@/pages/ClinicRecords").then((m) => ({ default: m.ClinicRecords })));
const Charts = page(() => import("@/pages/Charts").then((m) => ({ default: m.Charts })));
const SurgeriesHub = page(() => import("@/pages/SurgeriesHub").then((m) => ({ default: m.SurgeriesHub })));
const NewCase = page(() => import("@/pages/NewCase").then((m) => ({ default: m.NewCase })));
const Inventory = page(() => import("@/pages/Inventory").then((m) => ({ default: m.Inventory })));
const RetailSales = page(() => import("@/pages/RetailSales").then((m) => ({ default: m.RetailSales })));
const WhatsAppCampaigns = page(() => import("@/pages/WhatsAppCampaigns").then((m) => ({ default: m.WhatsAppCampaigns })));
const RemindersHub = page(() => import("@/pages/RemindersHub").then((m) => ({ default: m.RemindersHub })));
const BookingsHub = page(() => import("@/pages/BookingsHub").then((m) => ({ default: m.BookingsHub })));
const StaffManagement = page(() => import("@/pages/StaffManagement").then((m) => ({ default: m.StaffManagement })));
const Payroll = page(() => import("@/pages/Payroll").then((m) => ({ default: m.Payroll })));
const AnalyticsHub = page(() => import("@/pages/AnalyticsHub").then((m) => ({ default: m.AnalyticsHub })));
const JoinClinic = page(() => import("@/pages/JoinClinic").then((m) => ({ default: m.JoinClinic })));
const Landing = page(() => import("@/pages/Landing").then((m) => ({ default: m.Landing })));
const Subscribe = page(() => import("@/pages/Subscribe").then((m) => ({ default: m.Subscribe })));
const AdminBilling = page(() => import("@/pages/AdminBilling").then((m) => ({ default: m.AdminBilling })));
const ClinicStore = page(() => import("@/pages/ClinicStore").then((m) => ({ default: m.ClinicStore })));
const Storefront = page(() => import("@/pages/Storefront").then((m) => ({ default: m.Storefront })));
const TrackJourney = page(() => import("@/pages/TrackJourney").then((m) => ({ default: m.TrackJourney })));
// العرض المجسّم للأقفاص — كسول عمداً: three.js لا يُحمَّل إلا عند فتح الصفحة.
const Cage3DDemo = page(() => import("@/components/cage3d/Cage3DDemo"));

function FullScreenLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Spinner size={32} />
    </div>
  );
}

/** المشهد المجسّم ملف ثقيل (three.js) يُنزَّل عند أول فتح فقط. دوّارة صامتة
 *  هنا تبدو «معلّقة» — فنقول للطبيب صراحةً شنو يصير، وإذا طال الانتظار فوق
 *  ١٢ ثانية نعطيه مخرجاً واضحاً بدل ما يبقى محبوساً بشاشة تحميل أبدية. */
function Cage3DLoading() {
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), 12000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-6" style={{ background: "#0a0910" }} dir="rtl">
      {stuck ? (
        <div className="w-80 rounded-2xl p-5 text-center"
          style={{ background: "#0e1a2ecc", border: "1px solid #16324a" }}>
          <p className="text-3xl">🐾</p>
          <h1 className="mt-2 text-sm font-black" style={{ color: "#eaf6ff" }}>ما كدرنا نفتح العرض المجسّم</h1>
          <p className="mt-1.5 text-xs font-bold leading-relaxed" style={{ color: "#8fa8bd" }}>
            المشهد ثقيل وقد لا يكمل تحميله على كل جهاز أو شبكة. خريطة الأقفاص المسطّحة
            تعطيك نفس الإدارة كاملة (سحب، تبادل، تسجيل النقلات) وتفتح فوراً.
          </p>
          <div className="mt-4 grid gap-2">
            <a href="/charts" className="grid h-9 place-items-center rounded-lg text-xs font-black"
              style={{ background: "#22d3ee", color: "#04222b" }}>
              فتح خريطة الأقفاص
            </a>
            <button type="button" onClick={() => window.location.reload()}
              className="h-9 rounded-lg text-xs font-extrabold"
              style={{ background: "#12253a", color: "#9fdcef", border: "1px solid #164e63" }}>
              إعادة المحاولة
            </button>
          </div>
        </div>
      ) : (
        <div className="text-center">
          <Spinner size={30} />
          <p className="mt-3 text-sm font-black" style={{ color: "#9fdcef" }}>نجهّز العرض المجسّم…</p>
          <p className="mt-1 text-[11px] font-bold" style={{ color: "#64809c" }}>
            أول فتح ينزّل المشهد مرة واحدة — بعدها يفتح فوراً
          </p>
        </div>
      )}
    </div>
  );
}

function Protected({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (!user) return <Navigate to="/login" replace />;
  // No enter animation on route content — a native-app feel: the moment you
  // click, the page is simply THERE at full opacity, not fading in. Combined
  // with preloaded chunks + a warm data cache, navigation has no perceptible load.
  // pb-20 فسحة شريط التنقّل السفلي — وهو مخفي على الشاشات الواسعة، فالفسحة
  // هناك ٨٠px مهدورة من كل صفحة (اكتشفها قياس شاشة البيع: السلة كانت تقف
  // قبل حافة الشاشة بـ٨١px بلا سبب).
  return <main className="pb-20 lg:pb-0">{children}</main>;
}

/** /login is for logged-OUT users only. If a session is already active — e.g. the
 *  profile loaded a beat after sign-in, an OTP verify just succeeded, or the user
 *  opened /login with a live session — send them home instead of stranding them on
 *  the form (which would otherwise re-mount on its default tab and look "stuck"). */
function LoginRoute() {
  const { user, loading, recovery } = useAuth();
  if (loading) return <FullScreenLoader />;
  // رابط «نسيت كلمة المرور» يسجّل دخولاً مؤقتاً — لولا هذا الشرط لطُرد المستخدم
  // إلى الرئيسية قبل أن يرى نموذج تعيين كلمة المرور الجديدة.
  if (user && !recovery) return <Navigate to="/" replace />;
  return <Login />;
}

/** Clinic-staff-only route — pet owners are bounced to their dashboard. */
function ClinicOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const staff = !!user && (user.role === "admin" || user.role === "doctor" || user.role === "reception");
  if (!staff) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function DemoBanner() {
  const { demo } = useAuth();
  if (!demo) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-30 border-t border-warn-200 bg-warn-50/90 py-1.5 text-center text-xs font-medium text-warn-700 backdrop-blur no-print dark:bg-warn-500/10 dark:text-warn-200">
      doctorVet · Demo mode
    </div>
  );
}

/** أعمال منزلية صامتة تركض مرة عند فتح جلسة كادر:
 *  ١. تحذير امتلاء مساحة التجربة — saveDB يعلن الحدث لمّا localStorage يرفض
 *     الكتابة؛ بلا هذا التوست كان المستخدم التجريبي يفقد بياناته بصمت.
 *  ٢. تنظيف سجل الحركات (احتفاظ ٣٠ يوماً) — كان يركض فقط عند فتح صفحة السجل،
 *     فعيادة لا تفتحها لا يُنظَّف سجلها أبداً. هنا يركض مرة كل يوم كحد أقصى. */
function Housekeeping() {
  const toast = useToast();
  const { user } = useAuth();
  const warned = useRef(false);

  useEffect(() => {
    const onQuotaFull = () => {
      if (warned.current) return;
      warned.current = true;
      toast.error("مساحة التجربة امتلأت", "آخر تغيير ما انحفظ — احذف صوراً أو بيانات قديمة، أو اشترك لتخزين سحابي بلا حدود.");
    };
    window.addEventListener("vp:demo-quota-full", onQuotaFull);
    return () => window.removeEventListener("vp:demo-quota-full", onQuotaFull);
  }, [toast]);

  const staff = !!user && (user.role === "admin" || user.role === "doctor" || user.role === "reception");
  useEffect(() => {
    if (!staff) return;
    const KEY = "vp_audit_purged_at";
    try {
      const last = Number(localStorage.getItem(KEY) || 0);
      if (Date.now() - last < 86_400_000) return;
      localStorage.setItem(KEY, String(Date.now()));
    } catch { /* بلا localStorage نكتفي بمرة لكل تحميل صفحة */ }
    void repo.purgeAuditLog().catch(() => {});
  }, [staff]);

  return null;
}

/* "Leave clinic" moved into Settings → "عضوية العيادة" (deliberate, confirmed
   action) — the old always-on top banner was easy to hit by accident. */

function Home() {
  const { user } = useAuth();
  if (user?.role === "owner") return <OwnerDashboard />;
  return <Dashboard />;
}

/** The root route `/`.
 *  • Signed in → the app home (dashboard).
 *  • Signed out on the app subdomain → the login front door.
 *  • Signed out on the root/marketing domain → the public landing page.
 *  This keeps the app fully reachable even before the subdomain split exists. */
function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Home />;
  if (isAppHost()) return <Navigate to="/login" replace />;
  return <Landing />;
}

/** حشوة المحتوى تتبع عرض الشريط لحظةً بلحظة — الطيّ يوسّع الصفحة بلا قفزة. */
function ShellMain({ children }: { children: React.ReactNode }) {
  const folded = useNavFolded();
  return <div className={folded ? "lg:ps-[4.75rem]" : "lg:ps-64"}><SubscriptionGate>{children}</SubscriptionGate></div>;
}

function Shell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, needsRoleChoice, recovery } = useAuth();
  const { access: subAccess } = useSubscription();

  // رابط استعادة كلمة المرور قد يهبط على أي صفحة (حسب إعدادات Supabase) —
  // أول ما يشتغل وضع الاستعادة نوجّه المستخدم مرة واحدة إلى نموذج التعيين.
  // مرة واحدة فقط: لو غادر النموذج عمداً لا نحاصره فيه.
  const sentToReset = useRef(false);
  useEffect(() => {
    if (!recovery) { sentToReset.current = false; return; }
    if (!sentToReset.current && location.pathname !== "/login") {
      sentToReset.current = true;
      navigate("/login", { replace: true });
    }
  }, [recovery, location.pathname, navigate]);

  // A multi-role account must pick a workspace before anything else renders.
  if (user && needsRoleChoice) return <RoleSelect />;

  // الستور العام (/s/…) صفحة زبون قائمة بذاتها — بلا سايدبار ولا توب-بار حتى
  // لو فتحها كادر مسجّل، لأنها تعرض كما يراها الزبون تماماً.
  const isPublicStore = location.pathname.startsWith("/s/") || location.pathname.startsWith("/t/");
  const showChrome = !!user && location.pathname !== "/login" && !isPublicStore;
  const staff = !!user && (user.role === "admin" || user.role === "doctor" || user.role === "reception");

  const routes = (
    // Keyed by path so navigating to another page clears a page-level crash —
    // one broken screen can never trap the user.
    <ErrorBoundary key={location.pathname} scope="route">
      <Suspense fallback={<FullScreenLoader />}>
        {/* No AnimatePresence/mode="wait" here: it held the incoming page back
            until the outgoing one finished animating out. The route subtree is
            keyed by pathname (via ErrorBoundary) so the new page mounts and
            plays its fast enter immediately. */}
          <Routes location={location} key={location.pathname}>
            <Route path="/login" element={<LoginRoute />} />
            <Route path="/join" element={<JoinClinic />} />
            <Route path="/" element={<HomeRoute />} />
            <Route path="/pet/:petId" element={<Protected><PetPassport /></Protected>} />
            <Route path="/pet/:petId/visit/:visitId" element={<Protected><VisitPage /></Protected>} />
            <Route path="/book" element={<Protected><BookingWizard /></Protected>} />
            <Route path="/scan" element={<Protected><ScanChart /></Protected>} />
            <Route path="/reception" element={<Protected><Reception /></Protected>} />
            <Route path="/charts" element={<Protected><ClinicOnly><Charts /></ClinicOnly></Protected>} />
            <Route path="/cage3d" element={<Protected><ClinicOnly><Suspense fallback={<Cage3DLoading />}><Cage3DDemo /></Suspense></ClinicOnly></Protected>} />
            <Route path="/surgeries" element={<Protected><ClinicOnly><SurgeriesHub /></ClinicOnly></Protected>} />
            <Route path="/consult/:petId" element={<Protected><Consultation /></Protected>} />
            <Route path="/records" element={<Protected><ClinicRecords /></Protected>} />
            <Route path="/new-case" element={<Protected><NewCase /></Protected>} />
            <Route path="/inventory" element={<Protected><ClinicOnly><Inventory /></ClinicOnly></Protected>} />
            <Route path="/retail" element={<Protected><ClinicOnly><FeatureGate feature="pos"><RetailSales /></FeatureGate></ClinicOnly></Protected>} />
            <Route path="/store" element={<Protected><ClinicOnly><FeatureGate feature="store"><ClinicStore /></FeatureGate></ClinicOnly></Protected>} />
            {/* الستور العام — صفحة الزبون بلا تسجيل، خارج كل الحُرّاس عمداً */}
            <Route path="/s/:slug" element={<Storefront />} />
            <Route path="/t/:token" element={<TrackJourney />} />
            <Route path="/campaigns" element={<Protected><ClinicOnly><FeatureGate feature="whatsapp"><WhatsAppCampaigns /></FeatureGate></ClinicOnly></Protected>} />
            <Route path="/reminders" element={<Protected><ClinicOnly><FeatureGate feature="whatsapp"><RemindersHub /></FeatureGate></ClinicOnly></Protected>} />
            <Route path="/bookings" element={<Protected><ClinicOnly><BookingsHub /></ClinicOnly></Protected>} />
            <Route path="/staff" element={<Protected><ClinicOnly><StaffManagement /></ClinicOnly></Protected>} />
            <Route path="/payroll" element={<Protected><ClinicOnly><FeatureGate feature="payroll"><Payroll /></FeatureGate></ClinicOnly></Protected>} />
            <Route path="/reports" element={<Protected><ClinicOnly><FeatureGate feature="reports"><AnalyticsHub /></FeatureGate></ClinicOnly></Protected>} />
            <Route path="/activity" element={<Protected><ClinicOnly><ActivityLog /></ClinicOnly></Protected>} />
            <Route path="/settings" element={<Protected><Settings /></Protected>} />
            <Route path="/subscribe" element={<Protected><Subscribe /></Protected>} />
            <Route path="/admin" element={<Protected><AdminBilling /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
      </Suspense>
    </ErrorBoundary>
  );

  // Staff get a desktop sidebar rail (mobile keeps the top bar); owners/login keep the top bar only.
  if (showChrome && staff) {
    // A clinic whose subscription never started (trial over, never paid) has the
    // whole app hidden — only the subscribe screen, no sidebar. The gate forces
    // the redirect; here we just drop the chrome so nothing else is reachable.
    if (subAccess === "blocked") {
      return (
        <div className="min-h-screen bg-surface">
          <TopBar minimal />
          <SubscriptionGate>{routes}</SubscriptionGate>
          <DemoBanner />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-surface">
        <CommandPaletteProvider>
          <Sidebar />
          <TopBar mobileOnly />
          <ShellMain>{routes}</ShellMain>
        </CommandPaletteProvider>
        {/* المساعد الذكي — حاضر بكل شاشات كادر العيادة */}
        <Assistant />
        <DemoBanner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {showChrome && <TopBar />}
      {routes}
      {showChrome && <DemoBanner />}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary scope="app">
      <AuthProvider>
        <BrowserRouter>
          <Housekeeping />
          <Shell />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
