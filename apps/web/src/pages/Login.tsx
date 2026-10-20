import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { api, apiUrl } from "../api";
import { useAuth } from "../auth";
import type { User } from "../types";

type Door = "admin" | "employee";

const DEMO = {
  admin: { email: "admin@vitanatura.example", label: "Admin" },
  employee: { email: "ananya.iyer@vitanatura.example", label: "Employee" },
} as const;

export function LoginPage() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const [door, setDoor] = useState<Door>("admin");
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState<string>(DEMO.admin.email);
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [googleEnabled, setGoogleEnabled] = useState(false);
  const [params] = useSearchParams();

  useEffect(() => {
    if (user) navigate("/", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (params.get("error")) setError("Google sign-in failed. Try again.");
    api<{ googleEnabled: boolean }>("/auth/config")
      .then((config) => setGoogleEnabled(config.googleEnabled))
      .catch(() => setGoogleEnabled(false));
  }, [params]);

  function chooseDoor(next: Door) {
    setDoor(next);
    setMode("login");
    setEmail(DEMO[next].email);
    setError("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const result = await api<{ user: User }>(mode === "login" ? "/auth/login" : "/auth/register", {
        method: "POST",
        body: JSON.stringify(mode === "login" ? { email, password } : { name, email, password }),
      });
      const expected = door === "admin" ? "ADMIN" : "STAFF";
      if (result.user.role !== expected) {
        await api("/auth/logout", { method: "POST" });
        setError(door === "admin"
          ? "That account is an employee. Use the employee sign-in."
          : "That account is an admin. Use the admin sign-in.");
        return;
      }
      await refresh();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-in failed.");
    }
  }

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border border-line bg-white p-8">
        <p className="text-xs font-medium uppercase tracking-wide text-stone-500">VitaNatura Elements</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {mode === "register" ? "Create employee account" : `${DEMO[door].label} sign in`}
        </h1>
        <p className="mt-2 text-sm text-stone-600">
          {door === "admin"
            ? "Admins assign tasks to employees. Demo password is naturax123."
            : "Employees pick unassigned tasks and update order status. They cannot assign tasks to other people. Demo password is naturax123."}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {(["admin", "employee"] as const).map((option) => (
            <button
              key={option}
              type="button"
              className={`rounded-md border px-3 py-2 text-sm font-medium ${door === option ? "border-moss bg-moss text-white" : "border-line bg-white"}`}
              onClick={() => chooseDoor(option)}
            >
              {DEMO[option].label}
            </button>
          ))}
        </div>
        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p>}
        {mode === "register" && (
          <label className="mt-4 block text-sm">
            Name
            <input className="mt-1 w-full rounded-md border border-line px-3 py-2" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
        )}
        <label className="mt-4 block text-sm">
          Email
          <input className="mt-1 w-full rounded-md border border-line px-3 py-2" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label className="mt-4 block text-sm">
          Password
          <input className="mt-1 w-full rounded-md border border-line px-3 py-2" type="password" minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required />
        </label>
        <button className="mt-6 w-full rounded-md bg-moss px-4 py-2 text-sm font-medium text-white">
          {mode === "login" ? `Sign in as ${DEMO[door].label.toLowerCase()}` : "Create employee account"}
        </button>
        {googleEnabled && mode === "login" && (
          <a href={apiUrl("/auth/google")} className="mt-3 block w-full rounded-md border border-line px-4 py-2 text-center text-sm font-medium">
            Continue with Google
          </a>
        )}
        {door === "employee" && (
          <button
            type="button"
            className="mt-3 w-full text-sm text-stone-600"
            onClick={() => {
              setMode(mode === "login" ? "register" : "login");
              setError("");
            }}
          >
            {mode === "login" ? "Need an employee account? Create one" : "Already have an account? Sign in"}
          </button>
        )}
      </form>
    </div>
  );
}
