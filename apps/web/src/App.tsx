import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { useAuth } from "./store";
import { Shell } from "./components/Shell";
import { Loading } from "./components/Spinner";
import { DashboardPage } from "./pages/Dashboard";
import { ImportPage } from "./pages/Import";
import { LoginPage } from "./pages/Login";
import { OrderDetailPage, OrdersPage } from "./pages/Orders";
import { ReportsPage } from "./pages/Reports";
import { TaskDetailPage } from "./pages/TaskDetail";
import { TasksPage } from "./pages/Tasks";
import { UsersPage } from "./pages/Users";

function Protected({ children, admin = false }: { children: ReactNode; admin?: boolean }) {
  const user = useAuth((state) => state.user);
  const ready = useAuth((state) => state.ready);
  if (!ready && !user) return <Loading screen />;
  if (!user) return <Navigate to="/login" replace />;
  if (admin && user.role !== "ADMIN") return <Navigate to="/" replace />;
  return <Shell>{children}</Shell>;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<Protected><DashboardPage /></Protected>} />
      <Route path="/tasks" element={<Protected><TasksPage /></Protected>} />
      <Route path="/my-tasks" element={<Protected><TasksPage mine /></Protected>} />
      <Route path="/tasks/:id" element={<Protected><TaskDetailPage /></Protected>} />
      <Route path="/orders" element={<Protected><OrdersPage /></Protected>} />
      <Route path="/orders/:id" element={<Protected><OrderDetailPage /></Protected>} />
      <Route path="/import" element={<Protected><ImportPage /></Protected>} />
      <Route path="/reports" element={<Protected><ReportsPage /></Protected>} />
      <Route path="/team" element={<Protected admin><UsersPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
