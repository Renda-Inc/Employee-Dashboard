import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { KeyRound, UserPlus } from "lucide-react";
import { Avatar, Mono, PageHeader, usePermission } from "@/components/common";
import { DataTable, FilterSelect, SearchInput, type Column } from "@/components/tables/DataTable";
import { Button } from "@/components/ui/button";
import { AddEmployeeDialog } from "@/components/employees/AddEmployeeDialog";
import { EmployeeStatusSelect } from "@/components/employees/EmployeeStatusSelect";
import { directoryQuery, type EmployeeRecord } from "@/services/directory";
import { EMPLOYEE_STATUSES } from "@/services/employee-rules";
import { useDB } from "@/services/store";
import { fmtDate, relTime } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/employees/")({
  head: () => ({
    meta: [
      { title: "Employee Management — Renda Admin" },
      { name: "description", content: "Invite, manage and review Renda Admin employee accounts." },
      { property: "og:title", content: "Employee Management — Renda Admin" },
      { property: "og:description", content: "Employee accounts, roles and access status." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Employees,
});

function Employees() {
  const navigate = useNavigate();
  const db = useDB();
  const { data, isLoading, error } = useQuery(directoryQuery);
  const canManage = usePermission("employees.manage");
  const canManageRoles = usePermission("roles.manage");
  const [q, setQ] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("all");
  const [adding, setAdding] = useState(false);

  const rows = useMemo(
    () =>
      (data?.employees ?? []).filter(
        (e) =>
          (role === "all" || e.role?.name === role) &&
          (status === "all" || e.status === status) &&
          (!q || `${e.name} ${e.email}`.toLowerCase().includes(q.trim().toLowerCase())),
      ),
    [data, q, role, status],
  );

  const cols: Column<EmployeeRecord>[] = [
    {
      key: "name",
      header: "Employee",
      sort: (e) => e.name.toLowerCase(),
      cell: (e) => (
        <span className="flex items-center gap-3">
          <Avatar name={e.name} />
          <span className="min-w-0">
            <span className="block font-medium">
              {e.name}
              {e.id === db.currentEmployeeId && (
                <span className="ml-1.5 text-[12px] font-normal text-muted-foreground">(you)</span>
              )}
            </span>
            <span className="block text-[13px] text-muted-foreground">
              {e.job_title || e.department}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "code",
      header: "Employee ID",
      sort: (e) => e.employee_code,
      cell: (e) => <Mono>{e.employee_code}</Mono>,
    },
    {
      key: "email",
      header: "Email",
      sort: (e) => e.email,
      cell: (e) => <span className="text-muted-foreground">{e.email}</span>,
    },
    { key: "dept", header: "Department", sort: (e) => e.department, cell: (e) => e.department },
    {
      key: "role",
      header: "Role",
      sort: (e) => e.role?.name ?? "",
      cell: (e) => e.role?.name ?? <span className="text-muted-foreground">No role</span>,
    },
    {
      key: "status",
      header: "Status",
      sort: (e) => e.status,
      cell: (e) => (
        <EmployeeStatusSelect employee={e} editable={canManage && e.id !== db.currentEmployeeId} />
      ),
    },
    {
      key: "login",
      header: "Last login",
      sort: (e) => e.last_login_at ?? "",
      cell: (e) =>
        e.last_login_at ? (
          <span className="tabular text-muted-foreground" title={fmtDate(e.last_login_at)}>
            {relTime(e.last_login_at)}
          </span>
        ) : (
          <span className="text-muted-foreground">Never</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Employee Management"
        subtitle="Invite, manage and review the employees who can access Renda Admin."
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/employees/roles">
                <KeyRound className="size-4" /> Roles & Permissions
              </Link>
            </Button>
            {canManage && (
              <Button onClick={() => setAdding(true)}>
                <UserPlus className="size-4" /> Add Employee
              </Button>
            )}
          </>
        }
      />
      {error ? (
        <div className="panel p-6 text-[14px] text-danger">
          The employee directory couldn't be loaded. Refresh the page to try again.
        </div>
      ) : (
        <DataTable
          rows={rows}
          columns={cols}
          rowKey={(e) => e.id}
          defaultSort={{ key: "name", dir: "asc" }}
          onRowClick={(e) =>
            navigate({ to: "/employees/$employeeId", params: { employeeId: e.id } })
          }
          emptyTitle={isLoading ? "Loading employees…" : "No employees match"}
          emptyDescription={isLoading ? undefined : "Try a different name, email, role or status."}
          toolbar={
            <>
              <SearchInput value={q} onChange={setQ} placeholder="Search by name or email" />
              <FilterSelect
                label="Role"
                value={role}
                onChange={setRole}
                options={(data?.roles ?? []).map((r) => r.name)}
              />
              <FilterSelect
                label="Status"
                value={status}
                onChange={setStatus}
                options={EMPLOYEE_STATUSES}
              />
            </>
          }
        />
      )}
      {!canManage && (
        <p className="mt-3 text-[13px] text-muted-foreground">
          Only employees with the "Manage employee accounts" permission can add employees or change
          account status.
        </p>
      )}
      {data && (
        <AddEmployeeDialog
          open={adding}
          onOpenChange={setAdding}
          roles={data.roles}
          canManageRoles={canManageRoles}
        />
      )}
    </>
  );
}
