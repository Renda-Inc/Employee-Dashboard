import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { StatusBadge } from "@/components/status/StatusBadge";
import { ASSIGNABLE_STATUSES, type AssignableStatus } from "@/services/employee-rules";
import { updateEmployeeAccount } from "@/services/employees.functions";
import type { EmployeeRecord } from "@/services/directory";
import { ConfirmDialog, errorMessage, refreshDirectory } from "./shared";

const COPY: Record<AssignableStatus, { title: string; body: string; label: string }> = {
  Active: { title: "Reactivate", body: "They'll be able to sign in again with their existing password.", label: "Reactivate" },
  Inactive: { title: "Deactivate", body: "They'll be signed out of Renda Admin and can't sign in until reactivated. Use this for employees who have left or are on extended leave.", label: "Deactivate" },
  Suspended: { title: "Suspend", body: "Access is blocked immediately while an issue is investigated. They can't sign in until reactivated.", label: "Suspend" },
};

/** Account status shown as a dropdown; changes are confirmed and recorded in the audit log. */
export function EmployeeStatusSelect({ employee, editable }: { employee: EmployeeRecord; editable: boolean }) {
  const qc = useQueryClient();
  const update = useServerFn(updateEmployeeAccount);
  const [pending, setPending] = useState<AssignableStatus | null>(null);
  if (!editable) return <StatusBadge status={employee.status} />;
  const reactivatesInvite = pending === "Active" && employee.must_change_password;
  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()} className="inline-flex">
      <Select value={employee.status} onValueChange={(v) => v !== employee.status && setPending(v as AssignableStatus)}>
        <SelectTrigger aria-label={`Account status for ${employee.name}`} className="h-9 w-auto gap-1.5 border-transparent bg-transparent px-1.5 shadow-none hover:border-border hover:bg-card">
          <StatusBadge status={employee.status} />
        </SelectTrigger>
        <SelectContent>
          {employee.status === "Invitation Pending" && <SelectItem value="Invitation Pending" disabled><StatusBadge status="Invitation Pending" /></SelectItem>}
          {ASSIGNABLE_STATUSES.map((s) => (
            <SelectItem key={s} value={s} disabled={s === "Active" && employee.status === "Invitation Pending"}><StatusBadge status={s} /></SelectItem>
          ))}
        </SelectContent>
      </Select>
      {pending && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setPending(null)}
          title={`${COPY[pending].title} ${employee.name}?`}
          description={reactivatesInvite ? "They haven't signed in yet, so their account returns to Invitation Pending until they choose a password." : COPY[pending].body}
          confirmLabel={COPY[pending].label}
          destructive={pending !== "Active"}
          withReason={pending !== "Active"}
          onConfirm={async (reason) => {
            try {
              const res = await update({ data: { id: employee.id, status: pending, ...(reason ? { reason } : {}) } });
              await refreshDirectory(qc);
              toast.success(`${employee.name} is now ${res.status}`);
            } catch (e) {
              toast.error(errorMessage(e));
              throw e;
            }
          }}
        />
      )}
    </div>
  );
}
