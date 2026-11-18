import type { Customer } from "@/types/models";
import { fullName } from "@/lib/format";

const digitsOnly = (s: string) => s.replace(/\D/g, "");

/** Searchable text for one customer: everything an employee might type or
 * check to tell two people with the same name apart. */
function haystack(c: Customer): string {
  return [
    fullName(c),
    c.email,
    c.signupEmail,
    c.userId,
    c.city,
    c.province,
    digitsOnly(c.phone),
    c.phone,
  ]
    .join(" ")
    .toLowerCase();
}

/** Token search over the customer base: every word in the query must match
 * somewhere (name, email, member ID, city, or phone digits). Returns at
 * most `limit` matches so a picker never renders the whole base. */
export function searchCustomers(customers: Customer[], query: string, limit = 8): Customer[] {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  const out: Customer[] = [];
  for (const c of customers) {
    const hay = haystack(c);
    if (tokens.every((t) => hay.includes(t))) {
      out.push(c);
      if (out.length >= limit) break;
    }
  }
  return out;
}
