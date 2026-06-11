import { lazy, Suspense, type ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { TopBar } from "@/components/TopBar";
import { Sidebar } from "@/components/Sidebar";
import { CommandPaletteProvider } from "@/components/CommandPaletteProvider";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { RoleSelect } from "@/components/RoleSelect";
import { Spinner } from "@/components/ui";
import { pageVariants } from "@/lib/motion";

// Route-level code splitting — each page is its own chunk.
const Login = lazy(() => import("@/pages/Login").then((m) => ({ default: m.Login })));
const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const OwnerDashboard = lazy(() => import("@/pages/OwnerDashboard").then((m) => ({ default: m.OwnerDashboard })));
const PetPassport = lazy(() => import("@/pages/PetPassport").then((m) => ({ default: m.PetPassport })));
const ScanChart = lazy(() => import("@/pages/ScanChart").then((m) => ({ default: m.ScanChart })));
const BookingWizard = lazy(() => import("@/pages/BookingWizard").then((m) => ({ default: m.BookingWizard })));
const Reception = lazy(() => import("@/pages/Reception").then((m) => ({ default: m.Reception })));
const Consultation = lazy(() => import("@/pages/Consultation").then((m) => ({ default: m.Consultation })));
const Settings = lazy(() => import("@/pages/Settings").then((m) => ({ default: m.Settings })));
const ClinicRecords = lazy(() => import("@/pages/ClinicRecords").then((m) => ({ default: m.ClinicRecords })));
const NewCase = lazy(() => import("@/pages/NewCase").then((m) => ({ default: m.NewCase })));

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
  return (
    <motion.main variants={pageVariants} initial="initial" animate="animate" exit="exit" className="pb-20">
      {children}
    </motion.main>
  );
}

function DemoBanner() {
  const { demo } = useAuth();
  if (!demo) return null;
  return (
    <div className="fixed bottom-0 inset-x-0 z-30 border-t border-warn-200 bg-warn-50/90 py-1.5 text-center text-xs font-medium text-warn-700 backdrop-blur no-print dark:bg-warn-500/10 dark:text-warn-200">
      VetPassport · Demo mode
    </div>
  );
}

function Home() {
  const { user } = useAuth();
  if (user?.role === "owner") return <OwnerDashboard />;
  return <Dashboard />;
}

function Shell() {
  const location = useLocation();
  const { user, needsRoleChoice } = useAuth();

  // A multi-role account must pick a workspace before anything else renders.
  if (user && needsRoleChoice) return <RoleSelect />;

  const showChrome = !!user && location.pathname !== "/login";
  const staff = !!user && (user.role === "admin" || user.role === "doctor" || user.role === "reception");

  const routes = (
    // Keyed by path so navigating to another page clears a page-level crash —
    // one broken screen can never trap the user.
    <ErrorBoundary key={location.pathname} scope="route">
      <Suspense fallback={<FullScreenLoader />}>
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<Protected><Home /></Protected>} />
            <Route path="/pet/:petId" element={<Protected><PetPassport /></Protected>} />
            <Route path="/book" element={<Protected><BookingWizard /></Protected>} />
            <Route path="/scan" element={<Protected><ScanChart /></Protected>} />
            <Route path="/reception" element={<Protected><Reception /></Protected>} />
            <Route path="/consult/:petId" element={<Protected><Consultation /></Protected>} />
            <Route path="/records" element={<Protected><ClinicRecords /></Protected>} />
            <Route path="/new-case" element={<Protected><NewCase /></Protected>} />
            <Route path="/settings" element={<Protected><Settings /></Protected>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AnimatePresence>
      </Suspense>
    </ErrorBoundary>
  );

  // Staff get a desktop sidebar rail (mobile keeps the top bar); owners/login keep the top bar only.
  if (showChrome && staff) {
    return (
      <div className="min-h-screen bg-surface">
        <CommandPaletteProvider>
          <Sidebar />
          <TopBar mobileOnly />
          <div className="lg:ps-64">{routes}</div>
        </CommandPaletteProvider>
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
          <Shell />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
