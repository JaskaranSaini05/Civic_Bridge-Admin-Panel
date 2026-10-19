import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import AdminLogin from "./pages/AdminLogin";
import Dashboard from "./pages/Dashboard";
import Complaints from "./pages/Complaints";
import Technicians from "./pages/technicians";
import Departments from "./pages/Departments";
import DepartmentsComplaints from "./pages/Reports";

import AdminLayout from "./components/layout/AdminLayout";
import ProtectedRoute from "./routes/ProtectedRoute";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Default Redirect */}
        <Route path="/" element={<Navigate to="/admin/login" replace />} />

        {/* Login */}
        <Route path="/admin/login" element={<AdminLogin />} />

        {/* Dashboard */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <Dashboard />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Complaints */}
        <Route
          path="/admin/complaints"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <Complaints />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Technicians */}
        <Route
          path="/admin/technicians"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <Technicians />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Departments */}
        <Route
          path="/admin/departments"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <Departments />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Reports */}
        <Route
          path="/admin/reports"
          element={
            <ProtectedRoute>
              <AdminLayout>
                <DepartmentsComplaints />
              </AdminLayout>
            </ProtectedRoute>
          }
        />

        {/* Fallback */}
        <Route path="*" element={<Navigate to="/admin/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
