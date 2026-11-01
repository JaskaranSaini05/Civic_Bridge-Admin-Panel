import { Component, Suspense, lazy, useEffect, type ErrorInfo, type ReactNode } from "react";
import {
  BrowserRouter,
  Link,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AlertTriangle, Compass, Loader2, RotateCw } from "lucide-react";

import AdminLogin from "./pages/AdminLogin";
import AdminLayout from "./components/layout/AdminLayout";
import ProtectedRoute from "./routes/ProtectedRoute";

const Dashboard = lazy(() => import("./pages/Dashboard"));
const Complaints = lazy(() => import("./pages/Complaints"));
const Technicians = lazy(() => import("./pages/Technicians"));
const Departments = lazy(() => import("./pages/Departments"));
const Reports = lazy(() => import("./pages/Reports"));

function PageLoader() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center" role="status">
      <Loader2 className="h-6 w-6 animate-spin text-teal-700" aria-label="Loading page" />
    </div>
  );
}

function StatusScreen({
  icon,
  title,
  message,
  children,
}: {
  icon: ReactNode;
  title: string;
  message: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-teal-50 text-teal-700">
          {icon}
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-500">{message}</p>
        <div className="mt-6 flex justify-center gap-3">{children}</div>
      </div>
    </div>
  );
}

const primaryButton =
  "inline-flex items-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-900 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-teal-200";

function NotFound() {
  return (
    <StatusScreen
      icon={<Compass className="h-6 w-6" aria-hidden />}
      title="Page not found"
      message="The page you're looking for doesn't exist or has been moved."
    >
      <Link to="/admin/dashboard" className={primaryButton}>
        Go to dashboard
      </Link>
    </StatusScreen>
  );
}

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Admin page crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <StatusScreen
        icon={<AlertTriangle className="h-6 w-6" aria-hidden />}
        title="This page couldn't load"
        message="Something went wrong while showing this page. Reload to try again."
      >
        <button type="button" onClick={() => window.location.reload()} className={primaryButton}>
          <RotateCw className="h-4 w-4" aria-hidden />
          Reload page
        </button>
      </StatusScreen>
    );
  }
}

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return null;
}

function AdminShell() {
  const { pathname } = useLocation();

  return (
    <ProtectedRoute>
      <AdminLayout>
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </AdminLayout>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Navigate to="/admin/login" replace />} />
        <Route path="/admin/login" element={<AdminLogin />} />

        <Route path="/admin" element={<AdminShell />}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="complaints" element={<Complaints />} />
          <Route path="technicians" element={<Technicians />} />
          <Route path="departments" element={<Departments />} />
          <Route path="reports" element={<Reports />} />
          <Route path="*" element={<NotFound />} />
        </Route>

        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}