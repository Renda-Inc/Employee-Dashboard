import { SelectField } from "@/components/ui/select-field";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";
import { useDB } from "@/services/store";
import { currentEmployee, updateEmployee } from "@/services/actions";
import { ALL_PERMISSIONS, PERMISSION_LABELS, ROLE_PERMISSIONS } from "@/services/permissions";
import { Avatar, PageHeader, Panel, run, SimulatedNote, usePermission } from "@/components/common";
import { StatusBadge } from "@/components/status/StatusBadge";
import { ActionDialog } from "@/components/dialogs/ActionDialog";
import { Button } from "@/components/ui/button";
import type { Role } from "@/types/models";

export const Route = createFileRoute("/employees")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }, { title: "Employees & Permissions — Renda Admin" }, { name: "description", content: "Employee accounts and role-based access." }, { property: "og:title", content: "Employees & Permissions — Renda Admin" }, { property: "og:description", content: "Employee roles and permissions." }] }),
  component: Employees,
});

const ROLES = Object.keys(ROLE_PERMISSIONS) as Role[];

function Employees() {
  const db = useDB();
  const me = currentEmployee(db);
  const canManage = usePermission("employees.manage");
  return (
    <>
      <PageHeader title="Employees & Permissions" subtitle="Unified dashboard with role-based access. Permissions are enforced in the action layer, not just by hiding buttons." />
      <div className="mb-4"><SimulatedNote>Demo authentication: use the profile menu to sign in as any employee. A client-side role switcher is not production security — production must enforce roles in trusted backend services.</SimulatedNote></div>
      <Panel title="Employees" bodyClass="p-0">
        <table className="w-full text-[14px]">
          <thead><tr className="border-b bg-secondary/60 text-left text-[12px] text-muted-foreground"><th className="px-4 py-2 font-medium">Employee</th><th className="px-3 py-2 font-medium">Email</th><th className="px-3 py-2 font-medium">Role</th><th className="px-3 py-2 font-medium">Status</th><th /></tr></thead>
          <tbody>
            {db.employees.map((e) => (
              <tr key={e.id} className="border-b last:border-0">
                <td className="px-4 py-2"><span className="flex items-center gap-2"><Avatar name={e.name} />{e.name}{e.id === me.id && <span className="text-[12px] text-muted-foreground">(you)</span>}</span></td>
                <td className="px-3 py-2 text-muted-foreground">{e.email}</td>
                <td className="px-3 py-2">
                  {canManage ? (
                    <SelectField aria-label={`Role for ${e.name}`} className="h-10 w-auto max-w-full rounded-md border bg-card px-3" value={e.role} onChange={(ev) => run(() => updateEmployee(e.id, { role: ev.target.value as Role }), `${e.name} is now ${ev.target.value}`)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</SelectField>
                  ) : e.role}
                </td>
                <td className="px-3 py-2"><StatusBadge status={e.status} /></td>
                <td className="px-4 py-2 text-right">
                  {canManage && e.id !== me.id && (
                    <ActionDialog trigger={<Button size="sm" variant="ghost">{e.status === "Active" ? "Suspend" : "Reactivate"}</Button>} title={`${e.status === "Active" ? "Suspend" : "Reactivate"} ${e.name}`} destructive={e.status === "Active"} onConfirm={() => updateEmployee(e.id, { status: e.status === "Active" ? "Suspended" : "Active" })} success="Employee status updated" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!canManage && <p className="border-t px-4 py-2 text-[13px] text-muted-foreground">Only Administrators can change roles or employee status.</p>}
      </Panel>
      <Panel title="Role permission matrix" className="mt-5" bodyClass="overflow-x-auto p-0">
        <table className="w-full text-[13px]">
          <thead><tr className="border-b bg-secondary/60 text-left"><th className="px-4 py-2 font-medium text-muted-foreground">Permission</th>{ROLES.map((r) => <th key={r} className="whitespace-nowrap px-3 py-2 text-center font-medium text-muted-foreground">{r}</th>)}</tr></thead>
          <tbody>
            {ALL_PERMISSIONS.map((p) => (
              <tr key={p} className="border-b last:border-0">
                <td className="px-4 py-1.5">{PERMISSION_LABELS[p]}</td>
                {ROLES.map((r) => <td key={r} className="px-3 py-1.5 text-center">{ROLE_PERMISSIONS[r].includes(p) ? <Check className="inline size-3.5 text-success" aria-label="Allowed" /> : <Minus className="inline size-3.5 text-muted-foreground/50" aria-label="Not allowed" />}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t px-4 py-2 text-[13px] text-muted-foreground">Initial role definitions. Configurable once roles are stored in a trusted backend.</p>
      </Panel>
    </>
  );
}
