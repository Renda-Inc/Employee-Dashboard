import { useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useDB } from "@/services/store";
import { createSupportCase } from "@/services/actions";
import { run } from "@/components/common";
import { fullName } from "@/lib/format";
import type { CaseCategory, CaseLink, CasePriority } from "@/types/models";

const CATS: CaseCategory[] = ["Account Access", "Verification", "Banking Account", "Transaction", "Transfer", "Card", "Membership", "Savings", "Alfie", "General Inquiry"];

export function NewCaseDialog({ trigger, customerId, link, defaultCategory = "General Inquiry", defaultSubject = "", title = "Open support case" }: { trigger: ReactNode; customerId?: string; link?: CaseLink; defaultCategory?: CaseCategory; defaultSubject?: string; title?: string }) {
  const db = useDB();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [cid, setCid] = useState(customerId ?? "");
  const [subject, setSubject] = useState(defaultSubject);
  const [message, setMessage] = useState("");
  const [category, setCategory] = useState<CaseCategory>(defaultCategory);
  const [priority, setPriority] = useState<CasePriority>("Normal");
  const [assign, setAssign] = useState(true);
  const [err, setErr] = useState<Record<string, string>>({});

  const submit = () => {
    const e: Record<string, string> = {};
    if (!cid) e.cid = "Select a customer.";
    if (subject.trim().length < 4) e.subject = "Subject must be at least 4 characters.";
    if (message.trim().length < 10) e.message = "Description must be at least 10 characters.";
    setErr(e);
    if (Object.keys(e).length) return;
    let res: { id: string; ref: string } | undefined;
    const ok = run(() => { res = createSupportCase({ customerId: cid, subject, message, category, priority, links: link ? [link] : [], assignToMe: assign }); }, "Support case created");
    if (ok && res) {
      setOpen(false);
      navigate({ to: "/support/$caseId", params: { caseId: res.id } });
    }
  };

  return (
    <>
      <span className="contents" onClick={() => setOpen(true)}>{trigger}</span>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Cases are internal records. No customer notification is sent from this demo.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            {!customerId && (
              <div className="space-y-1">
                <Label htmlFor="nc-c">Customer</Label>
                <select id="nc-c" className="h-9 w-full rounded-md border bg-card px-2" value={cid} onChange={(e) => setCid(e.target.value)}>
                  <option value="">Select customer…</option>
                  {db.customers.map((c) => <option key={c.id} value={c.id}>{fullName(c)} · {c.userId}</option>)}
                </select>
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
                <select id="nc-cat" className="h-9 w-full rounded-md border bg-card px-2" value={category} onChange={(e) => setCategory(e.target.value as CaseCategory)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="nc-p">Priority</Label>
                <select id="nc-p" className="h-9 w-full rounded-md border bg-card px-2" value={priority} onChange={(e) => setPriority(e.target.value as CasePriority)}>{["Low", "Normal", "High", "Urgent"].map((c) => <option key={c}>{c}</option>)}</select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="nc-m">Description</Label>
              <Textarea id="nc-m" rows={4} value={message} onChange={(e) => setMessage(e.target.value)} />
              {err.message && <p className="text-[13px] text-danger">{err.message}</p>}
            </div>
            {link && <p className="text-[13px] text-muted-foreground">Linked record: {link.type} {link.id}</p>}
            <label className="flex items-center gap-2 text-[14px]"><Checkbox checked={assign} onCheckedChange={(v) => setAssign(!!v)} /> Assign to me</label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Create case</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
