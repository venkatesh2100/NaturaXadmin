import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";
import { useAuth } from "../auth";

const links = [
  { to: "/", label: "Overview", end: true },
  { to: "/tasks", label: "Task queue" },
  { to: "/orders", label: "Orders" },
  { to: "/import", label: "Import" },
  { to: "/reports", label: "Daily report" },
  { to: "/impact", label: "Impact" },
];

export function Shell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen md:grid md:grid-cols-[240px_1fr]">
      <aside className="bg-moss text-stone-100 md:min-h-screen">
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-sm font-semibold">VN</span>
          <div>
            <p className="text-sm font-semibold tracking-tight">VitaNatura</p>
            <p className="text-xs text-stone-400">Order follow-up</p>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:block md:space-y-1 md:px-3">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `block whitespace-nowrap rounded-lg px-3 py-2 text-sm ${isActive ? "bg-white/10 text-white" : "text-stone-300 hover:bg-white/5"}`
              }
            >
              {link.label}
            </NavLink>
          ))}
          {user?.role === "ADMIN" && (
            <NavLink
              to="/team"
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm ${isActive ? "bg-white/10 text-white" : "text-stone-300 hover:bg-white/5"}`
              }
            >
              Team
            </NavLink>
          )}
        </nav>
        <div className="hidden border-t border-white/10 px-5 py-4 md:block md:mt-6">
          <p className="text-sm font-medium">{user?.name}</p>
          <p className="text-xs text-stone-400">{user?.role === "ADMIN" ? "Admin" : "Employee"}</p>
          <button
            className="mt-3 text-sm text-stone-300 underline-offset-2 hover:underline"
            onClick={() => void logout().then(() => navigate("/login"))}
          >
            Sign out
          </button>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
          <p className="text-sm font-medium">{user?.name}</p>
          <button className="text-sm underline" onClick={() => void logout().then(() => navigate("/login"))}>
            Sign out
          </button>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {detail && <p className="mt-1 max-w-2xl text-sm text-stone-600">{detail}</p>}
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="rounded-xl border border-line bg-white px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <p className="tabular mt-2 text-2xl font-semibold">{value}</p>
      {hint && <p className="mt-1 text-xs text-stone-500">{hint}</p>}
    </div>
  );
}

export function Banner({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-stone-500">{children}</div>;
}

export function PriorityMark({ priority }: { priority: string }) {
  const tone = priority === "HIGH" ? "bg-red-700" : priority === "MEDIUM" ? "bg-amber-600" : "bg-stone-400";
  return (
    <span className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
      <span className={`h-2 w-2 rounded-sm ${tone}`} />
      {priority.toLowerCase()}
    </span>
  );
}

export function StatusText({ status }: { status: string }) {
  return <span className="text-sm">{status === "IN_PROGRESS" ? "In progress" : status === "OPEN" ? "Open" : "Resolved"}</span>;
}
