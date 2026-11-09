import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout, FormError } from "@/components/auth/AuthLayout";
import { PasswordFields } from "@/components/auth/PasswordFields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { bootstrapAdministrator, recordSignIn } from "@/services/employees.functions";
import { passwordIssues } from "@/services/employee-rules";
import { rememberSession } from "@/services/directory";

export const Route = createFileRoute("/setup")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.rpc("setup_required");
    if (data !== true) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "Set up Renda Admin" },
      { name: "description", content: "Create the first Renda Admin administrator account." },
      { property: "og:title", content: "Set up Renda Admin" },
      { property: "og:description", content: "First-time setup for the Renda Admin employee workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Setup,
});

function Setup() {
  const navigate = useNavigate();
  const create = useServerFn(bootstrapAdministrator);
  const record = useServerFn(recordSignIn);
  const [f, setF] = useState({ firstName: "", lastName: "", email: "" });
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!f.firstName.trim() || !f.lastName.trim() || !/^\S+@\S+\.\S+$/.test(f.email.trim())) return setError("Enter your name and a valid work email.");
    const issues = passwordIssues(password);
    if (issues.length) return setError(`Your password needs: ${issues.join(", ").toLowerCase()}.`);
    if (password !== confirm) return setError("Passwords don't match.");
    setBusy(true);
    setError(null);
    try {
      await create({ data: { ...f, password } });
      rememberSession(true);
      const { error: err } = await supabase.auth.signInWithPassword({ email: f.email.trim().toLowerCase(), password });
      if (err) throw new Error("Your account was created. Sign in to continue.");
      await record().catch(() => undefined);
      navigate({ to: "/", replace: true });
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : "Setup failed. Try again.");
    }
  }

  return (
    <AuthLayout>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <div>
          <h1 className="text-[22px] font-semibold leading-tight">Create administrator</h1>
          <p className="mt-2 text-[14px] text-muted-foreground">First-time setup. Available only until the first account exists.</p>
        </div>
        <FormError>{error}</FormError>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="fn">First name</Label><Input id="fn" className="h-11" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="ln">Last name</Label><Input id="ln" className="h-11" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></div>
        </div>
        <div className="space-y-2"><Label htmlFor="em">Work email address</Label><Input id="em" type="email" className="h-11" autoComplete="username" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        <PasswordFields password={password} confirm={confirm} onPassword={setPassword} onConfirm={setConfirm} />
        <Button type="submit" size="lg" className="h-11 w-full text-[15px]" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Create administrator</Button>
        <p className="text-center text-[14px] text-muted-foreground"><Link to="/auth" className="hover:text-foreground">Back to sign in</Link></p>
      </form>
    </AuthLayout>
  );
}
