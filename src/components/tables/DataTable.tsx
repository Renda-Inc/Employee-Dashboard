import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/common";
import { Checkbox } from "@/components/ui/checkbox";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sort?: (row: T) => string | number;
  className?: string;
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  selectable?: boolean;
  selected?: string[];
  onSelectedChange?: (ids: string[]) => void;
  isSelectable?: (row: T) => boolean;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  toolbar?: ReactNode;
}

export function DataTable<T>({ rows, columns, rowKey, onRowClick, pageSize: initial = 15, emptyTitle = "No records found", emptyDescription = "Try adjusting your search or filters.", selectable, selected = [], onSelectedChange, isSelectable, defaultSort, toolbar }: Props<T>) {
  const [sort, setSort] = useState(defaultSort ?? null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initial);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const f = col.sort;
    return [...rows].sort((a, b) => {
      const x = f(a), y = f(b);
      const r = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === "asc" ? r : -r;
    });
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  useEffect(() => {
    if (page > pages - 1) setPage(0);
  }, [pages, page]);
  const view = sorted.slice(page * pageSize, page * pageSize + pageSize);
  const selectableIds = view.filter((r) => !isSelectable || isSelectable(r)).map(rowKey);
  const allSel = selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));

  return (
    <div className="panel overflow-hidden">
      {toolbar && <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5">{toolbar}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b bg-secondary/60 text-left">
              {selectable && (
                <th className="w-9 px-3 py-2">
                  <Checkbox aria-label="Select page" checked={allSel} onCheckedChange={(v) => onSelectedChange?.(v ? Array.from(new Set([...selected, ...selectableIds])) : selected.filter((s) => !selectableIds.includes(s)))} />
                </th>
              )}
              {columns.map((c) => (
                <th key={c.key} className={cn("whitespace-nowrap px-3 py-2 text-[11.5px] font-medium text-muted-foreground", c.className)}>
                  {c.sort ? (
                    <button
                      className="inline-flex items-center gap-1 hover:text-foreground"
                      onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === "asc" ? "desc" : "asc" } : { key: c.key, dir: "asc" }))}
                    >
                      {c.header}
                      {sort?.key === c.key ? (sort.dir === "asc" ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />) : <ChevronsUpDown className="size-3 opacity-40" />}
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => {
              const id = rowKey(r);
              const canSel = !isSelectable || isSelectable(r);
              return (
                <tr
                  key={id}
                  onClick={onRowClick ? () => onRowClick(r) : undefined}
                  onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(r) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  className={cn("border-b last:border-0", onRowClick && "cursor-pointer hover:bg-secondary/60 focus:bg-secondary/60 focus:outline-none")}
                >
                  {selectable && (
                    <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                      <Checkbox aria-label="Select row" disabled={!canSel} checked={selected.includes(id)} onCheckedChange={(v) => onSelectedChange?.(v ? [...selected, id] : selected.filter((s) => s !== id))} />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={cn("whitespace-nowrap px-3 py-2", c.className)}>{c.cell(r)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {!view.length && <EmptyState title={emptyTitle} description={emptyDescription} />}
      </div>
      {sorted.length > 0 && (
        <div className="flex items-center justify-between gap-2 border-t px-3 py-2 text-[12px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Rows</span>
            <select aria-label="Rows per page" className="rounded border bg-card px-1.5 py-0.5" value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}>
              {[10, 15, 25, 50].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="tabular">{page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} of {sorted.length}</span>
            <button aria-label="Previous page" className="rounded p-1 hover:bg-secondary disabled:opacity-40" disabled={page === 0} onClick={() => setPage(page - 1)}><ChevronLeft className="size-4" /></button>
            <button aria-label="Next page" className="rounded p-1 hover:bg-secondary disabled:opacity-40" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}><ChevronRight className="size-4" /></button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: readonly string[] }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn("h-8 rounded-md border bg-card px-2 text-[12.5px]", value !== "all" && "border-primary/60 text-foreground")}>
      <option value="all">{label}: All</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

export function SearchInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="h-8 w-full min-w-[220px] max-w-xs rounded-md border bg-card px-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus:border-primary focus:ring-1 focus:ring-primary"
    />
  );
}

export function TabBar<T extends string>({ tabs, value, onChange, counts }: { tabs: readonly T[]; value: T; onChange: (t: T) => void; counts?: Partial<Record<T, number>> }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b">
      {tabs.map((t) => (
        <button
          key={t}
          role="tab"
          aria-selected={value === t}
          onClick={() => onChange(t)}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium transition-colors", value === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")}
        >
          {t}
          {counts?.[t] !== undefined && <span className="ml-1.5 rounded bg-secondary px-1.5 py-px text-[11px] tabular text-muted-foreground">{counts[t]}</span>}
        </button>
      ))}
    </div>
  );
}
