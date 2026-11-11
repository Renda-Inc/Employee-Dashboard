import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { Check, Copy, Eye, Minus, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, usePermission } from "@/components/common";
import { DataTable, SearchInput, type Column } from "@/components/tables/DataTable";
import { StatusBadge } from "@/components/status/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoleDialog, type RoleDialogMode } from "@/components/employees/RoleDialog";
import { ConfirmDialog, errorMessage, refreshDirectory } from "@/components/employees/shared";
import { directoryQuery, type RoleRecord } from "@/services/directory";
import { employeesApi } from "@/services/api";
import { roleDeletionBlocker } from "@/services/employee-rules";
import { PERMISSION_GROUPS, PERMISSION_LABELS } from "@/services/permissions";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/employees/roles")({
  head: () => ({
    meta: [
      { title: "Roles & Permissions — Renda Admin" },
      {
        name: "description",
        content: "Create and manage employee roles and exactly what each role can access.",
      },
      { property: "og:title", content: "Roles & Permissions — Renda Admin" },
      { property: "og:description", content: "Role-based access control for Renda Admin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Roles,
});

function Roles() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery(directoryQuery);
  const canManage = usePermission("roles.manage");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState<{ mode: RoleDialogMode; role?: RoleRecord } | null>(null);
  const [deleting, setDeleting] = useState<RoleRecord | null>(null);
  const roles = data?.roles ?? [];
  const count = (r: RoleRecord) => data?.assignedCount[r.id] ?? 0;
  const rows = roles.filter(
    (r) =>
      !q ||
      `${r.name} ${r.description} ${r.department ?? ""}`.toLowerCase().includes(q.toLowerCase()),
  );

  const cols: Column<RoleRecord>[] = [
    {
      key: "name",
      header: "Role",
      sort: (r) => r.name.toLowerCase(),
      cell: (r) => (
        <span className="block">
          <span className="block font-medium">{r.name}</span>
          {r.department && (
            <span className="block text-[13px] text-muted-foreground">{r.department}</span>
          )}
        </span>
      ),
    },
    {
      key: "desc",
      header: "Description",
      className: "whitespace-normal",
      cell: (r) => (
        <span className="line-clamp-2 block min-w-[220px] max-w-[380px] text-muted-foreground">
          {r.description || "—"}
        </span>
      ),
    },
    {
      key: "count",
      header: "Employees",
      sort: (r) => count(r),
      cell: (r) => <span className="tabular">{count(r)}</span>,
    },
    {
      key: "perms",
      header: "Permissions",
      sort: (r) => r.permissions.length,
      cell: (r) => <span className="tabular text-muted-foreground">{r.permissions.length}</span>,
    },
    {
      key: "created",
      header: "Created",
      sort: (r) => r.created_at,
      cell: (r) => <span className="tabular text-muted-foreground">{fmtDate(r.created_at)}</span>,
    },
    {
      key: "updated",
      header: "Last updated",
      sort: (r) => r.updated_at,
      cell: (r) => <span className="tabular text-muted-foreground">{fmtDate(r.updated_at)}</span>,
    },
    {
      key: "type",
      header: "Type",
      sort: (r) => (r.is_system ? 0 : 1),
      cell: (r) => (
        <StatusBadge
          status={r.is_system ? "System" : "Custom"}
          tone={r.is_system ? "neutral" : "info"}
        />
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      className: "w-12 text-right",
      cell: (r) => (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Actions for ${r.name}`}>
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onSelect={() => setDialog({ mode: "view", role: r })}>
                <Eye /> View role
              </DropdownMenuItem>
              {canManage && (
                <DropdownMenuItem onSelect={() => setDialog({ mode: "edit", role: r })}>
                  <Pencil /> Edit role
                </DropdownMenuItem>
              )}
              {canManage && (
                <DropdownMenuItem onSelect={() => setDialog({ mode: "duplicate", role: r })}>
                  <Copy /> Duplicate role
                </DropdownMenuItem>
              )}
              {canManage && !r.is_system && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-danger focus:text-danger"
                    onSelect={() => setDeleting(r)}
                  >
                    <Trash2 /> Delete role
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ),
    },
  ];

  const blocker = deleting ? roleDeletionBlocker(deleting, count(deleting)) : null;

  return (
    <>
      <PageHeader
        title="Roles & Permissions"
        subtitle="Define what each role can open and do in Renda Admin. Access is enforced for every employee assigned to the role."
        actions={
          canManage && (
            <Button onClick={() => setDialog({ mode: "create" })}>
              <Plus className="size-4" /> Create Role
            </Button>
          )
        }
      />
      <DataTable
        rows={rows}
        columns={cols}
        rowKey={(r) => r.id}
        defaultSort={{ key: "type", dir: "asc" }}
        onRowClick={(r) => setDialog({ mode: "view", role: r })}
        emptyTitle={isLoading ? "Loading roles…" : "No roles match"}
        toolbar={<SearchInput value={q} onChange={setQ} placeholder="Search roles" />}
      />
      {!canManage && (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Only employees with the "Create and edit roles" permission can change roles.
        </p>
      )}

      <Panel title="Role permission matrix" className="mt-8" bodyClass="overflow-x-auto p-0">
        <table className="w-full text-[14px]">
          <thead>
            <tr className="border-b bg-secondary/50 text-left">
              <th className="sticky left-0 bg-secondary px-6 font-medium text-muted-foreground">
                Permission
              </th>
              {roles.map((r) => (
                <th
                  key={r.id}
                  className="whitespace-nowrap px-4 text-center font-medium text-muted-foreground"
                >
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_GROUPS.map((g) => (
              <Fragment key={g.area}>
                <tr className="border-b bg-secondary/25">
                  <td colSpan={roles.length + 1} className="px-6 py-2.5 text-[13px] font-semibold">
                    {g.area}
                  </td>
                </tr>
                {g.permissions.map((p) => (
                  <tr key={p} className="border-b last:border-0">
                    <td className="sticky left-0 whitespace-nowrap bg-card px-6 py-2.5">
                      {PERMISSION_LABELS[p]}
                    </td>
                    {roles.map((r) => (
                      <td key={r.id} className="px-4 py-2.5 text-center">
                        {r.permissions.includes(p) ? (
                          <Check className="inline size-4 text-success" aria-label="Allowed" />
                        ) : (
                          <Minus
                            className="inline size-4 text-muted-foreground/40"
                            aria-label="Not allowed"
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </Panel>

      <RoleDialog
        open={!!dialog}
        mode={dialog?.mode ?? "create"}
        role={dialog?.role}
        canManage={canManage}
        onOpenChange={(o) => !o && setDialog(null)}
        onModeChange={(mode) => setDialog((d) => (d ? { ...d, mode } : d))}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={blocker ? `${deleting?.name} can't be deleted` : `Delete ${deleting?.name}?`}
        description={blocker ?? "This custom role is removed permanently. This can't be undone."}
        confirmLabel={blocker ? "OK" : "Delete role"}
        destructive={!blocker}
        onConfirm={async () => {
          if (blocker || !deleting) return;
          try {
            await employeesApi.deleteRole(deleting.id);
            await refreshDirectory(qc);
            toast.success(`${deleting.name} deleted`);
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </>
  );
}
