import { SelectField } from "@/components/ui/select-field";
import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useDB } from "@/services/store";
import { operations } from "@/services/api";
import { Avatar, run } from "@/components/common";
import { StatusBadge } from "@/components/status/StatusBadge";
import { fmtDate, fullName } from "@/lib/format";
import { searchCustomers } from "@/lib/customerSearch";
import type { CaseCategory, CaseLink, CasePriority } from "@/types/models";

const CATS: CaseCategory[] = [
  "Account Access",
  "Verification",
  "Banking Account",
  "Transaction",
  "Transfer",
  "Card",
  "Membership",
  "Savings",
  "Alfie",
  "General Inquiry",
];

export function NewCaseDialog({
  trigger,
  customerId,
  link,
  defaultCategory = "General Inquiry",
  defaultSubject = "",
  title = "Open support case",
}: {
  trigger: ReactNode;
  customerId?: string;
  link?: CaseLink;
  defaultCategory?: CaseCategory;
  defaultSubject?: string;
  title?: string;
}) {
  const db = useDB();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [cid, setCid] = useState(customerId ?? "");
  const [query, setQuery] = useState("");
  const selectedCustomer = db.customers.find((c) => c.id === cid);
  const results = cid ? [] : searchCustomers(db.customers, query);
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<CaseCategory>(defaultCategory);
  const [priority, setPriority] = useState<CasePriority>("Normal");
  const [assign, setAssign] = useState(true);
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = async () => {
    const e: Record<string, string> = {};
    if (!cid) e.cid = "Select a customer.";
    if (subject.trim().length < 4) e.subject = "Subject must be at least 4 characters.";
    if (message.trim().length < 10) e.message = "Description must be at least 10 characters.";
    setErr(e);
    if (Object.keys(e).length) return;
    let res: { id: string; ref: string } | undefined;
    const ok = await run(async () => {
      res = await operations.createSupportCase({
        customerId: cid,
        subject,
        message,
        category,
        priority,
        links: link ? [link] : [],
        assignToMe: assign,
      });
    }, "Support case created");
    if (ok && res) {
      setOpen(false);
      navigate({ to: "/support/$caseId", params: { caseId: res.id } });
    }
  };

  return (
    <>
      <span className="contents" onClick={() => setOpen(true)}>
        {trigger}
      </span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              Cases are internal records. No customer notification is sent from this demo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {!customerId && (
              <div className="space-y-1">
                <Label htmlFor="nc-c">Customer</Label>
                {selectedCustomer ? (
                  <div className="flex items-start gap-2.5 rounded-md border bg-card px-3 py-2.5">
                    <Avatar name={fullName(selectedCustomer)} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                        {fullName(selectedCustomer)}
                        <StatusBadge status={selectedCustomer.customerStatus} />
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {selectedCustomer.userId} · {selectedCustomer.email}
                      </p>
                      <p className="truncate text-[12px] text-muted-foreground">
                        {selectedCustomer.city}, {selectedCustomer.province} · DOB{" "}
                        {fmtDate(selectedCustomer.dateOfBirth)} · {selectedCustomer.phone}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCid("");
                        setQuery("");
                      }}
                    >
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      id="nc-c"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search by name, email, phone, member ID or city…"
                      autoComplete="off"
                    />
                    {query.trim() && results.length === 0 && (
                      <p className="text-[13px] text-muted-foreground">
                        No customers match that search.
                      </p>
                    )}
                    {results.length > 0 && (
                      <div className="max-h-56 overflow-y-auto rounded-md border">
                        {results.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => setCid(c.id)}
                            className="flex w-full items-start gap-2.5 border-b px-3 py-2 text-left last:border-b-0 hover:bg-secondary"
                          >
                            <Avatar name={fullName(c)} size="sm" />
                            <span className="min-w-0">
                              <span className="flex flex-wrap items-center gap-2 text-[14px] font-medium">
                                {fullName(c)}
                                <StatusBadge status={c.customerStatus} />
                              </span>
                              <span className="block truncate text-[12px] text-muted-foreground">
                                {c.userId} · {c.email}
                              </span>
                              <span className="block truncate text-[12px] text-muted-foreground">
                                {c.city}, {c.province} · DOB {fmtDate(c.dateOfBirth)} · {c.phone}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                    <p className="text-[12px] text-muted-foreground">
                      Matches show member ID, email, city, date of birth and phone so you can tell
                      customers with the same name apart before opening the case.
                    </p>
                  </>
                )}
                {err.cid && <p className="text-[13px] text-danger">{err.cid}</p>}
              </div>
            )}
            <div className="space-y-1">
              <Label htmlFor="nc-s">Subject</Label>
              <Input id="nc-s" value={subject} onChange={(e) => setSubject(e.target.value)} />
              {err.subject && <p className="text-[13px] text-danger">{err.subject}</p>}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="nc-cat">Category</Label>
                <SelectField
                  id="nc-cat"
                  className="h-9 w-full rounded-md border bg-card px-2"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as CaseCategory)}
                >
                  {CATS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </SelectField>
              </div>
              <div className="space-y-1">
                <Label htmlFor="nc-p">Priority</Label>
                <SelectField
                  id="nc-p"
                  className="h-9 w-full rounded-md border bg-card px-2"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as CasePriority)}
                >
                  {["Low", "Normal", "High", "Urgent"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </SelectField>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-m">Description</Label>
              <Textarea
                id="nc-m"
                rows={4}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              {err.message && <p className="text-[13px] text-danger">{err.message}</p>}
            </div>
            {link && (
              <p className="text-[13px] text-muted-foreground">
                Linked record: {link.type} {link.id}
              </p>
            )}
            <label className="flex items-center gap-2 text-[14px]">
              <Checkbox checked={assign} onCheckedChange={(v) => setAssign(!!v)} /> Assign to me
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit}>Create case</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
