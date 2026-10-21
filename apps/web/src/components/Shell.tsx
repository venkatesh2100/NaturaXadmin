import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router";
import { useAuth } from "../store";

const links = [
  { to: "/", label: "Today", end: true },
  { to: "/tasks", label: "Tasks" },
  { to: "/orders", label: "Orders" },
  { to: "/import", label: "Import" },
  { to: "/reports", label: "Report" },
];

export function buttonClass(kind: "primary" | "secondary" = "secondary") {
  if (kind === "primary") return "inline-flex items-center rounded-[9px] bg-ink px-4 py-2 text-[13px] font-medium text-white disabled:opacity-25";
  return "inline-flex items-center rounded-[9px] border border-line bg-white px-4 py-2 text-[13px] font-medium text-ink hover:bg-paper disabled:opacity-50";
}

function itemClass(active: boolean) {
  return `block whitespace-nowrap rounded-[9px] px-3 py-1.5 text-sm ${active ? "bg-chip font-medium text-ink" : "text-secondary hover:bg-paper"}`;
}

export function Shell({ children }: { children: ReactNode }) {
  const user = useAuth((state) => state.user);
  const logout = useAuth((state) => state.logout);
  const navigate = useNavigate();
  const signOut = () => void logout().then(() => navigate("/login"));

  return (
    <div className="min-h-screen md:grid md:grid-cols-[220px_1fr]">
      <aside className="border-b border-line bg-white md:min-h-screen md:border-r md:border-b-0">
        <div className="px-5 py-6">
          <p className="font-display text-sm font-medium tracking-[0.12em]">VITA NATURA</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">Order follow-up</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-4 md:block md:space-y-1">
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} end={link.end} className={({ isActive }) => itemClass(isActive)}>
              {link.label}
            </NavLink>
          ))}
          {user?.role !== "ADMIN" && (
            <NavLink to="/my-tasks" className={({ isActive }) => itemClass(isActive)}>My tasks</NavLink>
          )}
          {user?.role === "ADMIN" && (
            <NavLink to="/team" className={({ isActive }) => itemClass(isActive)}>Team</NavLink>
          )}
        </nav>
        <div className="hidden px-5 py-5 md:block">
          <p className="text-sm text-ink">{user?.name}</p>
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{user?.role === "ADMIN" ? "Admin" : "Employee"}</p>
          <button className="mt-3 text-sm text-secondary hover:text-ink" onClick={signOut}>Sign out</button>
        </div>
      </aside>
      <div className="min-w-0">
        <div className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
          <p className="text-sm">{user?.name}</p>
          <button className="text-sm" onClick={signOut}>Sign out</button>
        </div>
        <main className="mx-auto max-w-6xl px-4 py-8 md:px-10">{children}</main>
      </div>
    </div>
  );
}

export function PageTitle({ title, detail }: { title: string; detail?: string }) {
  return (
    <header className="mb-8">
      <h1 className="font-display text-[2.5rem] leading-none font-medium tracking-[-0.035em] text-ink">{title}</h1>
      {detail && <p className="mt-3 max-w-2xl text-sm leading-relaxed text-secondary">{detail}</p>}
    </header>
  );
}

export function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div>
      <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="tabular mt-1 text-3xl font-medium tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Banner({ children }: { children: ReactNode }) {
  return <div className="mb-4 rounded-[10px] border border-crit/20 bg-crit-bg px-3 py-2 text-sm text-crit">{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-[14px] bg-paper px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

export function PriorityMark({ priority }: { priority: string }) {
  const tone = priority === "HIGH" ? "bg-crit-bg text-crit" : priority === "MEDIUM" ? "bg-warn-bg text-warn" : "bg-chip text-muted";
  const label = priority === "HIGH" ? "High" : priority === "MEDIUM" ? "Medium" : priority === "LOW" ? "Low" : priority;
  return <span className={`inline-flex rounded-[7px] px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] ${tone}`}>{label}</span>;
}

export function StatusText({ status }: { status: string }) {
  const label = status === "IN_PROGRESS" ? "In progress" : status === "OPEN" ? "Open" : status === "RESOLVED" ? "Resolved" : status;
  const tone = status === "RESOLVED" ? "bg-good-bg text-good" : "bg-chip text-ink";
  return <span className={`inline-flex rounded-[7px] px-2 py-0.5 font-mono text-[11px] uppercase tracking-[0.08em] ${tone}`}>{label}</span>;
}
