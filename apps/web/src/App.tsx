import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AppShell } from "./components/AppShell";
import { LandingDiscoveryPage } from "./pages/LandingDiscoveryPage";
import { AuthPage } from "./pages/AuthPage";
import { OrganizerWorkspace } from "./pages/OrganizerWorkspace";
import { VendorConsole } from "./pages/VendorConsole";
import { AdminDesk } from "./pages/AdminDesk";

function ProtectedRoute({
  allowedRoles,
  children,
}: {
  allowedRoles: string[];
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  if (loading) {
    return <div className="p-10 text-center text-sm text-muted">Restoring EventKit session...</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!allowedRoles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppShell>
          <Routes>
            <Route path="/" element={<LandingDiscoveryPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route
              path="/organizer"
              element={
                <ProtectedRoute allowedRoles={["ORGANIZER"]}>
                  <OrganizerWorkspace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vendor"
              element={
                <ProtectedRoute allowedRoles={["VENDOR"]}>
                  <VendorConsole />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute allowedRoles={["ADMIN"]}>
                  <AdminDesk />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
