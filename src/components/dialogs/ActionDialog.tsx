import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { SimulatedNote, run } from "@/components/common";

/** Confirmation dialog with optional required reason. The action runs through `run` for toast feedback. */
export function ActionDialog({
  trigger, title, description, confirmLabel = "Confirm", reasonLabel, minReason = 5, simulated, destructive, onConfirm, success, children, disabled,
}: {
  trigger: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  reasonLabel?: string;
  minReason?: number;
  simulated?: boolean | string;
  destructive?: boolean;
  onConfirm: (reason: string) => void;
  success: string;
  children?: ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const invalid = !!reasonLabel && reason.trim().length < minReason;
  return (
    <>
      <span onClick={() => !disabled && setOpen(true)} className="contents">{trigger}</span>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setReason(""); setTouched(false); } }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>
          <div className="space-y-3">
            {children}
            {reasonLabel && (
              <div className="space-y-1.5">
                <Label htmlFor="reason">{reasonLabel}</Label>
                <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => setTouched(true)} rows={3} />
                {touched && invalid && <p className="text-[13px] text-danger">Please provide at least {minReason} characters.</p>}
              </div>
            )}
            {simulated && <SimulatedNote>{typeof simulated === "string" ? simulated : undefined}</SimulatedNote>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              variant={destructive ? "destructive" : "default"}
              onClick={() => {
                setTouched(true);
                if (invalid) return;
                if (run(() => onConfirm(reason), success)) setOpen(false);
              }}
            >
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
