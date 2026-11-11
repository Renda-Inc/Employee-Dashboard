import { SelectField } from "@/components/ui/select-field";
import { Button } from "@/components/ui/button";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, ShieldCheck, Landmark, ArrowLeftRight, Send, CreditCard, BadgeCheck, PiggyBank, Sparkles,
  LifeBuoy, UserCog, ScrollText, Settings as SettingsIcon, Search, Bell, CircleHelp, ChevronRight, PanelLeftClose, PanelLeft,
  ChevronDown, LogOut, UserRound, FlaskConical, KeyRound, Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDB } from "@/services/store";
import { currentEmployee } from "@/services/actions";
import { operations } from "@/services/api";
import { signOutEverywhere } from "@/services/directory";
import { globalSearch, notifications, type SearchResult } from "@/services/selectors";
import { can, type Permission } from "@/services/permissions";
import { Avatar } from "@/components/common";
import { fullName, relTime } from "@/lib/format";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

type NavItem = { title: string; to: string; icon: typeof Users; perm?: Permission };
const MAIN: NavItem[] = [
  { title: "Overview", to: "/", icon: LayoutDashboard },
  { title: "Customers", to: "/customers", icon: Users, perm: "customers.view" },
  { title: "Onboarding & KYC", to: "/onboarding", icon: ShieldCheck, perm: "kyc.view" },
  { title: "Banking & Accounts", to: "/accounts", icon: Landmark, perm: "accounts.view" },
  { title: "Transactions", to: "/transactions", icon: ArrowLeftRight, perm: "transactions.view" },
  { title: "Payments & Transfers", to: "/transfers", icon: Send, perm: "transactions.view" },
  { title: "Cards", to: "/cards", icon: CreditCard, perm: "cards.view" },
  { title: "Plans & Subscriptions", to: "/subscriptions", icon: BadgeCheck, perm: "subscriptions.view" },
  { title: "Savings Goals", to: "/savings", icon: PiggyBank, perm: "customers.view" },
  { title: "Alfie", to: "/alfie", icon: Sparkles, perm: "alfie.view" },
  { title: "Customer Support", to: "/support", icon: LifeBuoy, perm: "support.view" },
];
const MGMT: NavItem[] = [
  { title: "Employee Management", to: "/employees", icon: UserCog },
  { title: "Roles & Permissions", to: "/employees/roles", icon: KeyRound },
  { title: "Audit Logs", to: "/audit", icon: ScrollText, perm: "audit.view" },
  { title: "Settings", to: "/settings", icon: SettingsIcon },
];
const ALL_NAV = [...MAIN, ...MGMT];

function useActiveNav() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const matches = (to: string) => (to === "/" ? path === "/" : path === to || path.startsWith(to + "/"));
  // The most specific navigation item wins (e.g. Roles & Permissions over Employee Management).
  const best = ALL_NAV.filter((n) => matches(n.to)).sort((a, b) => b.to.length - a.to.length)[0]?.to;
  return { path, active: (to: string) => to === best };
}

