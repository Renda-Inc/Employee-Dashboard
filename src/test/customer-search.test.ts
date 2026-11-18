import { describe, expect, it } from "vitest";
import { searchCustomers } from "../lib/customerSearch";
import type { Customer } from "../types/models";

const base = {
  signupEmail: "",
  city: "Toronto",
  province: "ON",
  phone: "+1 (416) 555-0100",
} as unknown as Customer;

const people: Customer[] = [
  {
    ...base,
    id: "a",
    firstName: "James",
    lastName: "Smith",
    email: "james.smith@gmail.com",
    userId: "RND-1001",
  },
  {
    ...base,
    id: "b",
    firstName: "James",
    lastName: "Smith",
    email: "jsmith@outlook.com",
    userId: "RND-2042",
    city: "Vancouver",
    phone: "+1 (604) 555-0177",
  },
  {
    ...base,
    id: "c",
    firstName: "Olivia",
    lastName: "Thompson",
    email: "olivia.t@outlook.com",
    userId: "RND-3077",
  },
];

describe("searchCustomers", () => {
  it("returns both customers who share a name", () => {
    const hits = searchCustomers(people, "james smith");
    expect(hits.map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("narrows same-name matches by city, email, member ID and phone digits", () => {
    expect(searchCustomers(people, "james smith vancouver").map((c) => c.id)).toEqual(["b"]);
    expect(searchCustomers(people, "jsmith@outlook").map((c) => c.id)).toEqual(["b"]);
    expect(searchCustomers(people, "RND-2042").map((c) => c.id)).toEqual(["b"]);
    expect(searchCustomers(people, "6045550177").map((c) => c.id)).toEqual(["b"]);
  });

  it("returns nothing for an empty query and caps the result count", () => {
    expect(searchCustomers(people, "")).toEqual([]);
    expect(searchCustomers(people, "smith", 1)).toHaveLength(1);
  });
});
