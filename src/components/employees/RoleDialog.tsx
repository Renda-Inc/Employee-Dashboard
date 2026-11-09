import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { SelectField } from "@/components/ui/select-field";
import { StatusBadge } from "@/components/status/StatusBadge";
import { ALL_PERMISSIONS, DEPARTMENTS, LANDING_PAGES, PERMISSION_GROUPS, PERMISSION_LABELS, type Permission } from "@/services/permissions";
import { createRole, updateRole } from "@/services/employees.functions";
import type { RoleRecord } from "@/services/directory";
import { errorMessage, refreshDirectory } from "./shared";

export type RoleDialogMode = "create" | "edit" | "view" | "duplicate";

interface Draft { name: string; description: string; department: string; landingPage: string; permissions: Permission[] }

const fromRole = (r: RoleRecord | undefined, mode: RoleDialogMode): Draft => ({
  name: r ? (mode === "duplicate" ? `${r.name} (copy)` : r.name) : "",
  description: r?.description ?? "",
  department: r?.department ?? "",
  landingPage: r?.landing_page ?? "/",
  permissions: (r?.permissions ?? []) as Permission[],
});

export function RoleDialog({ open, mode, role, canManage, onOpenChange, onModeChange, onSaved }: {
  open: boolean;
  mode: RoleDialogMode;
  role?: RoleRecord;
  canManage: boolean;
  onOpenChange: (o: boolean) => void;
  onModeChange?: (m: RoleDialogMode) => void;
  onSaved?: (role: RoleRecord) => void;
}) {
  const qc = useQueryClient();
  const create = useServerFn(createRole);
  const update = useServerFn(updateRole);
  const [d, setD] = useState<Draft>(() => fromRole(role, mode));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) { setD(fromRole(role, mode)); setError(null); }
  }, [open, role, mode]);

  const readOnly = mode === "view" || !canManage;
  const systemRole = mode === "edit" && !!role?.is_system;
  const lockedPermissions = systemRole && role?.name === "Administrator";
  const toggle = (p: Permission, on: boolean) => setD((x) => ({ ...x, permissions: on ? Array.from(new Set([...x.permissions, p])) : x.permissions.filter((y) => y !== p) }));
  const title = mode === "create" ? "Create role" : mode === "duplicate" ? `Duplicate ${role?.name ?? "role"}` : mode === "edit" ? `Edit ${role?.name ?? "role"}` : role?.name ?? "Role";

  async function save() {
    if (d.name.trim().length < 2) return setError("Enter a role name (at least 2 characters).");
    if (!d.permissions.length && !lockedPermissions) return setError("Choose at least one permission.");
    setBusy(true);
    setError(null);
    const payload = {
      name: d.name.trim(), description: d.description.trim(), landingPage: d.landingPage, permissions: d.permissions,
      department: (d.department || null) as (typeof DEPARTMENTS)[number] | null,
    };
    try {
      const saved = mode === "edit" && role ? await update({ data: { ...payload, id: role.id } }) : await create({ data: payload });
      await refreshDirectory(qc);
      toast.success(mode === "edit" ? `${saved.name} updated` : `${saved.name} created`);
      onSaved?.(saved);
      onOpenChange(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{title}{role && mode === "view" && <StatusBadge status={role.is_system ? "System" : "Custom"} tone={role.is_system ? "neutral" : "info"} />}</DialogTitle>
          <DialogDescription>
            {readOnly ? "Permissions decide which parts of Renda Admin this role can open and which actions it can perform." : "Choose exactly what employees with this role can see and do. Changes apply the next time their workspace loads."}
          </DialogDescription>
        </DialogHeader>
        {error && <div role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3.5 py-2.5 text-[14px] text-danger">{error}</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="role-name">Role name</Label>
            <Input id="role-name" value={d.name} disabled={readOnly || systemRole} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. Fraud Analyst" />
            {systemRole && <p className="text-[13px] text-muted-foreground">System roles keep their name.</p>}
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="role-desc">Description</Label>
            <Textarea id="role-desc" rows={2} value={d.description} disabled={readOnly} onChange={(e) => setD({ ...d, description: e.target.value })} placeholder="What this role is responsible for" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-dept">Department or functional area</Label>
            <SelectField id="role-dept" disabled={readOnly} value={d.department} onChange={(e) => setD({ ...d, department: e.target.value })} className="h-10 w-full">
              <option value="">Not specific to a department</option>
              {DEPARTMENTS.map((x) => <option key={x} value={x}>{x}</option>)}
            </SelectField>
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-landing">Landing page after sign-in</Label>
            <SelectField id="role-landing" disabled={readOnly} value={d.landingPage} onChange={(e) => setD({ ...d, landingPage: e.target.value })} className="h-10 w-full">
              {LANDING_PAGES.map((l) => <option key={l.to} value={l.to}>{l.label}</option>)}
            </SelectField>
          </div>
        </div>

        <div className="mt-2">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-[15px] font-semibold">Permissions</h3>
            <span className="text-[13px] text-muted-foreground tabular">{lockedPermissions ? ALL_PERMISSIONS.length : d.permissions.length} of {ALL_PERMISSIONS.length} selected</span>
          </div>
          {lockedPermissions && <p className="mb-3 flex items-center gap-2 text-[13px] text-muted-foreground"><Lock className="size-3.5" /> The Administrator role always keeps every permission.</p>}
          <div className="divide-y rounded-lg border">
            {PERMISSION_GROUPS.map((g) => {
              const all = g.permissions.every((p) => lockedPermissions || d.permissions.includes(p));
              const some = g.permissions.some((p) => d.permissions.includes(p));
              return (
                <fieldset key={g.area} className="px-4 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <Checkbox id={`grp-${g.area}`} disabled={readOnly || lockedPermissions} checked={all ? true : some ? "indeterminate" : false}
                      onCheckedChange={(v) => setD((x) => ({ ...x, permissions: v === true ? Array.from(new Set([...x.permissions, ...g.permissions])) : x.permissions.filter((p) => !g.permissions.includes(p)) }))} />
                    <Label htmlFor={`grp-${g.area}`} className="text-[14px] font-semibold">{g.area}</Label>
                  </div>
                  <div className="mt-2.5 grid gap-2 pl-7 sm:grid-cols-2">
                    {g.permissions.map((p) => (
                      <div key={p} className="flex items-center gap-2.5">
                        <Checkbox id={`perm-${p}`} disabled={readOnly || lockedPermissions} checked={lockedPermissions || d.permissions.includes(p)} onCheckedChange={(v) => toggle(p, v === true)} />
                        <Label htmlFor={`perm-${p}`} className="font-normal">{PERMISSION_LABELS[p]}</Label>
                      </div>
                    ))}
                  </div>
                </fieldset>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          {readOnly ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              {canManage && onModeChange && <Button onClick={() => onModeChange("edit")}>Edit role</Button>}
            </>
          ) : (
            <>
              <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={busy} onClick={save}>{busy && <Loader2 className="size-4 animate-spin" />}{mode === "edit" ? "Save changes" : "Create role"}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
