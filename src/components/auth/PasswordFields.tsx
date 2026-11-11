import { useState } from "react";
import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const RULES: [string, (p: string) => boolean][] = [
  ["At least 12 characters", (p) => p.length >= 12],
  ["An uppercase letter", (p) => /[A-Z]/.test(p)],
  ["A lowercase letter", (p) => /[a-z]/.test(p)],
  ["A number", (p) => /[0-9]/.test(p)],
];

/** New password + confirmation with live requirement checklist. */
export function PasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
}: {
  password: string;
  confirm: string;
  onPassword: (v: string) => void;
  onConfirm: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="new-password">New password</Label>
        <div className="relative">
          <Input
            id="new-password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            value={password}
            onChange={(e) => onPassword(e.target.value)}
            className="h-11 pr-11"
          />
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5 pt-1">
          {RULES.map(([label, ok]) => {
            const met = ok(password);
            return (
              <li
                key={label}
                className={cn(
                  "flex items-center gap-1.5 text-[13px]",
                  met ? "text-success" : "text-muted-foreground",
                )}
              >
                {met ? <Check className="size-3.5" /> : <Circle className="size-3" />} {label}
              </li>
            );
          })}
        </ul>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirm new password</Label>
        <Input
          id="confirm-password"
          type={show ? "text" : "password"}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => onConfirm(e.target.value)}
          className="h-11"
          aria-invalid={!!confirm && confirm !== password}
        />
        {!!confirm && confirm !== password && (
          <p className="text-[13px] text-danger">Passwords don't match.</p>
        )}
      </div>
    </div>
  );
}
