import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { auth } from "@/services/api";
import { AuthLayout, FormError } from "@/components/auth/AuthLayout";
import { PasswordFields } from "@/components/auth/PasswordFields";
import { Button } from "@/components/ui/button";
import { passwordIssues } from "@/services/employee-rules";
import { landingPath, signOutEverywhere } from "@/services/directory";

export const Route = createFileRoute("/set-password")({
  ssr: false,
  beforeLoad: async () => {
    if (!(await auth.getSession())) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Choose your password | Renda Admin" },
      { name: "description", content: "Choose a personal password for your Renda Admin account." },
      { property: "og:title", content: "Choose your password | Renda Admin" },
      {
        property: "og:description",
        content: "Set a personal password before entering Renda Admin.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SetPassword,
});

function SetPassword() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const issues = passwordIssues(password);
    if (issues.length) return setError(`Your password needs: ${issues.join(", ").toLowerCase()}.`);
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await auth.completePasswordSetup(password);
      navigate({ href: await landingPath(), replace: true });
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "We couldn't save your password. Try again.");
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div>
          <h1 className="flex items-center gap-2 text-[22px] font-semibold leading-tight">
            <KeyRound className="size-5" strokeWidth={1.75} /> Set a new password
          </h1>
          <p className="mt-2 text-[14px] text-muted-foreground">
            Replace your temporary password to continue.
          </p>
        </div>
        <FormError>{error}</FormError>
        <PasswordFields
          password={password}
          confirm={confirm}
          onPassword={setPassword}
          onConfirm={setConfirm}
        />
        <Button type="submit" size="lg" className="h-11 w-full text-[15px]" disabled={busy}>
          {busy && <Loader2 className="size-4 animate-spin" />} Save password and continue
        </Button>
        <button
          type="button"
          className="w-full text-center text-[14px] text-muted-foreground hover:text-foreground"
          onClick={async () => {
            await signOutEverywhere(queryClient);
            navigate({ to: "/auth", replace: true });
          }}
        >
          Sign out
        </button>
      </form>
    </AuthLayout>
  );
}
