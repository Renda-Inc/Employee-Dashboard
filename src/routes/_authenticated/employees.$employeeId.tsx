import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Avatar, EmptyState, KV, Mono, Panel, usePermission } from "@/components/common";
import { StatusBadge } from "@/components/status/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmployeeStatusSelect } from "@/components/employees/EmployeeStatusSelect";
import {
  ConfirmDialog,
  TemporaryPasswordDialog,
  errorMessage,
  refreshDirectory,
} from "@/components/employees/shared";
import {
  adminAuditQuery,
  directoryQuery,
  type EmployeeRecord,
  type RoleRecord,
} from "@/services/directory";
import { employeesApi } from "@/services/api";
import {
  DEPARTMENTS,
  LANDING_PAGES,
  PERMISSION_GROUPS,
  PERMISSION_LABELS,
} from "@/services/permissions";
import { useDB } from "@/services/store";
import { fmtDate, fmtDateTime, relTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/employees/$employeeId")({
  head: () => ({
    meta: [
      { title: "Employee profile | Renda Admin" },
      { name: "description", content: "Employee account details, role, access and activity." },
      { property: "og:title", content: "Employee profile | Renda Admin" },
      { property: "og:description", content: "Employee account details and access." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: EmployeeProfilePage,
});
/**
 * Record pages hold per-record form state (drafts, pre-filled emails,
 * edit forms). Keying the page by its route param forces a remount when
 * navigating directly from one record to another on the same route, so
 * state from the previous record can never be submitted for the next.
 */
function EmployeeProfilePage() {
  const { employeeId } = Route.useParams();
  return <EmployeeProfile key={employeeId} />;
}

function EmployeeProfile() {
  const { employeeId } = Route.useParams();
  const db = useDB();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(directoryQuery);
  const canManage = usePermission("employees.manage");
  const canAudit = usePermission("audit.view");
  const { data: events } = useQuery(adminAuditQuery(canAudit));
  const [editing, setEditing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [issued, setIssued] = useState<{
    title: string;
    name: string;
    email: string;
    password: string;
  } | null>(null);
  const [roleBusy, setRoleBusy] = useState(false);

  const e = data?.employees.find((x) => x.id === employeeId);
  if (isLoading)
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  if (!e || !data)
    return (
      <div className="panel">
        <EmptyState
          title="Employee not found"
          description="This employee may have been removed."
          action={
            <Button variant="outline" asChild>
              <Link to="/employees">Back to employees</Link>
            </Button>
          }
        />
      </div>
    );

  const self = e.id === db.currentEmployeeId;
  const manageable = canManage && !self;
  const creator = data.employees.find((x) => x.id === e.created_by);
  const history = (events ?? []).filter((ev) => ev.entity_id === e.id);
  const landing = LANDING_PAGES.find((l) => l.to === e.role?.landing_page)?.label ?? "Overview";

  async function changeRole(roleId: string) {
    if (!e || roleId === e.role?.id) return;
    setRoleBusy(true);
    try {
      await employeesApi.updateEmployee({ id: e.id, roleId });
      await refreshDirectory(qc);
      toast.success(`${e.name}'s role updated`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setRoleBusy(false);
    }
  }

  return (
    <>
      <Link
        to="/employees"
        className="mb-6 inline-flex items-center gap-1.5 text-[14px] text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> Employee Management
      </Link>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar name={e.name} size="lg" />
          <div>
            <h1 className="text-[28px] font-semibold leading-tight">
              {e.name}
              {self && (
                <span className="ml-2 text-[15px] font-normal text-muted-foreground">(you)</span>
              )}
            </h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-muted-foreground">
              <Mono>{e.employee_code}</Mono>
              <span aria-hidden>·</span>
              <span>{e.job_title || e.department}</span>
              <span aria-hidden>·</span>
              <span>{e.role?.name ?? "No role"}</span>
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EmployeeStatusSelect employee={e} editable={manageable} />
          {manageable && (
            <Button variant="outline" onClick={() => setConfirmReset(true)}>
              <KeyRound className="size-4" /> Reset password
            </Button>
          )}
          {canManage && (
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> Edit details
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Panel title="Employee details">
          <KV
            items={[
              ["Employee ID", <Mono>{e.employee_code}</Mono>],
              ["Work email", e.email],
              ["Department", e.department],
              ["Job title", e.job_title || "-"],
              ["Phone", e.phone || "-"],
              ["Account status", <StatusBadge status={e.status} />],
              [
                "Last login",
                e.last_login_at
                  ? `${fmtDateTime(e.last_login_at)} (${relTime(e.last_login_at)})`
                  : "Never signed in",
              ],
              ["Created", `${fmtDate(e.created_at)}${creator ? ` by ${creator.name}` : ""}`],
            ]}
          />
          {e.status === "Invitation Pending" && (
            <p className="mt-5 rounded-md bg-warning-soft px-3.5 py-3 text-[13px] text-warning">
              Waiting for the first sign-in. The account becomes Active once {e.first_name} chooses
              a personal password.
            </p>
          )}
        </Panel>

        <Panel title="Role & access">
          <div className="mb-5 grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="emp-role">Assigned role</Label>
              {manageable ? (
                <SelectField
                  id="emp-role"
                  disabled={roleBusy}
                  value={e.role?.id ?? ""}
                  onChange={(ev) => changeRole(ev.target.value)}
                  className="h-10 w-full"
                >
                  {!e.role && <option value="">No role</option>}
                  {data.roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </SelectField>
              ) : (
                <p className="text-[15px] font-medium">{e.role?.name ?? "No role"}</p>
              )}
              {self && canManage && (
                <p className="text-[13px] text-muted-foreground">You can't change your own role.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Landing page</Label>
              <p className="text-[15px]">{landing}</p>
            </div>
          </div>
          <RolePermissionSummary role={e.role} />
        </Panel>

        {canAudit && (
          <Panel title="Account activity" className="xl:col-span-2" bodyClass="p-0">
            {history.length === 0 ? (
              <EmptyState title="No recorded activity yet" />
            ) : (
              <ul className="divide-y">
                {history.slice(0, 25).map((ev) => (
                  <li
                    key={ev.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 px-6 py-4"
                  >
                    <span className="min-w-0">
                      <span className="block text-[14px] font-medium">{ev.action}</span>
                      <span className="block text-[13px] text-muted-foreground">
                        {ev.actor_name || "System"}
                        {ev.details ? ` · ${ev.details}` : ""}
                      </span>
                    </span>
                    <span className="text-[13px] text-muted-foreground tabular">
                      {fmtDateTime(ev.created_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        )}
      </div>

      <EditEmployeeDialog open={editing} onOpenChange={setEditing} employee={e} />
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={`Reset ${e.name}'s password?`}
        description="The system generates a new temporary password. Their current password stops working, and they'll choose a new one at their next sign-in."
        confirmLabel="Generate new password"
        onConfirm={async () => {
          try {
            const res = await employeesApi.resetPassword(e.id);
            await refreshDirectory(qc);
            setIssued({
              title: "Password reset",
              name: e.name,
              email: e.email,
              password: res.temporaryPassword,
            });
          } catch (err) {
            toast.error(errorMessage(err));
            throw err;
          }
        }}
      />
      <TemporaryPasswordDialog info={issued} onClose={() => setIssued(null)} />
    </>
  );
}

function RolePermissionSummary({ role }: { role: RoleRecord | null }) {
  if (!role)
    return (
      <p className="text-[14px] text-muted-foreground">
        No role assigned. This employee can't access any module.
      </p>
    );
  const groups = PERMISSION_GROUPS.map((g) => ({
    ...g,
    granted: g.permissions.filter((p) => role.permissions.includes(p)),
  })).filter((g) => g.granted.length);
  return (
    <div>
      <div className="eyebrow mb-3">What this role can do</div>
      <dl className="space-y-3">
        {groups.map((g) => (
          <div key={g.area} className="grid gap-1 sm:grid-cols-[180px_1fr]">
            <dt className="text-[14px] font-medium">{g.area}</dt>
            <dd className="text-[14px] text-muted-foreground">
              {g.granted.map((p) => PERMISSION_LABELS[p]).join(" · ")}
            </dd>
          </div>
        ))}
      </dl>
      <Link
        to="/employees/roles"
        className="mt-4 inline-block text-[14px] font-medium underline-offset-4 hover:underline"
      >
        View all roles & permissions
      </Link>
    </div>
  );
}

function EditEmployeeDialog({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  employee: EmployeeRecord;
}) {
  const qc = useQueryClient();
  const init = () => ({
    firstName: employee.first_name,
    lastName: employee.last_name,
    department: employee.department,
    jobTitle: employee.job_title ?? "",
    phone: employee.phone ?? "",
  });
  const [f, setF] = useState(init);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setF(init());
      setError(null);
    }
  }, [open]);

  async function save() {
    if (!f.firstName.trim() || !f.lastName.trim())
      return setError("First and last name are required.");
    if (f.phone && !/^[0-9+()\-.\s]{7,30}$/.test(f.phone.trim()))
      return setError("Enter a valid phone number.");
    setBusy(true);
    setError(null);
    try {
      await employeesApi.updateEmployee({
        id: employee.id,
        firstName: f.firstName.trim(),
        lastName: f.lastName.trim(),
        department: f.department as (typeof DEPARTMENTS)[number],
        jobTitle: f.jobTitle.trim() || null,
        phone: f.phone.trim() || null,
      });
      await refreshDirectory(qc);
      toast.success("Employee details saved");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit employee details</DialogTitle>
          <DialogDescription>
            The work email is the sign-in identity and can't be changed here.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <div
            role="alert"
            className="rounded-md border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger"
          >
            {error}
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ed-fn">First name</Label>
            <Input
              id="ed-fn"
              value={f.firstName}
              onChange={(e) => setF({ ...f, firstName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ed-ln">Last name</Label>
            <Input
              id="ed-ln"
              value={f.lastName}
              onChange={(e) => setF({ ...f, lastName: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="ed-dept">Department</Label>
            <SelectField
              id="ed-dept"
              value={f.department}
              onChange={(e) => setF({ ...f, department: e.target.value })}
              className="h-10 w-full"
            >
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </SelectField>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ed-jt">Job title</Label>
            <Input
              id="ed-jt"
              value={f.jobTitle}
              onChange={(e) => setF({ ...f, jobTitle: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="ed-ph">Phone number</Label>
            <Input
              id="ed-ph"
              type="tel"
              value={f.phone}
              onChange={(e) => setF({ ...f, phone: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={busy} onClick={save}>
            {busy && <Loader2 className="size-4 animate-spin" />}Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
