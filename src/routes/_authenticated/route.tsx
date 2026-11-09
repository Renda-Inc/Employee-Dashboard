import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { AppShell } from "@/components/layout/AppShell";
import { resolveAccess } from "@/services/directory";

// Employee workspace gate: only signed-in, active employees (with MFA when enrolled) get past here.
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ context, location }) => {
    const access = await resolveAccess(context.queryClient);
    if (access.kind === "signin") {
      throw redirect({ to: "/auth", search: { redirect: location.href, ...(access.reason ? { reason: access.reason } : {}) } });
    }
    if (access.kind === "mfa") throw redirect({ to: "/auth", search: { redirect: location.href } });
    if (access.kind === "set-password") throw redirect({ to: "/set-password" });
    return { employee: access.me };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
