import { lazy, Suspense, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { isAppHost } from "@/lib/appUrl";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { CommandPaletteProvider } from "@/components/CommandPaletteProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RoleSelect } from "@/components/RoleSelect";
import { SubscriptionGate } from "@/components/SubscriptionGate";
import { FeatureGate } from "@/components/FeatureGate";
import { useSubscription } from "@/lib/subscription";
import { Spinner } from "@/components/ui";

// Route-level code splitting — each page is its own chunk.
const Login = lazy(() => import("@/pages/Login").then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const OwnerDashboard = lazy(() => import("@/pages/OwnerDashboard").then((m) => ({ default: m.OwnerDashboard })));
const PetPassport = lazy(() => import("@/pages/PetPassport").then((m) => ({ default: m.PetPassport })));
const VisitPage = lazy(() => import("@/pages/VisitPage"));
const ScanChart = lazy(() => import("@/pages/ScanChart").then((m) => ({ default: m.ScanChart })));
const BookingWizard = lazy(() => import("@/pages/BookingWizard").then((m) => ({ default: m.BookingWizard })));
const Reception = lazy(() => import("@/pages/Reception").then((m) => ({ default: m.Reception })));
const Consultation = lazy(() => import("@/pages/Consultation").then((m) => ({ default: m.Consultation })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.Settings })));
const ActivityLog = lazy(() => import("@/pages/ActivityLog").then((m) => ({ default: m.ActivityLog })));
const ClinicRecords = lazy(() => import("@/pages/ClinicRecords").then((m) => ({ default: m.ClinicRecords })));
const NewCase = lazy(() => import("@/pages/NewCase").then((m) => ({ default: m.NewCase })));
const Inventory = lazy(() => import("@/pages/Inventory").then((m) => ({ default: m.Inventory })));
const RetailSales = lazy(() => import("@/pages/RetailSales").then((m) => ({ default: m.RetailSales })));
const WhatsAppCampaigns = lazy(() => import("@/pages/WhatsAppCampaigns").then((m) => ({ default: m.WhatsAppCampaigns })));
const StaffManagement = lazy(() => import("@/pages/StaffManagement").then((m) => ({ default: m.StaffManagement })));
const AnalyticsHub = lazy(() => import("@/pages/AnalyticsHub").then((m) => ({ default: m.AnalyticsHub })));
const JoinClinic = lazy(() => import("@/pages/JoinClinic").then((m) => ({ default: m.JoinClinic })));
const Landing = lazy(() => import("@/pages/Landing").then((m) => ({ default: m.Landing })));
const Subscribe = lazy(() => import("@/pages/Subscribe").then((m) => ({ default: m.Subscribe })));
const AdminBilling = lazy(() => import("@/pages/AdminBilling").then((m) => ({ default: m.AdminBilling })));

function FullScreenLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Spinner size={32} />
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
  return <main className="pb-20">{children}</main>;
}

/** /login is for logged-OUT users only. If a session is already active — e.g. the
 *  profile loaded a beat after sign-in, an OTP verify just succeeded, or the user
 *  opened /login with a live session — send them home instead of stranding them on
 *  the form (which would otherwise re-mount on its default tab and look "stuck"). */
function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return <FullScreenLoader />;
  if (user) return <Navigate to="/" replace />;
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

/** Shown when the signed-in user is working inside ANOTHER clinic they joined —
 *  gives a one-tap way back to their own workspace (their data is only hidden). */
function OtherClinicBanner() {
  const { t } = useTranslation();
  const { inAnotherClinic, leaveClinic } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!inAnotherClinic) return null;
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-warn-200 bg-warn-50 px-4 py-2 text-center text-sm font-medium text-warn-800 no-print dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200">
      <span>{t("app.otherClinicNote")}</span>
      <button
        onClick={async () => { setBusy(true); const r = await leaveClinic(); if (r.error) setBusy(false); }}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-full bg-warn-600 px-3.5 py-1 text-xs font-bold text-white shadow-soft transition hover:bg-warn-700 disabled:opacity-60"
      >
        {busy ? t("app.leaving") : t("app.leaveClinic")}
      </button>
    </div>
  );
}

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

function Shell() {
  const location = useLocation();
  const { user, needsRoleChoice } = useAuth();
  const { access: subAccess } = useSubscription();

  // A multi-role account must pick a workspace before anything else renders.
  if (user && needsRoleChoice) return <RoleSelect />;

  const showChrome = !!user && location.pathname !== "/login";
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
            <Route path="/consult/:petId" element={<Protected><Consultation /></Protected>} />
            <Route path="/records" element={<Protected><ClinicRecords /></Protected>} />
            <Route path="/new-case" element={<Protected><NewCase /></Protected>} />
            <Route path="/inventory" element={<Protected><ClinicOnly><Inventory /></ClinicOnly></Protected>} />
            <Route path="/retail" element={<Protected><ClinicOnly><FeatureGate feature="pos"><RetailSales /></FeatureGate></ClinicOnly></Protected>} />
            <Route path="/campaigns" element={<Protected><ClinicOnly><FeatureGate feature="whatsapp"><WhatsAppCampaigns /></FeatureGate></ClinicOnly></Protected>} />
            <Route path="/staff" element={<Protected><ClinicOnly><StaffManagement /></ClinicOnly></Protected>} />
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
          <div className="lg:ps-64"><OtherClinicBanner /><SubscriptionGate>{routes}</SubscriptionGate></div>
        </CommandPaletteProvider>
        <DemoBanner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {showChrome && <TopBar />}
      {showChrome && <OtherClinicBanner />}
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
          <Shell />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