function ProfileMenu({ children, align = "end" }: { children: ReactNode; align?: "end" | "start" }) {
  const db = useDB();
  const me = currentEmployee(db);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    try {
      await signOutEverywhere(queryClient);
      navigate({ to: "/auth", replace: true });
    } catch {
      setSigningOut(false);
      toast.error("We couldn't sign you out. Try again.");
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="text-[14px] font-medium">{me.name}</div>
          <div className="text-[12px] text-muted-foreground">{me.email}</div>
          <div className="mt-1 text-[12px] font-medium text-muted-foreground">{me.role}</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate({ to: "/employees/$employeeId", params: { employeeId: me.id } })}><UserRound /> My employee profile</DropdownMenuItem>
        <DropdownMenuItem onClick={() => navigate({ to: "/settings" })}><SettingsIcon /> Preferences & security</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={signingOut} onSelect={(e) => { e.preventDefault(); void signOut(); }}>{signingOut ? <Loader2 className="animate-spin" /> : <LogOut />} Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const db = useDB();
  const me = currentEmployee(db);
  const { active } = useActiveNav();
  const [operationsOpen, setOperationsOpen] = useState(true);
  const [managementOpen, setManagementOpen] = useState(true);
  const item = (n: NavItem) => {
    const allowed = !n.perm || can(me.role, n.perm);
    const isActive = active(n.to);
    return (
      <Link
        key={n.to}
        to={n.to}
        title={n.title}
        className={cn(
          "relative flex h-10 items-center gap-3 rounded-md px-3 text-[14px] transition-colors",
          isActive ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
          !allowed && "opacity-50",
          collapsed && "justify-center px-0",
        )}
      >
        {isActive && <span className="absolute inset-y-1.5 left-0 w-[2px] rounded-full bg-primary" aria-hidden />}
        <n.icon className="size-[18px] shrink-0" strokeWidth={1.75} />
        {!collapsed && <span className="truncate">{n.title}</span>}
      </Link>
    );
  };
  return (
    <aside className={cn("sticky top-0 hidden h-screen shrink-0 flex-col border-r bg-sidebar lg:flex", collapsed ? "w-[72px]" : "w-[264px]")}>
      <div className={cn("flex h-[76px] items-center", collapsed ? "justify-center" : "justify-between px-4")}>
        {!collapsed && (
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-md bg-ink text-lg font-semibold text-ink-foreground">r<span className="text-brand">.</span></span>
            <span className="text-[18px] font-semibold">Renda Admin</span>
          </Link>
        )}
        <Button variant="ghost" onClick={onToggle} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="size-8 p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
          {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
        </Button>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
        {!collapsed && <Button variant="ghost" aria-expanded={operationsOpen} onClick={() => setOperationsOpen((o) => !o)} className="mb-2 h-8 w-full justify-between px-3 text-[12px] text-muted-foreground">Operations <ChevronDown className={cn("size-3", !operationsOpen && "-rotate-90")} /></Button>}
        {(collapsed || operationsOpen) && MAIN.map(item)}
        <div className="my-3 border-t" />
        {!collapsed && <Button variant="ghost" aria-expanded={managementOpen} onClick={() => setManagementOpen((o) => !o)} className="mb-2 h-8 w-full justify-between px-3 text-[12px] text-muted-foreground">Administration <ChevronDown className={cn("size-3", !managementOpen && "-rotate-90")} /></Button>}
        {(collapsed || managementOpen) && MGMT.map(item)}
      </nav>
      <ProfileMenu align="start">
        <Button variant="ghost" className={cn("flex items-center h-auto justify-start gap-2.5 rounded-none border-t px-4 py-5 text-left hover:bg-secondary", collapsed && "justify-center px-0")}>
          <Avatar name={me.name} size="md" />
          {!collapsed && (
            <span className="min-w-0">
              <span className="block truncate text-[14px] font-medium">{me.name}</span>
              <span className="block truncate text-[12px] text-muted-foreground">{me.role}</span>
            </span>
          )}
        </Button>
      </ProfileMenu>
    </aside>
  );
}

function Breadcrumbs() {
  const db = useDB();
  const { path } = useActiveNav();
  const segs = path.split("/").filter(Boolean);
  const top = ALL_NAV.find((n) => n.to === "/" + (segs[0] ?? "")) ?? ALL_NAV[0];
  const crumbs: { label: string; to?: string }[] = [{ label: top.title, to: top.to }];
  if (segs[0] === "employees" && segs[1]) {
    if (segs[1] === "roles") crumbs.splice(0, 1, { label: "Roles & Permissions" });
    else crumbs.push({ label: db.employees.find((e) => e.id === segs[1])?.name ?? "Employee" });
  } else if (segs[1] === "manufacturing") {
    crumbs.push({ label: "Card Manufacturing", to: "/cards/manufacturing" });
    if (segs[2]) crumbs.push({ label: db.batches.find((b) => b.id === segs[2])?.batchReference ?? "Batch" });
  } else if (segs[1]) {
    const id = segs[1];
    const c = db.customers.find((x) => x.id === id);
    const label = c ? fullName(c)
      : db.accounts.find((a) => a.id === id)?.accountType
      ?? db.transactions.find((t) => t.id === id)?.transactionReference
      ?? (db.cards.find((x) => x.id === id) ? `Card •••• ${db.cards.find((x) => x.id === id)?.last4}` : undefined)
      ?? db.supportCases.find((s) => s.id === id)?.caseReference
      ?? "Details";
    crumbs.push({ label });
  }
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-[14px]">
      {crumbs.map((c, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
          {c.to && i < crumbs.length - 1 ? (
            <Link to={c.to} className="truncate text-muted-foreground hover:text-foreground">{c.label}</Link>
          ) : (
            <span className="truncate font-medium">{c.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

const GROUP_PERM: Record<SearchResult["group"], Permission> = {
  Customers: "customers.view", Accounts: "accounts.view", Transactions: "transactions.view", Cards: "cards.view", "Support Cases": "support.view",
};

function GlobalSearch() {
  const db = useDB();
  const me = currentEmployee(db);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setOpen((o) => !o); }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);
  const results = useMemo(() => globalSearch(db, q, (g) => can(me.role, GROUP_PERM[g])), [db, q, me.role]);
  const groups = Array.from(new Set(results.map((r) => r.group)));
  return (
    <>
      <Button variant="ghost" aria-label="Search Renda Admin" onClick={() => setOpen(true)} className="flex h-10 w-full max-w-md items-center gap-2 rounded-md border bg-background px-2.5 text-[14px] text-muted-foreground hover:border-foreground/20">
        <Search className="size-4" />
        <span className="flex-1 truncate text-left">Search Renda Admin…</span>
        <kbd className="hidden rounded border bg-card px-1 font-mono text-[12px] sm:inline">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQ(""); }}>
        <CommandInput placeholder="Search by name, Renda user ID, reference, card last 4…" value={q} onValueChange={setQ} />
        <CommandList>
          {q.trim().length < 2 ? (
            <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">Type at least 2 characters. Results respect your role's permissions.</div>
          ) : (
            <CommandEmpty>No results for “{q}”.</CommandEmpty>
          )}
          {groups.map((g) => (
            <CommandGroup key={g} heading={g}>
              {results.filter((r) => r.group === g).map((r) => (
                <CommandItem key={r.group + r.id} value={`${r.group} ${r.title} ${r.subtitle} ${r.id}`} onSelect={() => { setOpen(false); setQ(""); navigate({ to: r.to, params: r.params }); }}>
                  <div className="min-w-0">
                    <div className="truncate text-[14px]">{r.title}</div>
                    <div className="truncate text-[12px] text-muted-foreground">{r.subtitle}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          ))}
        </CommandList>
      </CommandDialog>
    </>
  );
}

function Notifications() {
  const db = useDB();
  const navigate = useNavigate();
  const list = notifications(db);
  const unread = list.filter((n) => !db.readNotificationIds.includes(n.id));
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" aria-label={`Notifications (${unread.length} unread)`} className="relative rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
          <Bell className="size-4" />
          {unread.length > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[12px] font-semibold leading-4 text-primary-foreground">{unread.length}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(420px,calc(100vw-2rem))] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-[14px] font-semibold">Notifications</span>
          {unread.length > 0 && <Button variant="ghost" className="text-[13px] text-muted-foreground hover:text-foreground" onClick={() => operations.markNotificationsRead(list.map((n) => n.id))}>Mark all read</Button>}
        </div>
        <div className="max-h-96 overflow-y-auto">
          {list.length === 0 && <div className="p-6 text-center text-[13px] text-muted-foreground">You're all caught up.</div>}
          {list.map((n) => {
            const isUnread = !db.readNotificationIds.includes(n.id);
            return (
              <Button variant="ghost" key={n.id} onClick={() => { operations.markNotificationsRead([n.id]); navigate({ to: n.to, params: n.params }); }} className="flex h-auto w-full justify-start whitespace-normal gap-2.5 rounded-none border-b px-5 py-4 text-left last:border-0 hover:bg-secondary">
                <span className={cn("mt-1.5 size-1.5 shrink-0 rounded-full", isUnread ? "bg-primary" : "bg-transparent")} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-medium">{n.type}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{n.record} — {n.detail}</span>
                </span>
                <span className="shrink-0 text-[12px] text-muted-foreground">{relTime(n.at)}</span>
              </Button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function MobileNav() {
  const { path } = useActiveNav();
  const navigate = useNavigate();
  return (
    <SelectField aria-label="Navigate" className="h-10 w-48 shrink-0 rounded-md border bg-card px-3 text-[14px] lg:hidden" value={ALL_NAV.find((n) => (n.to === "/" ? path === "/" : path.startsWith(n.to)))?.to ?? "/"} onChange={(e) => navigate({ to: e.target.value })}>
      {ALL_NAV.map((n) => <option key={n.to} value={n.to}>{n.title}</option>)}
    </SelectField>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const db = useDB();
  const me = currentEmployee(db);
  return (
    <div className="flex min-h-screen w-full">
      <Sidebar collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[76px] items-center gap-4 border-b bg-card/95 px-5 backdrop-blur xl:px-8">
          <MobileNav />
          <div className="hidden min-w-0 flex-1 lg:block"><Breadcrumbs /></div>
          <div className="flex flex-1 justify-end lg:flex-none lg:basis-72 xl:basis-96"><GlobalSearch /></div>
          <span className="hidden items-center gap-1 rounded border border-dashed border-info/40 bg-info-soft px-1.5 py-0.5 text-[12px] font-medium text-info xl:inline-flex" title="Simulated data and integrations">
            <FlaskConical className="size-3" /> Demo environment
          </span>
          <Notifications />
          <a href="#help" onClick={(e) => { e.preventDefault(); toast.info("Operations handbook: internal documentation is not connected in this demo."); }} aria-label="Help" className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"><CircleHelp className="size-4" /></a>
          <ProfileMenu>
            <Button variant="ghost" aria-label="Profile menu" className="size-10 rounded-full p-0"><Avatar name={me.name} size="md" /></Button>
          </ProfileMenu>
        </header>
        <main className="mx-auto w-full max-w-[1680px] flex-1 px-5 py-8 xl:px-8">{children}</main>
      </div>
    </div>
  );
}
