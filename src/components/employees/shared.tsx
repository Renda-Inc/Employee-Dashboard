import { useState, type ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { Check, Copy, Loader2, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export const refreshDirectory = (qc: QueryClient) =>
  Promise.all([qc.invalidateQueries({ queryKey: ["directory"] }), qc.invalidateQueries({ queryKey: ["admin-audit"] })]);

export const errorMessage = (e: unknown, fallback = "Something went wrong. Try again.") => {
  if (e instanceof Error && e.message) {
    // Validation errors arrive as JSON from the input validator.
    try {
      const parsed = JSON.parse(e.message) as { message?: string }[];
      if (Array.isArray(parsed) && parsed[0]?.message) return parsed[0].message;
    } catch {
      /* plain message */
    }
    return e.message;
  }
  return fallback;
};

/** Controlled confirmation for async actions, with optional reason. */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel = "Confirm", destructive, withReason, onConfirm, children,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  destructive?: boolean;
  withReason?: boolean;
  onConfirm: (reason: string) => Promise<void>;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!busy) { onOpenChange(o); if (!o) setReason(""); } }}>
      <DialogContent className="sm:max-w-md" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {withReason && (
          <div className="space-y-2">
            <Label htmlFor="confirm-reason">Reason (recorded in the audit log)</Label>
            <Textarea id="confirm-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Optional" />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant={destructive ? "destructive" : "default"} disabled={busy} onClick={async () => {
            setBusy(true);
            try {
              await onConfirm(reason.trim());
              setReason("");
              onOpenChange(false);
            } finally {
              setBusy(false);
            }
          }}>{busy && <Loader2 className="size-4 animate-spin" />}{confirmLabel}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Shows a system-generated temporary password exactly once. */
export function TemporaryPasswordDialog({ info, onClose }: { info: { title: string; name: string; email: string; password: string } | null; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <Dialog open={!!info} onOpenChange={(o) => { if (!o) { setCopied(false); onClose(); } }}>
      <DialogContent className="sm:max-w-lg">
        {info && (
          <>
            <DialogHeader>
              <DialogTitle>{info.title}</DialogTitle>
              <DialogDescription>A temporary password was generated for {info.name} ({info.email}).</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Temporary password</Label>
              <div className="flex items-center gap-2 rounded-lg border bg-secondary/60 p-2 pl-4">
                <code className="flex-1 select-all break-all font-mono text-[16px] tracking-wide">{info.password}</code>
                <Button variant="outline" size="sm" onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(info.password);
                    setCopied(true);
                    toast.success("Temporary password copied");
                  } catch {
                    toast.error("Copy failed — select the password and copy it manually.");
                  }
                }}>{copied ? <Check className="size-4" /> : <Copy className="size-4" />}{copied ? "Copied" : "Copy"}</Button>
              </div>
            </div>
            <div className="flex gap-3 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[14px] text-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" />
              <p>This password is shown only once. Share it with {info.name} through a secure channel. They'll choose their own password the first time they sign in.</p>
            </div>
            <DialogFooter><Button onClick={() => { setCopied(false); onClose(); }}>Done</Button></DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
