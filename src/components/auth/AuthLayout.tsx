import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <span className="flex size-9 items-center justify-center rounded-lg bg-ink text-[19px] font-semibold text-ink-foreground">
        r<span className="text-brand">.</span>
      </span>
      <span className="text-[18px] font-semibold text-foreground">Renda Admin</span>
    </span>
  );
}

/** Centered employee authentication frame on a bright gradient. No dashboard navigation. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-gradient flex min-h-screen items-center justify-center px-5 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex justify-center">
          <BrandMark />
        </div>
        <div className="rounded-2xl border bg-card p-7 shadow-auth sm:p-8">{children}</div>
      </div>
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <div
      role="alert"
      className="rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-[14px] text-danger"
    >
      {children}
    </div>
  );
}
