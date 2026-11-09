import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Eye, EyeOff, Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AuthLayout, BrandMark, FormError } from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { needsMfa, ownAccess, rememberSession, safeRedirect, signOutEverywhere } from "@/services/directory";
import { recordSignIn } from "@/services/employees.functions";

type Reason = "denied" | "expired";

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): { redirect?: string; reason?: Reason } => {
    const redirect = safeRedirect(s["redirect"]);
    const reason = s["reason"] === "denied" || s["reason"] === "expired" ? (s["reason"] as Reason) : undefined;
    return { ...(redirect ? { redirect } : {}), ...(reason ? { reason } : {}) };
  },
  head: () => ({
    meta: [
      { title: "Sign in — Renda Admin" },
      { name: "description", content: "Sign in to the Renda Admin employee workspace." },
      { property: "og:title", content: "Sign in — Renda Admin" },
      { property: "og:description", content: "Employee sign-in for Renda Admin." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SignIn,
});

const INVALID = "The email or password you entered is incorrect. Check your details and try again.";
const DENIED = "This account can't access Renda Admin right now. Contact your administrator for help.";
const REASONS: Record<Reason, string> = { denied: DENIED, expired: "Your session ended when the browser closed. Please sign in again." };

function SignIn() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const record = useServerFn(recordSignIn);
  const [step, setStep] = useState<"loading" | "credentials" | "mfa">("loading");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(search.reason ? REASONS[search.reason] : null);
  const [setupRequired, setSetupRequired] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const fresh = useRef(false);

  async function finish(userId: string) {
    const { me, role } = await ownAccess(userId);
    if (!me || me.status === "Inactive" || me.status === "Suspended" || !role) {
      await signOutEverywhere(queryClient);
      setError(DENIED);
      setStep("credentials");
      setBusy(false);
      return;
    }
    if (fresh.current) await record().catch(() => undefined);
    if (me.must_change_password) {
      navigate({ to: "/set-password", replace: true });
      return;
    }
    navigate({ href: search.redirect && search.redirect !== "/auth" ? search.redirect : role.landing_page, replace: true });
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        if (await needsMfa()) return setStep("mfa");
        return finish(data.session.user.id);
      }
      setStep("credentials");
      const { data: setup } = await supabase.rpc("setup_required");
      if (!cancelled) setSetupRequired(setup === true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your work email and password.");
      return;
    }
    setBusy(true);
    rememberSession(remember);
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err || !data.user) {
      setBusy(false);
      setError(err?.status === 429 ? "Too many sign-in attempts. Wait a few minutes, then try again." : INVALID);
      return;
    }
    fresh.current = true;
    if (await needsMfa()) {
      setBusy(false);
      setStep("mfa");
      return;
    }
    await finish(data.user.id);
  }

  async function onVerify(e?: FormEvent) {
    e?.preventDefault();
    if (code.length !== 6) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const factor = factors?.totp.find((f) => f.status === "verified");
    const { data: session } = await supabase.auth.getSession();
    if (!factor || !session.session) {
      setBusy(false);
      setStep("credentials");
      return setError("Your verification session expired. Sign in again.");
    }
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    if (err) {
      setBusy(false);
      setCode("");
      return setError("That code didn't work. Check your authenticator app and try again.");
    }
    fresh.current = true;
    await finish(session.session.user.id);
  }

  return (
    <AuthLayout>
      {step === "loading" && <div className="flex h-72 items-center justify-center text-muted-foreground"><Loader2 className="size-5 animate-spin" aria-label="Loading" /></div>}

      {step === "credentials" && (
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <div>
            <BrandMark className="mb-8 hidden lg:flex" />
            <h1 className="text-[28px] font-semibold leading-tight">Welcome to Renda Admin</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">Sign in to access your employee workspace.</p>
          </div>
          <FormError>{error}</FormError>
          <div className="space-y-2">
            <Label htmlFor="email">Work email address</Label>
            <Input id="email" type="email" autoComplete="username" placeholder="name@renda.ca" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11" autoFocus />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button type="button" onClick={() => setForgotOpen(true)} className="text-[13px] font-medium text-foreground underline-offset-4 hover:underline">Forgot password?</button>
            </div>
            <div className="relative">
              <Input id="password" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 pr-11" />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground">
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(v === true)} />
            <Label htmlFor="remember" className="font-normal text-muted-foreground">Keep me signed in on this device</Label>
          </div>
          <Button type="submit" size="lg" className="h-11 w-full text-[15px]" disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />} Sign in
          </Button>
          {setupRequired && (
            <p className="rounded-md bg-secondary px-3.5 py-3 text-[13px] text-muted-foreground">
              No employee accounts exist yet. <Link to="/setup" className="font-medium text-foreground underline underline-offset-4">Set up the first administrator</Link>
            </p>
          )}
        </form>
      )}

      {step === "mfa" && (
        <form onSubmit={onVerify} className="space-y-6">
          <div>
            <span className="mb-6 flex size-11 items-center justify-center rounded-full bg-secondary"><ShieldCheck className="size-5" strokeWidth={1.75} /></span>
            <h1 className="text-[26px] font-semibold leading-tight">Two-step verification</h1>
            <p className="mt-2 text-[15px] text-muted-foreground">Enter the 6-digit code from your authenticator app to continue.</p>
          </div>
          <FormError>{error}</FormError>
          <InputOTP maxLength={6} value={code} onChange={setCode} onComplete={() => undefined} autoFocus aria-label="Verification code">
            <InputOTPGroup>
              {[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} className="h-12 w-12 text-[18px]" />)}
            </InputOTPGroup>
          </InputOTP>
          <Button type="submit" size="lg" className="h-11 w-full text-[15px]" disabled={busy}>{busy && <Loader2 className="size-4 animate-spin" />} Verify and continue</Button>
          <button type="button" className="w-full text-center text-[14px] text-muted-foreground hover:text-foreground" onClick={async () => { await signOutEverywhere(queryClient); setCode(""); setError(null); setStep("credentials"); }}>
            Use a different account
          </button>
        </form>
      )}

      <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Forgot your password?</DialogTitle>
            <DialogDescription>For security, Renda Admin passwords can't be reset from the sign-in page.</DialogDescription>
          </DialogHeader>
          <p className="text-[14px]">Contact your Renda Admin administrator. They'll issue a new temporary password, and you'll choose your own password the next time you sign in.</p>
          <DialogFooter><Button onClick={() => setForgotOpen(false)}>Got it</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </AuthLayout>
  );
}
