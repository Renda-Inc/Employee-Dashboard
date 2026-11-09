import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { DEPARTMENTS } from "@/services/permissions";
import { createEmployee } from "@/services/employees.functions";
import type { RoleRecord } from "@/services/directory";
import { RoleDialog } from "./RoleDialog";
import { TemporaryPasswordDialog, errorMessage, refreshDirectory } from "./shared";

const NEW_ROLE = "__create_role__";
const EMPTY = { firstName: "", lastName: "", email: "", department: "", roleId: "", jobTitle: "", phone: "" };
type Field = keyof typeof EMPTY;

function validate(f: typeof EMPTY) {
  const e: Partial<Record<Field, string>> = {};
  if (!f.firstName.trim()) e.firstName = "Enter a first name.";
  if (!f.lastName.trim()) e.lastName = "Enter a last name.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = "Enter a valid work email.";
  if (!f.department) e.department = "Choose a department.";
  if (!f.roleId) e.roleId = "Choose a role.";
  if (f.phone && !/^[0-9+()\-.\s]{7,30}$/.test(f.phone.trim())) e.phone = "Enter a valid phone number.";
  return e;
}

export function AddEmployeeDialog({ open, onOpenChange, roles, canManageRoles }: { open: boolean; onOpenChange: (o: boolean) => void; roles: RoleRecord[]; canManageRoles: boolean }) {
  const qc = useQueryClient();
  const create = useServerFn(createEmployee);
  const [f, setF] = useState(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);
  const [issued, setIssued] = useState<{ title: string; name: string; email: string; password: string } | null>(null);

  const set = (k: Field, v: string) => { setF((x) => ({ ...x, [k]: v })); setErrors((x) => ({ ...x, [k]: undefined })); };
  const close = () => { setF(EMPTY); setErrors({}); setServerError(null); onOpenChange(false); };

  async function submit() {
    const e = validate(f);
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    setServerError(null);
    try {
      const res = await create({ data: { ...f, department: f.department as (typeof DEPARTMENTS)[number], email: f.email.trim().toLowerCase() } });
      await refreshDirectory(qc);
      toast.success(`${f.firstName} ${f.lastName} added as ${res.employeeCode}`);
      setIssued({ title: "Employee account created", name: `${f.firstName.trim()} ${f.lastName.trim()}`, email: f.email.trim().toLowerCase(), password: res.temporaryPassword });
      close();
    } catch (err) {
      setServerError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const field = (k: Field, label: string, opts: { type?: string; placeholder?: string; optional?: boolean } = {}) => (
    <div className="space-y-2">
      <Label htmlFor={`ae-${k}`}>{label}{opts.optional && <span className="ml-1 font-normal text-muted-foreground">(optional)</span>}</Label>
      <Input id={`ae-${k}`} type={opts.type ?? "text"} placeholder={opts.placeholder} value={f[k]} onChange={(e) => set(k, e.target.value)} aria-invalid={!!errors[k]} />
      {errors[k] && <p className="text-[13px] text-danger">{errors[k]}</p>}
    </div>
  );

  return (
    <>
      <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : !busy && close())}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>Create a Renda Admin account. The system generates a one-time temporary password — no one chooses or shares a password for the employee.</DialogDescription>
          </DialogHeader>
          {serverError && <div role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">{serverError}</div>}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("firstName", "First name")}
            {field("lastName", "Last name")}
            <div className="sm:col-span-2">{field("email", "Work email", { type: "email", placeholder: "name@renda.ca" })}</div>
            <div className="space-y-2">
              <Label htmlFor="ae-department">Department</Label>
              <SelectField id="ae-department" aria-invalid={!!errors.department} value={f.department} onChange={(e) => set("department", e.target.value)} className="h-10 w-full">
                <option value="">Choose a department</option>
                {DEPARTMENTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </SelectField>
              {errors.department && <p className="text-[13px] text-danger">{errors.department}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="ae-role">Assigned role</Label>
              <SelectField id="ae-role" aria-invalid={!!errors.roleId} value={f.roleId} onChange={(e) => (e.target.value === NEW_ROLE ? setRoleOpen(true) : set("roleId", e.target.value))} className="h-10 w-full">
                <option value="">Choose a role</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                {canManageRoles && <option value={NEW_ROLE}>+ Create a new role…</option>}
              </SelectField>
              {errors.roleId && <p className="text-[13px] text-danger">{errors.roleId}</p>}
            </div>
            {field("jobTitle", "Job title", { optional: true, placeholder: "e.g. Senior Support Specialist" })}
            {field("phone", "Phone number", { optional: true, type: "tel", placeholder: "+1 416 555 0100" })}
            <div className="space-y-2">
              <Label>Employee ID</Label>
              <p className="flex h-10 items-center rounded-md border border-dashed px-3 text-[14px] text-muted-foreground">Assigned automatically</p>
            </div>
          </div>
          <p className="flex items-start gap-2 rounded-md bg-secondary px-3.5 py-3 text-[13px] text-muted-foreground">
            <KeyRound className="mt-0.5 size-4 shrink-0" /> The account starts as Invitation Pending and becomes Active once the employee signs in and chooses their own password.
          </p>
          <DialogFooter>
            <Button variant="outline" disabled={busy} onClick={close}>Cancel</Button>
            <Button disabled={busy} onClick={submit}>{busy && <Loader2 className="size-4 animate-spin" />}Create account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <RoleDialog open={roleOpen} mode="create" canManage={canManageRoles} onOpenChange={setRoleOpen} onSaved={(r) => set("roleId", r.id)} />
      <TemporaryPasswordDialog info={issued} onClose={() => setIssued(null)} />
    </>
  );
}
