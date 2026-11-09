import type { ReactNode } from "react";
import { Fingerprint, LockKeyhole, ScrollText } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ inverted, className }: { inverted?: boolean; className?: string }) {
  return (
    <span className={cn("flex items-center gap-3", className)}>
      <span className={cn("flex size-10 items-center justify-center rounded-lg text-[22px] font-semibold", inverted ? "bg-card text-foreground" : "bg-ink text-ink-foreground")}>
        r<span className="text-brand">.</span>
      </span>
      <span className={cn("text-[20px] font-semibold", inverted ? "text-ink-foreground" : "text-foreground")}>Renda Admin</span>
    </span>
  );
}

const POINTS = [
  { icon: LockKeyhole, text: "Access matched to your role and permissions" },
  { icon: Fingerprint, text: "Two-step verification for every account that enables it" },
  { icon: ScrollText, text: "Every sign-in and sensitive action is recorded" },
];

/** Full-screen gradient frame for employee authentication screens. No dashboard navigation. */
export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth-gradient min-h-screen">
      <div className="mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_460px] lg:px-10">
        <div className="hidden lg:block">
          <BrandMark inverted />
          <h2 className="mt-12 max-w-md text-[40px] font-semibold leading-[1.15] text-ink-foreground">The secure workspace for Renda's operations teams.</h2>
          <p className="mt-4 max-w-md text-[16px] leading-relaxed text-ink-foreground/70">Customers, banking, cards, compliance and support — handled in one place, with the right access for every employee.</p>
          <ul className="mt-10 space-y-4">
            {POINTS.map((p) => (
              <li key={p.text} className="flex items-center gap-3 text-[15px] text-ink-foreground/85">
                <span className="flex size-9 items-center justify-center rounded-full border border-ink-foreground/15 bg-ink-foreground/5"><p.icon className="size-4" strokeWidth={1.75} /></span>
                {p.text}
              </li>
            ))}
          </ul>
        </div>
        <div className="w-full">
          <div className="mb-8 flex justify-center lg:hidden"><BrandMark inverted /></div>
          <div className="rounded-2xl bg-card p-7 shadow-auth sm:p-10">{children}</div>
          <p className="mt-6 text-center text-[13px] text-ink-foreground/60">Authorized Renda personnel only. Sign-in activity is monitored.</p>
        </div>
      </div>
    </div>
  );
}

export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div role="alert" className="rounded-md border border-danger/25 bg-danger-soft px-3.5 py-3 text-[14px] text-danger">{children}</div>;
}
