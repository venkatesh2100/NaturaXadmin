import { useEffect, useState } from "react";
import { api } from "../api";
import { Banner, PageTitle } from "../components/Shell";
import { Loading } from "../components/Spinner";
import type { Role, User } from "../types";

export function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    api<{ users: User[] }>("/users")
      .then((result) => setUsers(result.users))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    load();
  }, []);

  async function changeRole(id: string, role: Role) {
    setError("");
    try {
      await api(`/users/${id}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update role.");
    }
  }

  return (
    <div>
      <PageTitle title="Team" detail="Admin can assign tasks, change task status, and change roles. Employee can pick an unassigned task and update the order status and deadline on their own tasks." />
      {error && <Banner>{error}</Banner>}
      {loading && <Loading />}
      {!loading && (
      <div className="overflow-x-auto rounded-xl border border-line bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-line text-xs uppercase tracking-wide text-stone-500">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b border-line last:border-0">
                <td className="px-3 py-2">{user.name}</td>
                <td className="px-3 py-2">{user.email}</td>
                <td className="px-3 py-2">
                  <select className="max-w-[9rem] rounded-md border border-line" value={user.role} onChange={(event) => void changeRole(user.id, event.target.value as Role)} aria-label={`Role for ${user.name}`}>
                    <option value="ADMIN">Admin</option>
                    <option value="STAFF">Employee</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
