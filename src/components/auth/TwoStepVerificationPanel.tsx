import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/common";
import { StatusBadge } from "@/components/status/StatusBadge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { ConfirmDialog } from "@/components/employees/shared";

type Enrollment = { factorId: string; qr: string; secret: string };

/** Lets the signed-in employee turn authenticator-app verification on or off for their own account. */
export function TwoStepVerificationPanel() {
  const [loading, setLoading] = useState(true);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOff, setConfirmOff] = useState(false);

  async function refresh() {
    const { data } = await supabase.auth.mfa.listFactors();
    setFactorId(data?.totp.find((f) => f.status === "verified")?.id ?? null);
    setLoading(false);
  }
  useEffect(() => { void refresh(); }, []);

  async function start() {
    setBusy(true);
    setError(null);
    const { data: list } = await supabase.auth.mfa.listFactors();
    for (const f of list?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data, error: err } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Renda Admin ${new Date().toISOString().slice(0, 10)}` });
    setBusy(false);
    if (err || !data) return setError("Two-step verification couldn't be started. Try again.");
    setEnrolling({ factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  }

  async function verify() {
    if (!enrolling || code.length !== 6) return setError("Enter the 6-digit code from your authenticator app.");
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId: enrolling.factorId, code });
    setBusy(false);
    if (err) { setCode(""); return setError("That code didn't work. Check the time on your device and try again."); }
    setEnrolling(null);
    setCode("");
    toast.success("Two-step verification is on");
    void refresh();
  }

  return (
    <Panel title="Two-step verification" actions={!loading && <StatusBadge status={factorId ? "On" : "Off"} tone={factorId ? "success" : "neutral"} />}>
      {loading ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : enrolling ? (
        <div className="space-y-4">
          <p className="text-[14px]">Scan this code with an authenticator app (such as 1Password, Google Authenticator or Microsoft Authenticator), then enter the 6-digit code it shows.</p>
          <div className="flex flex-wrap items-center gap-5">
            <img src={enrolling.qr} alt="Authenticator setup code" className="size-40 rounded-lg border bg-card p-2" />
            <div className="min-w-0 space-y-1">
              <div className="eyebrow">Can't scan? Enter this key</div>
              <code className="block break-all font-mono text-[13px]">{enrolling.secret}</code>
            </div>
          </div>
          {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}
          <div className="space-y-2">
            <Label>Verification code</Label>
            <InputOTP maxLength={6} value={code} onChange={setCode} aria-label="Verification code">
              <InputOTPGroup>{[0, 1, 2, 3, 4, 5].map((i) => <InputOTPSlot key={i} index={i} />)}</InputOTPGroup>
            </InputOTP>
          </div>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={verify}>{busy && <Loader2 className="size-4 animate-spin" />}Turn on</Button>
            <Button variant="outline" disabled={busy} onClick={async () => { await supabase.auth.mfa.unenroll({ factorId: enrolling.factorId }); setEnrolling(null); setCode(""); setError(null); }}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="flex max-w-md items-start gap-2.5 text-[14px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-foreground" />
            {factorId ? "You'll enter a code from your authenticator app each time you sign in." : "Add a code from an authenticator app to every sign-in for stronger account protection."}
          </p>
          {error && <p role="alert" className="text-[14px] text-danger">{error}</p>}
          {factorId
            ? <Button variant="outline" onClick={() => setConfirmOff(true)}>Turn off</Button>
            : <Button disabled={busy} onClick={start}>{busy && <Loader2 className="size-4 animate-spin" />}Set up</Button>}
        </div>
      )}
      <ConfirmDialog open={confirmOff} onOpenChange={setConfirmOff} title="Turn off two-step verification?" description="Your account will be protected by your password only." confirmLabel="Turn off" destructive
        onConfirm={async () => {
          if (!factorId) return;
          const { error: err } = await supabase.auth.mfa.unenroll({ factorId });
          if (err) { toast.error("Two-step verification couldn't be turned off. Try again."); throw err; }
          toast.success("Two-step verification is off");
          await refresh();
        }} />
    </Panel>
  );
}
