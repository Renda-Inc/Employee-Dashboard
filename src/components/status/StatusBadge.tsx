import { cn } from "@/lib/utils";

type Tone = "success" | "warning" | "danger" | "neutral" | "info" | "brand";

const TONE: Record<string, Tone> = {
  Active: "success",
  Completed: "success",
  Approved: "success",
  Issued: "success",
  Paid: "success",
  Resolved: "success",
  Activated: "success",
  Submitted: "success",
  Operational: "success",
  Success: "success",
  Verified: "success",
  Pending: "warning",
  "In Progress": "warning",
  "Under Review": "warning",
  "KYC Pending": "warning",
  "KYC Under Review": "warning",
  "Email Verification Pending": "warning",
  "Onboarding In Progress": "warning",
  "Account Issuance Pending": "warning",
  "Setup In Progress": "info",
  "KYC Approved": "info",
  "Email Verified": "info",
  Registered: "neutral",
  "Pending Issuance": "warning",
  "Awaiting Customer": "warning",
  "Awaiting Manufacturing": "warning",
  "Ready for Submission": "warning",
  Eligible: "info",
  Batched: "info",
  "In Production": "info",
  Draft: "neutral",
  Degraded: "warning",
  Simulated: "info",
  Warning: "warning",
  Info: "info",
  Open: "info",
  Normal: "neutral",
  Low: "neutral",
  High: "warning",
  Urgent: "danger",
  Failed: "danger",
  "KYC Failed": "danger",
  "Account Issuance Failed": "danger",
  "Issuance Failed": "danger",
  Blocked: "danger",
  Restricted: "danger",
  Locked: "danger",
  Escalated: "danger",
  Denied: "danger",
  Outage: "danger",
  Error: "danger",
  Reversed: "neutral",
  Closed: "neutral",
  Canceled: "neutral",
  Replaced: "neutral",
  "Not Started": "neutral",
  "Not Applicable": "neutral",
  Unverified: "neutral",
  Suspended: "danger",
  Inactive: "neutral",
  "Invitation Pending": "warning",
  Paused: "neutral",
  System: "neutral",
  Custom: "info",
  Plus: "brand",
  Everyday: "neutral",
};

const STYLE: Record<Tone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  neutral: "bg-neutral-soft text-neutral",
  brand: "bg-secondary text-foreground",
};
const DOT: Record<Tone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-neutral",
  brand: "bg-primary",
};

export function StatusBadge({
  status,
  tone,
  className,
}: {
  status: string;
  tone?: Tone;
  className?: string;
}) {
  const t = tone ?? TONE[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-medium",
        STYLE[t],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOT[t])} aria-hidden />
      {status}
    </span>
  );
}

export function PlanBadge({ plan }: { plan: string | undefined }) {
  if (!plan) return <span className="text-muted-foreground">-</span>;
  return <StatusBadge status={plan === "Plus" ? "Plus" : "Everyday"} />;
}
