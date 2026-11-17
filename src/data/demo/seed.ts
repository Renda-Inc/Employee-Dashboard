// Deterministic demo dataset. Same output on every run, no Math.random.
import type {
  Account,
  ActivityEvent,
  AlfieEvent,
  AuditEvent,
  Card,
  CardDesign,
  CardOrder,
  Customer,
  CustomerStatus,
  DB,
  Employee,
  KycCase,
  ManufacturingBatch,
  SavingsGoal,
  Subscription,
  SupportCase,
  Transaction,
  Transfer,
  TxnStatus,
} from "@/types/models";
import { PLAN_PRICES } from "@/services/rules";

export const DEMO_NOW = new Date("2026-10-28T16:00:00Z").getTime();
const H = 3600_000;
const D = 24 * H;
const iso = (ms: number) => new Date(ms).toISOString();
const ago = (days: number, hours = 0) => iso(DEMO_NOW - days * D - hours * H);

function prng(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = prng(20261028);
const pick = <T>(arr: readonly T[]) => arr[Math.floor(rnd() * arr.length)];
const money = (min: number, max: number) => Math.round((min + rnd() * (max - min)) * 100) / 100;
const digits = (n: number) => Array.from({ length: n }, () => Math.floor(rnd() * 10)).join("");

type Spec = {
  first: string;
  last: string;
  city: string;
  province: string;
  stage: CustomerStatus;
  plan?: "Everyday" | "Plus";
  regDays: number;
  occupation: string;
  industry: string;
  income: number;
  phoneVerified?: boolean;
};

const SPECS: Spec[] = [
  {
    first: "Amara",
    last: "Okafor",
    city: "Toronto",
    province: "ON",
    stage: "Registered",
    regDays: 0,
    occupation: "Graphic Designer",
    industry: "Media",
    income: 64000,
  },
  {
    first: "Liam",
    last: "Tremblay",
    city: "Montréal",
    province: "QC",
    stage: "Email Verification Pending",
    regDays: 1,
    occupation: "Barista",
    industry: "Hospitality",
    income: 34000,
  },
  {
    first: "Priya",
    last: "Raman",
    city: "Mississauga",
    province: "ON",
    stage: "Email Verification Pending",
    regDays: 3,
    occupation: "Pharmacist",
    industry: "Healthcare",
    income: 112000,
  },
  {
    first: "Noah",
    last: "Bergstrom",
    city: "Calgary",
    province: "AB",
    stage: "Email Verified",
    regDays: 2,
    occupation: "Electrician",
    industry: "Construction",
    income: 88000,
  },
  {
    first: "Sofia",
    last: "Marchetti",
    city: "Vancouver",
    province: "BC",
    stage: "Onboarding In Progress",
    regDays: 4,
    occupation: "UX Researcher",
    industry: "Technology",
    income: 97000,
    phoneVerified: false,
  },
  {
    first: "Ethan",
    last: "Nakamura",
    city: "Ottawa",
    province: "ON",
    stage: "Onboarding In Progress",
    regDays: 6,
    occupation: "Policy Analyst",
    industry: "Government",
    income: 82000,
  },
  {
    first: "Chloé",
    last: "Gagnon",
    city: "Québec City",
    province: "QC",
    stage: "KYC Pending",
    regDays: 3,
    occupation: "Nurse",
    industry: "Healthcare",
    income: 79000,
  },
  {
    first: "Malik",
    last: "Haddad",
    city: "Edmonton",
    province: "AB",
    stage: "KYC Pending",
    regDays: 5,
    occupation: "Software Engineer",
    industry: "Technology",
    income: 128000,
  },
  {
    first: "Grace",
    last: "Whitfield",
    city: "Halifax",
    province: "NS",
    stage: "KYC Pending",
    regDays: 2,
    occupation: "Teacher",
    industry: "Education",
    income: 71000,
  },
  {
    first: "Daniel",
    last: "Osei",
    city: "Winnipeg",
    province: "MB",
    stage: "KYC Under Review",
    regDays: 8,
    occupation: "Accountant",
    industry: "Finance",
    income: 93000,
  },
  {
    first: "Hana",
    last: "Kowalczyk",
    city: "Toronto",
    province: "ON",
    stage: "KYC Under Review",
    regDays: 7,
    occupation: "Architect",
    industry: "Construction",
    income: 105000,
  },
  {
    first: "Lucas",
    last: "Fernandes",
    city: "Brampton",
    province: "ON",
    stage: "KYC Failed",
    regDays: 10,
    occupation: "Driver",
    industry: "Logistics",
    income: 52000,
  },
  {
    first: "Isabelle",
    last: "Roy",
    city: "Laval",
    province: "QC",
    stage: "KYC Failed",
    regDays: 12,
    occupation: "Student",
    industry: "Education",
    income: 18000,
  },
  {
    first: "Omar",
    last: "Siddiqui",
    city: "Surrey",
    province: "BC",
    stage: "KYC Approved",
    regDays: 5,
    occupation: "Dentist",
    industry: "Healthcare",
    income: 165000,
  },
  {
    first: "Emily",
    last: "Chen",
    city: "Richmond",
    province: "BC",
    stage: "Account Issuance Pending",
    regDays: 6,
    occupation: "Product Manager",
    industry: "Technology",
    income: 134000,
  },
  {
    first: "Kwame",
    last: "Mensah",
    city: "Hamilton",
    province: "ON",
    stage: "Account Issuance Pending",
    regDays: 9,
    occupation: "Chef",
    industry: "Hospitality",
    income: 58000,
  },
  {
    first: "Zoe",
    last: "MacLeod",
    city: "Charlottetown",
    province: "PE",
    stage: "Account Issuance Failed",
    regDays: 11,
    occupation: "Marine Biologist",
    industry: "Research",
    income: 76000,
  },
  {
    first: "Arjun",
    last: "Mehta",
    city: "Waterloo",
    province: "ON",
    stage: "Setup In Progress",
    regDays: 13,
    occupation: "Data Scientist",
    industry: "Technology",
    income: 121000,
  },
  {
    first: "Léa",
    last: "Bouchard",
    city: "Sherbrooke",
    province: "QC",
    stage: "Setup In Progress",
    regDays: 14,
    occupation: "Physiotherapist",
    industry: "Healthcare",
    income: 84000,
  },
  // Active Everyday
  {
    first: "Marcus",
    last: "Bennett",
    city: "Toronto",
    province: "ON",
    stage: "Active",
    plan: "Everyday",
    regDays: 62,
    occupation: "Sales Associate",
    industry: "Retail",
    income: 46000,
  },
  {
    first: "Aisha",
    last: "Abdullah",
    city: "Calgary",
    province: "AB",
    stage: "Active",
    plan: "Everyday",
    regDays: 55,
    occupation: "Lab Technician",
    industry: "Healthcare",
    income: 61000,
  },
  {
    first: "Ryan",
    last: "O'Connell",
    city: "St. John's",
    province: "NL",
    stage: "Active",
    plan: "Everyday",
    regDays: 48,
    occupation: "Fisheries Officer",
    industry: "Government",
    income: 69000,
  },
  {
    first: "Mei",
    last: "Lin",
    city: "Markham",
    province: "ON",
    stage: "Active",
    plan: "Everyday",
    regDays: 40,
    occupation: "Financial Analyst",
    industry: "Finance",
    income: 89000,
  },
  {
    first: "Gabriel",
    last: "Santos",
    city: "Montréal",
    province: "QC",
    stage: "Active",
    plan: "Everyday",
    regDays: 33,
    occupation: "Musician",
    industry: "Arts",
    income: 39000,
  },
  {
    first: "Nadia",
    last: "Petrova",
    city: "Vancouver",
    province: "BC",
    stage: "Active",
    plan: "Everyday",
    regDays: 27,
    occupation: "Copywriter",
    industry: "Marketing",
    income: 67000,
  },
  // Active Plus
  {
    first: "Olivia",
    last: "Thompson",
    city: "Toronto",
    province: "ON",
    stage: "Active",
    plan: "Plus",
    regDays: 85,
    occupation: "Lawyer",
    industry: "Legal",
    income: 158000,
  },
  {
    first: "Jamal",
    last: "Wright",
    city: "Ottawa",
    province: "ON",
    stage: "Active",
    plan: "Plus",
    regDays: 80,
    occupation: "Civil Engineer",
    industry: "Engineering",
    income: 102000,
  },
  {
    first: "Sakura",
    last: "Ito",
    city: "Vancouver",
    province: "BC",
    stage: "Active",
    plan: "Plus",
    regDays: 50,
    occupation: "Photographer",
    industry: "Media",
    income: 73000,
  },
  {
    first: "Benjamin",
    last: "Lefebvre",
    city: "Gatineau",
    province: "QC",
    stage: "Active",
    plan: "Plus",
    regDays: 44,
    occupation: "Consultant",
    industry: "Professional Services",
    income: 141000,
  },
  {
    first: "Fatima",
    last: "Zahra",
    city: "Mississauga",
    province: "ON",
    stage: "Active",
    plan: "Plus",
    regDays: 36,
    occupation: "Physician",
    industry: "Healthcare",
    income: 210000,
  },
  {
    first: "Owen",
    last: "Campbell",
    city: "Saskatoon",
    province: "SK",
    stage: "Active",
    plan: "Plus",
    regDays: 25,
    occupation: "Agronomist",
    industry: "Agriculture",
    income: 87000,
  },
  {
    first: "Valentina",
    last: "Rossi",
    city: "Kelowna",
    province: "BC",
    stage: "Active",
    plan: "Plus",
    regDays: 21,
    occupation: "Winemaker",
    industry: "Hospitality",
    income: 95000,
  },
  // Restricted / Closed
  {
    first: "Tyler",
    last: "Brooks",
    city: "Regina",
    province: "SK",
    stage: "Restricted",
    plan: "Everyday",
    regDays: 70,
    occupation: "Contractor",
    industry: "Construction",
    income: 72000,
  },
  {
    first: "Hélène",
    last: "Dubois",
    city: "Moncton",
    province: "NB",
    stage: "Closed",
    plan: "Everyday",
    regDays: 120,
    occupation: "Retired",
    industry: "None",
    income: 41000,
  },
];

const STREETS = [
  "King St W",
  "Queen St E",
  "Rue Sainte-Catherine",
  "Granville St",
  "Jasper Ave",
  "Portage Ave",
  "Barrington St",
  "Bank St",
  "Main St",
  "Elgin St",
];
const MARITAL = ["Single", "Married", "Common-law", "Single", "Divorced"];
const EMPLOYMENT = ["Full-time", "Full-time", "Part-time", "Self-employed", "Full-time"];

const STAGE_ORDER: CustomerStatus[] = [
  "Registered",
  "Email Verification Pending",
  "Email Verified",
  "Onboarding In Progress",
  "KYC Pending",
  "KYC Under Review",
  "KYC Failed",
  "KYC Approved",
  "Account Issuance Pending",
  "Account Issuance Failed",
  "Setup In Progress",
  "Active",
  "Restricted",
  "Closed",
];
const rank = (s: CustomerStatus) => STAGE_ORDER.indexOf(s);

export const EMPLOYEES: Employee[] = [
  {
    id: "emp_01",
    name: "Jordan Ellis",
    email: "jordan.ellis@renda.ca",
    role: "Administrator",
    status: "Active",
  },
  {
    id: "emp_02",
    name: "Maya Desrosiers",
    email: "maya.desrosiers@renda.ca",
    role: "Customer Support",
    status: "Active",
  },
  {
    id: "emp_03",
    name: "Kevin Adeyemi",
    email: "kevin.adeyemi@renda.ca",
    role: "Customer Support",
    status: "Active",
  },
  {
    id: "emp_04",
    name: "Rachel Kim",
    email: "rachel.kim@renda.ca",
    role: "Compliance",
    status: "Active",
  },
  {
    id: "emp_05",
    name: "Samuel Ortiz",
    email: "samuel.ortiz@renda.ca",
    role: "Banking Operations",
    status: "Active",
  },
  {
    id: "emp_06",
    name: "Ines Laurent",
    email: "ines.laurent@renda.ca",
    role: "Card Operations",
    status: "Active",
  },
  {
    id: "emp_07",
    name: "Theo Park",
    email: "theo.park@renda.ca",
    role: "Read-Only Analyst",
    status: "Active",
  },
  {
    id: "emp_08",
    name: "Dana Morrison",
    email: "dana.morrison@renda.ca",
    role: "Customer Support",
    status: "Suspended",
  },
];

export function buildSeed(): DB {
  const customers: Customer[] = [];
  const accounts: Account[] = [];
  const transactions: Transaction[] = [];
  const transfers: Transfer[] = [];
  const cards: Card[] = [];
  const cardOrders: CardOrder[] = [];
  const subscriptions: Subscription[] = [];
  const goals: SavingsGoal[] = [];
  const kycCases: KycCase[] = [];
  const activity: ActivityEvent[] = [];
  let actN = 0;
  const act = (
    customerId: string,
    type: ActivityEvent["type"],
    description: string,
    timestamp: string,
    link?: ActivityEvent["link"],
  ) => activity.push({ id: `act_${++actN}`, customerId, type, description, timestamp, link });

  SPECS.forEach((s, i) => {
    const n = i + 1;
    const id = `cus_${String(n).padStart(3, "0")}`;
    const userId = `RND-${(482100 + n * 37).toString()}`;
    const r = rank(s.stage);
    const regMs = DEMO_NOW - s.regDays * D - (n % 9) * H;
    const emailVerified = r >= rank("Email Verified");
    const phoneVerified = r >= rank("Onboarding In Progress") && s.phoneVerified !== false;
    const kycStatus: Customer["kycStatus"] =
      s.stage === "KYC Pending"
        ? "Pending"
        : s.stage === "KYC Under Review"
          ? "Under Review"
          : s.stage === "KYC Failed"
            ? "Failed"
            : r >= rank("KYC Approved")
              ? "Approved"
              : "Not Started";
    const onboardingStatus: Customer["onboardingStatus"] =
      r < rank("Onboarding In Progress")
        ? "Not Started"
        : s.stage === "Onboarding In Progress"
          ? "In Progress"
          : s.stage === "KYC Failed"
            ? "Blocked"
            : "Completed";
    const accountIssuanceStatus: Customer["accountIssuanceStatus"] =
      s.stage === "Account Issuance Pending"
        ? "Pending"
        : s.stage === "Account Issuance Failed"
          ? "Failed"
          : r >= rank("Setup In Progress")
            ? "Issued"
            : "Not Started";
    const slug = `${s.first}.${s.last}`
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f']/g, "");
    const signupEmail = `${slug}@${pick(["gmail.com", "outlook.com", "icloud.com", "proton.me"])}`;
    const c: Customer = {
      id,
      userId,
      firstName: s.first,
      lastName: s.last,
      email: signupEmail,
      signupEmail,
      emailVerified,
      phone: `+1 (${pick(["416", "647", "514", "604", "403", "613", "780", "902"])}) 555-${digits(4)}`,
      phoneVerified,
      address: `${100 + Math.floor(rnd() * 2800)} ${pick(STREETS)}${rnd() > 0.6 ? `, Unit ${Math.floor(rnd() * 1800) + 100}` : ""}`,
      city: s.city,
      province: s.province,
      postalCode: `${pick(["M5V", "H2X", "V6B", "T2P", "K1P", "R3C", "B3J", "L5B"])} ${digits(1)}${pick(["A", "K", "R", "T"])}${digits(1)}`,
      dateOfBirth: `${1958 + Math.floor(rnd() * 46)}-${String(1 + Math.floor(rnd() * 12)).padStart(2, "0")}-${String(1 + Math.floor(rnd() * 27)).padStart(2, "0")}`,
      maritalStatus: pick(MARITAL),
      employmentType:
        s.occupation === "Retired"
          ? "Retired"
          : s.occupation === "Student"
            ? "Student"
            : pick(EMPLOYMENT),
      occupation: s.occupation,
      industry: s.industry,
      annualIncome: s.income,
      registrationDate: iso(regMs),
      onboardingStatus,
      kycStatus,
      accountIssuanceStatus,
      customerStatus: s.stage,
      restriction:
        s.stage === "Restricted"
          ? n % 2 === 0
            ? {
                kind: "Operational Freeze" as const,
                reason: "Suspected fraud",
                note: "Freeze placed after unusual sign-in and transfer activity; review in progress.",
                setBy: "emp_01",
                setAt: ago(4),
              }
            : {
                kind: "Compliance Hold" as const,
                reason: "AML review",
                note: "Enhanced due diligence in progress; source-of-funds documents requested.",
                setBy: "emp_01",
                setAt: ago(6),
              }
          : null,
      closure:
        s.stage === "Closed"
          ? {
              reason: "Customer request",
              note: "Closed at the customer's request in the demo dataset.",
              closedBy: "emp_01",
              closedAt: ago(n % 2 === 0 ? 30 : 120),
              payoutEmail: signupEmail,
              payoutAmount: 0,
            }
          : null,
      createdAt: iso(regMs),
      updatedAt: iso(Math.min(DEMO_NOW, regMs + Math.max(1, s.regDays * 0.6) * D)),
    };
    customers.push(c);

    // Activity timeline
    act(id, "Registration", "Customer registered for Renda", iso(regMs));
    if (emailVerified) act(id, "Verification", "Email address verified", iso(regMs + 0.2 * H));
    if (phoneVerified) act(id, "Verification", "Phone number verified", iso(regMs + 0.5 * H));
    if (r >= rank("Onboarding In Progress"))
      act(id, "Profile", "Onboarding questionnaire started", iso(regMs + 1 * H));

    // KYC case
    if (r >= rank("KYC Pending")) {
      const initiated = regMs + 4 * H;
      const status = kycStatus;
      const completedAt =
        status === "Approved" || status === "Failed" ? iso(initiated + 6 * H) : null;
      kycCases.push({
        id: `kyc_${String(n).padStart(3, "0")}`,
        customerId: id,
        provider: "Identity verification provider (demo)",
        providerReference: `IDV-${digits(4)}-${digits(4)}`,
        status,
        initiatedAt: iso(initiated),
        completedAt,
        lastUpdated: completedAt ?? iso(initiated + 2 * H),
        outstandingRequirements:
          status === "Pending"
            ? ["Awaiting identity verification result from provider"]
            : status === "Under Review"
              ? ["Manual compliance review of document mismatch"]
              : status === "Failed"
                ? ["Customer must resubmit a valid government-issued ID"]
                : [],
        providerMessages:
          status === "Pending"
            ? ["Document and selfie received. Processing."]
            : status === "Under Review"
              ? [
                  "Name on ID partially matches application (score 0.71). Flagged for manual review.",
                ]
              : status === "Failed"
                ? [n % 2 === 0 ? "Document expired." : "Selfie liveness check failed."]
                : ["Identity verified. Document authentic. Liveness passed."],
        decisionReason: null,
      });
      act(id, "KYC", "Identity verification submitted", iso(initiated));
      if (status === "Approved") act(id, "KYC", "KYC verification passed", completedAt!);
      if (status === "Failed") act(id, "KYC", "KYC verification failed", completedAt!);
      if (status === "Under Review")
        act(id, "KYC", "KYC case escalated to manual review", iso(initiated + 3 * H));
    }

    // Accounts
    if (r >= rank("Account Issuance Pending")) {
      const issued = accountIssuanceStatus === "Issued";
      const accStatus: Account["accountStatus"] =
        s.stage === "Restricted"
          ? "Restricted"
          : s.stage === "Closed"
            ? "Closed"
            : issued
              ? "Active"
              : accountIssuanceStatus === "Failed"
                ? "Issuance Failed"
                : "Pending Issuance";
      const openMs = regMs + 1 * D;
      const active = s.stage === "Active";
      for (const type of ["Smart Spend", "Sense Save"] as const) {
        const bal =
          issued && s.stage !== "Closed"
            ? type === "Smart Spend"
              ? money(120, 4200)
              : money(300, 18500)
            : null;
        accounts.push({
          id: `acc_${String(n).padStart(3, "0")}_${type === "Smart Spend" ? "ss" : "sv"}`,
          customerId: id,
          accountType: type,
          accountStatus: accStatus,
          maskedAccountIdentifier: issued ? `•••• ${digits(4)}` : null,
          openingDate: issued ? iso(openMs) : null,
          availableBalance: bal,
          ledgerBalance:
            bal == null
              ? null
              : Math.round((bal + (active && type === "Smart Spend" ? money(0, 60) : 0)) * 100) /
                100,
          restrictions:
            s.stage === "Restricted"
              ? ["Outgoing transfers suspended pending review", "Card transactions declined"]
              : s.stage === "Closed"
                ? ["Account closed at customer request"]
                : [],
          lastActivity: issued ? iso(DEMO_NOW - (n % 5) * D - 3 * H) : null,
        });
      }
      if (issued) act(id, "Accounts", "Smart Spend and Sense Save accounts issued", iso(openMs));
      if (accountIssuanceStatus === "Failed")
        act(
          id,
          "Accounts",
          "Account issuance failed: banking provider returned an error",
          iso(regMs + 1 * D),
        );
    }

    // Subscription
    if (s.plan && (s.stage === "Active" || s.stage === "Restricted" || s.stage === "Closed")) {
      const start = regMs + 1.5 * D;
      subscriptions.push({
        id: `sub_${String(n).padStart(3, "0")}`,
        customerId: id,
        plan: s.plan,
        monthlyPrice: PLAN_PRICES[s.plan],
        currency: "CAD",
        subscriptionStatus: s.stage === "Closed" ? "Canceled" : "Active",
        startDate: iso(start),
        nextBillingDate:
          s.plan === "Plus" && s.stage !== "Closed"
            ? iso(DEMO_NOW + (((n * 3) % 28) + 1) * D)
            : null,
        latestBillingStatus: s.plan === "Plus" ? "Paid" : "Not Applicable",
        billingOutstandingSince: null,
        billingRetryCount: 0,
        lastBillingAttemptAt: null,
        cardSelectionRequired: false,
        history: [
          {
            at: iso(start),
            from: null,
            to: s.plan,
            by: "customer",
            note: "Plan selected during setup",
          },
        ],
      });
      act(id, "Membership", `Joined Renda ${s.plan}`, iso(start));
    }
    if (s.stage === "Setup In Progress") {
      const start = regMs + 1.5 * D;
      subscriptions.push({
        id: `sub_${String(n).padStart(3, "0")}`,
        customerId: id,
        plan: "Everyday",
        monthlyPrice: 0,
        currency: "CAD",
        subscriptionStatus: "Pending",
        startDate: iso(start),
        nextBillingDate: null,
        latestBillingStatus: "Not Applicable",
        billingOutstandingSince: null,
        billingRetryCount: 0,
        lastBillingAttemptAt: null,
        cardSelectionRequired: false,
        history: [
          {
            at: iso(start),
            from: null,
            to: "Everyday",
            by: "customer",
            note: "Plan selected during setup",
          },
        ],
      });
    }

    // Virtual cards for Everyday active/restricted/closed
    if (
      s.plan === "Everyday" &&
      (s.stage === "Active" || s.stage === "Restricted" || s.stage === "Closed")
    ) {
      cards.push({
        id: `crd_${String(n).padStart(3, "0")}_v`,
        customerId: id,
        accountId: `acc_${String(n).padStart(3, "0")}_ss`,
        cardType: "Virtual",
        cardDesign: "Virtual",
        cardStatus:
          s.stage === "Restricted" ? "Locked" : s.stage === "Closed" ? "Canceled" : "Active",
        last4: digits(4),
        issueDate: iso(regMs + 1.6 * D),
        activatedAt: null,
        manufacturingBatchId: null,
        replacementReference: null,
        replacesCardId: null,
        replacedByCardId: null,
        notes: [],
      });
      act(id, "Cards", "Virtual Renda Mastercard issued", iso(regMs + 1.6 * D));
    }
  });

  // Recently upgraded Everyday → Plus (Nadia Petrova, cus_025) with card selection pending
  const upgraded = subscriptions.find((x) => x.customerId === "cus_025")!;
  upgraded.plan = "Plus";
  upgraded.monthlyPrice = PLAN_PRICES.Plus;
  upgraded.latestBillingStatus = "Paid";
  upgraded.lastBillingAttemptAt = ago(1, 5);
  upgraded.nextBillingDate = iso(DEMO_NOW + 29 * D);
  upgraded.cardSelectionRequired = true;
  upgraded.history.push({
    at: ago(1, 5),
    from: "Everyday",
    to: "Plus",
    by: "customer",
    note: "Upgraded in app. Physical card design not yet selected.",
  });
  act("cus_025", "Membership", "Upgraded from Everyday to Renda Plus", ago(1, 5));

  // Plus member inside the retry window (Olivia Thompson): the renewal
  // charge failed 12 days ago, two attempts are on record, and the fee
  // stays outstanding until it is collected or the new billing date
  // arrives, when the plan would downgrade to Everyday.
  const olivia = customers.find((cu) => cu.firstName === "Olivia" && cu.lastName === "Thompson");
  // She changed her email in the app after sign-up (OTP-verified in-app):
  // the current email differs, the sign-up email stays on record, and the
  // account remains verified with no re-KYC.
  if (olivia) {
    olivia.email = "olivia.t@outlook.com";
    act(olivia.id, "Profile", "Email updated by customer in the app (OTP verified)", ago(20));
  }
  const retrying = subscriptions.find((x) => x.customerId === olivia?.id);
  if (retrying) {
    retrying.latestBillingStatus = "Failed";
    retrying.billingOutstandingSince = ago(12);
    retrying.nextBillingDate = iso(DEMO_NOW + 18 * D);
    retrying.billingRetryCount = 2;
    retrying.lastBillingAttemptAt = ago(2);
    act(
      olivia!.id,
      "Membership",
      "Plus renewal charge failed (attempt 2); fee outstanding, retries running",
      ago(2),
    );
  }

  // Physical cards, orders and batches
  const plusIds = ["cus_026", "cus_027", "cus_028", "cus_029", "cus_030", "cus_031", "cus_032"];
  const designs: CardDesign[] = [
    "Classic",
    "Pearl Ivory",
    "Blue Nova",
    "Aqua Aura",
    "Pearl Ivory",
    "Classic",
    "Aqua Aura",
  ];
  let ordN = 0;
  const mkCard = (
    cid: string,
    suffix: string,
    design: CardDesign,
    status: Card["cardStatus"],
    issue: string | null,
    batch: string | null,
  ): Card => ({
    id: `crd_${cid.slice(4)}_${suffix}`,
    customerId: cid,
    accountId: `acc_${cid.slice(4)}_ss`,
    cardType: "Physical",
    cardDesign: design,
    cardStatus: status,
    last4: digits(4),
    issueDate: issue,
    // An already-active physical card in the seed was activated on its
    // issue date; every other state has not been activated yet.
    activatedAt: status === "Active" ? issue : null,
    manufacturingBatchId: batch,
    replacementReference: null,
    replacesCardId: null,
    replacedByCardId: null,
    notes: [],
  });
  const mkOrder = (
    o: Partial<CardOrder> &
      Pick<
        CardOrder,
        "customerId" | "cardId" | "orderType" | "requestedDesign" | "orderStatus" | "requestDate"
      >,
  ): CardOrder => {
    ordN++;
    return {
      id: `ord_${String(ordN).padStart(3, "0")}`,
      orderReference: `CO-2026-${String(1040 + ordN)}`,
      previousCardId: null,
      previousDesign: null,
      manufacturingBatchId: null,
      replacementReason: null,
      replacementReference: null,
      activatedAt: null,
      notes: "",
      ...o,
    };
  };

  // B0 (historical, submitted Oct 9), initial cards for cus_026, cus_027 → both activated
  // B1 (submitted Oct 23), initial cus_028, replacement cus_026 (Pearl Ivory? no: Classic → Blue Nova)
  // B2 (ready), initial cus_029, replacement cus_027 (Pearl Ivory → Classic... design change)
  // B3 (draft), initial cus_030
  // Eligible, initial cus_031, cus_032, replacement cus_026? (kept simple)
  // c026 stays Active: a card is only retired when its replacement is activated.
  const c026 = mkCard("cus_026", "p1", designs[0], "Active", ago(14), "bat_000");
  const c027 = mkCard("cus_027", "p1", designs[1], "Active", ago(13), "bat_000");
  const c026r = mkCard("cus_026", "p2", "Blue Nova", "In Production", null, "bat_001");
  c026r.replacesCardId = c026.id;
  c026r.replacementReference = "RPL-2026-0311";
  c026.replacedByCardId = c026r.id;
  c026.notes.push({
    id: "n_c1",
    at: ago(8),
    by: "emp_02",
    text: "Customer reported card chip damaged. Replacement requested.",
  });
  const c027r = mkCard("cus_027", "p2", "Classic", "Awaiting Manufacturing", null, "bat_002");
  c027r.replacesCardId = c027.id;
  c027r.replacementReference = "RPL-2026-0318";
  c027.replacedByCardId = c027r.id; // old card stays active until the replacement is activated
  const c028 = mkCard("cus_028", "p1", designs[2], "In Production", null, "bat_001");
  const c029 = mkCard("cus_029", "p1", designs[3], "Awaiting Manufacturing", null, "bat_002");
  const c030 = mkCard("cus_030", "p1", designs[4], "Awaiting Manufacturing", null, "bat_003");
  const c031 = mkCard("cus_031", "p1", designs[5], "Awaiting Manufacturing", null, null);
  const c032 = mkCard("cus_032", "p1", designs[6], "Awaiting Manufacturing", null, null);
  cards.push(c026, c026r, c027, c027r, c028, c029, c030, c031, c032);
  // Restricted Plus? none. A canceled replacement for cus_028? keep one canceled order on cus_027 history
  const o1 = mkOrder({
    customerId: "cus_026",
    cardId: c026.id,
    orderType: "Initial Plus Card",
    requestedDesign: "Classic",
    orderStatus: "Activated",
    requestDate: ago(23),
    manufacturingBatchId: "bat_000",
    activatedAt: ago(14),
  });
  const o2 = mkOrder({
    customerId: "cus_027",
    cardId: c027.id,
    orderType: "Initial Plus Card",
    requestedDesign: "Pearl Ivory",
    orderStatus: "Activated",
    requestDate: ago(22),
    manufacturingBatchId: "bat_000",
    activatedAt: ago(13),
  });
  const o3 = mkOrder({
    customerId: "cus_028",
    cardId: c028.id,
    orderType: "Initial Plus Card",
    requestedDesign: "Blue Nova",
    orderStatus: "Submitted",
    requestDate: ago(9),
    manufacturingBatchId: "bat_001",
  });
  const o4 = mkOrder({
    customerId: "cus_026",
    cardId: c026r.id,
    previousCardId: c026.id,
    previousDesign: "Classic",
    orderType: "Replacement Card",
    requestedDesign: "Blue Nova",
    orderStatus: "Submitted",
    requestDate: ago(8),
    manufacturingBatchId: "bat_001",
    replacementReason: "Damaged card",
    replacementReference: "RPL-2026-0311",
  });
  const o5 = mkOrder({
    customerId: "cus_029",
    cardId: c029.id,
    orderType: "Initial Plus Card",
    requestedDesign: "Aqua Aura",
    orderStatus: "Batched",
    requestDate: ago(4),
    manufacturingBatchId: "bat_002",
  });
  const o6 = mkOrder({
    customerId: "cus_027",
    cardId: c027r.id,
    previousCardId: c027.id,
    previousDesign: "Pearl Ivory",
    orderType: "Replacement Card",
    requestedDesign: "Classic",
    orderStatus: "Batched",
    requestDate: ago(3),
    manufacturingBatchId: "bat_002",
    replacementReason: "Customer-requested design change",
    replacementReference: "RPL-2026-0318",
  });
  const o7 = mkOrder({
    customerId: "cus_030",
    cardId: c030.id,
    orderType: "Initial Plus Card",
    requestedDesign: "Pearl Ivory",
    orderStatus: "Batched",
    requestDate: ago(2),
    manufacturingBatchId: "bat_003",
  });
  const o8 = mkOrder({
    customerId: "cus_031",
    cardId: c031.id,
    orderType: "Initial Plus Card",
    requestedDesign: "Classic",
    orderStatus: "Eligible",
    requestDate: ago(1, 6),
  });
  const o9 = mkOrder({
    customerId: "cus_032",
    cardId: c032.id,
    orderType: "Initial Plus Card",
    requestedDesign: "Aqua Aura",
    orderStatus: "Eligible",
    requestDate: ago(0, 9),
  });
  const o10 = mkOrder({
    customerId: "cus_028",
    cardId: c028.id,
    previousCardId: null,
    orderType: "Replacement Card",
    requestedDesign: "Aqua Aura",
    previousDesign: "Blue Nova",
    orderStatus: "Canceled",
    requestDate: ago(5),
    replacementReason: "Customer-requested design change",
    replacementReference: "RPL-2026-0315",
    notes: "Canceled by customer before batching. Original order already in production.",
  });
  cardOrders.push(o1, o2, o3, o4, o5, o6, o7, o8, o9, o10);
  for (const o of cardOrders) {
    if (o.orderStatus === "Canceled") continue;
    act(
      o.customerId,
      "Cards",
      o.orderType === "Replacement Card"
        ? `Replacement card requested (${o.previousDesign} → ${o.requestedDesign})`
        : `Physical ${o.requestedDesign} card selected`,
      o.requestDate,
      { to: "/cards/$cardId", params: { cardId: o.cardId } },
    );
  }

  const batches: ManufacturingBatch[] = [
    {
      id: "bat_000",
      batchReference: "MB-2026-W41",
      createdAt: ago(19, 6),
      createdBy: "emp_06",
      status: "Submitted",
      orderIds: [o1.id, o2.id],
      orderCount: 2,
      pdfReference: "MB-2026-W41.pdf",
      exportedAt: ago(19, 5),
      exportedBy: "emp_06",
      reviewedBy: "emp_01",
      submittedAt: ago(19, 3),
      submittedBy: "emp_06",
      submissionNote: "Emailed to manufacturer production desk.",
      history: [
        { at: ago(19, 6), by: "emp_06", action: "Batch created with 2 orders" },
        { at: ago(19, 5), by: "emp_06", action: "Manufacturing PDF generated" },
        { at: ago(19, 4), by: "emp_01", action: "Marked ready for submission" },
        { at: ago(19, 3), by: "emp_06", action: "Submission recorded" },
      ],
    },
    {
      id: "bat_001",
      batchReference: "MB-2026-W43",
      createdAt: ago(5, 8),
      createdBy: "emp_06",
      status: "Submitted",
      orderIds: [o3.id, o4.id],
      orderCount: 2,
      pdfReference: "MB-2026-W43.pdf",
      exportedAt: ago(5, 7),
      exportedBy: "emp_06",
      reviewedBy: "emp_01",
      submittedAt: ago(5, 5),
      submittedBy: "emp_06",
      submissionNote: "Sent via manufacturer portal upload.",
      history: [
        { at: ago(5, 8), by: "emp_06", action: "Batch created with 2 orders" },
        { at: ago(5, 7), by: "emp_06", action: "Manufacturing PDF generated" },
        { at: ago(5, 6), by: "emp_01", action: "Marked ready for submission" },
        { at: ago(5, 5), by: "emp_06", action: "Submission recorded" },
      ],
    },
    {
      id: "bat_002",
      batchReference: "MB-2026-W44-A",
      createdAt: ago(1, 4),
      createdBy: "emp_06",
      status: "Ready for Submission",
      orderIds: [o5.id, o6.id],
      orderCount: 2,
      pdfReference: "MB-2026-W44-A.pdf",
      exportedAt: ago(1, 3),
      exportedBy: "emp_06",
      reviewedBy: "emp_06",
      submittedAt: null,
      submittedBy: null,
      submissionNote: null,
      history: [
        { at: ago(1, 4), by: "emp_06", action: "Batch created with 2 orders" },
        { at: ago(1, 3), by: "emp_06", action: "Manufacturing PDF generated" },
        { at: ago(1, 2), by: "emp_06", action: "Marked ready for submission" },
      ],
    },
    {
      id: "bat_003",
      batchReference: "MB-2026-W44-B",
      createdAt: ago(0, 7),
      createdBy: "emp_06",
      status: "Draft",
      orderIds: [o7.id],
      orderCount: 1,
      pdfReference: null,
      exportedAt: null,
      exportedBy: null,
      reviewedBy: null,
      submittedAt: null,
      submittedBy: null,
      submissionNote: null,
      history: [{ at: ago(0, 7), by: "emp_06", action: "Batch created with 1 order" }],
    },
  ];

  // Transactions & transfers for customers with issued accounts
  const MERCHANTS = [
    "Loblaws",
    "Tim Hortons",
    "Shoppers Drug Mart",
    "Uber",
    "Netflix",
    "Spotify",
    "Canadian Tire",
    "Presto",
    "Metro",
    "Esso",
    "Amazon.ca",
    "SAQ",
    "Hydro One",
    "Rogers",
    "IKEA",
  ];
  let txN = 0;
  const statusPick = (): TxnStatus => {
    const x = rnd();
    return x < 0.86 ? "Completed" : x < 0.93 ? "Pending" : x < 0.98 ? "Failed" : "Reversed";
  };
  const addTxn = (
    t: Omit<Transaction, "id" | "transactionReference" | "currency" | "notes" | "completedAt"> & {
      ref?: string;
    },
  ) => {
    txN++;
    const tx: Transaction = {
      id: `txn_${String(txN).padStart(4, "0")}`,
      transactionReference: t.ref ?? `TX-${String(700000 + txN * 13)}`,
      currency: "CAD",
      notes: [],
      completedAt:
        t.status === "Completed" || t.status === "Reversed"
          ? iso(new Date(t.timestamp).getTime() + 2 * 60_000)
          : null,
      ...t,
    };
    delete (tx as Partial<{ ref: string }>).ref;
    transactions.push(tx);
    return tx;
  };
  const issuedCustomers = customers.filter(
    (c) => c.accountIssuanceStatus === "Issued" && c.customerStatus !== "Closed",
  );
  for (const c of issuedCustomers) {
    const nn = c.id.slice(4);
    const ss = `acc_${nn}_ss`;
    const count = c.customerStatus === "Setup In Progress" ? 1 : 7;
    for (let k = 0; k < count; k++) {
      const status = statusPick();
      const m = pick(MERCHANTS);
      addTxn({
        customerId: c.id,
        accountId: ss,
        transactionType: "Card Purchase",
        description: m,
        direction: "debit",
        amount: money(3.5, 185),
        status,
        timestamp: ago(Math.floor(rnd() * 21), Math.floor(rnd() * 20)),
        providerReference: `MC-${digits(10)}`,
        paymentRail: "Mastercard",
        errorMessage:
          status === "Failed"
            ? pick(["Insufficient funds", "Merchant declined", "Card network timeout"])
            : undefined,
      });
    }
    const sub = subscriptions.find((x) => x.customerId === c.id);
    if (sub?.plan === "Plus" && sub.latestBillingStatus === "Paid") {
      addTxn({
        customerId: c.id,
        accountId: ss,
        transactionType: "Plan Fee",
        description: "Renda Plus membership",
        direction: "debit",
        amount: 9.96,
        status: "Completed",
        timestamp: ago(Math.floor(rnd() * 25) + 2),
        providerReference: `BIL-${digits(8)}`,
        paymentRail: "Renda Billing",
      });
    }
    if (c.customerStatus === "Active") {
      addTxn({
        customerId: c.id,
        accountId: `acc_${nn}_sv`,
        transactionType: "Interest",
        description: "Sense Save interest",
        direction: "credit",
        amount: money(0.4, 38),
        status: "Completed",
        timestamp: ago(3, 2),
        providerReference: `INT-${digits(8)}`,
        paymentRail: "Internal Ledger",
      });
    }
  }

  // Transfers
  const actives = customers.filter((c) => c.customerStatus === "Active");
  let trN = 0;
  const addTransfer = (
    t: Omit<Transfer, "id" | "transactionReference" | "currency" | "returnRequest">,
  ) => {
    trN++;
    const ref = `TR-${String(510000 + trN * 17)}`;
    const tr: Transfer = {
      id: `trf_${String(trN).padStart(3, "0")}`,
      transactionReference: ref,
      currency: "CAD",
      returnRequest: null,
      ...t,
    };
    transfers.push(tr);
    return tr;
  };
  for (let k = 0; k < 14; k++) {
    const a = actives[k % actives.length];
    const b = actives[(k * 5 + 3) % actives.length];
    if (a.id === b.id) continue;
    const status = statusPick();
    const amount = money(10, 420);
    const ts = ago(Math.floor(rnd() * 18), Math.floor(rnd() * 20));
    const tr = addTransfer({
      transferType: "P2P",
      senderCustomerId: a.id,
      recipientCustomerId: b.id,
      amount,
      status,
      createdAt: ts,
      providerReference: `P2P-${digits(8)}`,
    });
    addTxn({
      ref: tr.transactionReference,
      transferId: tr.id,
      customerId: a.id,
      accountId: `acc_${a.id.slice(4)}_ss`,
      transactionType: "P2P Sent",
      description: `To ${b.firstName} ${b.lastName}`,
      direction: "debit",
      amount,
      status,
      timestamp: ts,
      providerReference: tr.providerReference,
      paymentRail: "Internal Ledger",
      errorMessage: status === "Failed" ? "Recipient account unavailable" : undefined,
    });
    if (status !== "Failed")
      addTxn({
        ref: `${tr.transactionReference}-R`,
        transferId: tr.id,
        customerId: b.id,
        accountId: `acc_${b.id.slice(4)}_ss`,
        transactionType: "P2P Received",
        description: `From ${a.firstName} ${a.lastName}`,
        direction: "credit",
        amount,
        status,
        timestamp: ts,
        providerReference: tr.providerReference,
        paymentRail: "Internal Ledger",
      });
  }
  const COUNTERPARTIES = [
    "J. Robertson",
    "Landlord. M. Patel",
    "S. Nguyen",
    "Bright Dental Inc.",
    "A. Lavoie",
    "Payroll. Northwind Ltd.",
  ];
  for (let k = 0; k < 12; k++) {
    const a = actives[(k * 3 + 1) % actives.length];
    const dir = k % 3 === 0 ? "Incoming" : "Outgoing";
    const st: TxnStatus =
      k === 4 ? "Failed" : k === 7 ? "Pending" : k === 10 ? "Reversed" : "Completed";
    const amount = money(25, 1800);
    const ts = ago(Math.floor(rnd() * 20), Math.floor(rnd() * 20));
    const tr = addTransfer({
      transferType: "Interac",
      senderCustomerId: a.id,
      recipientCustomerId: null,
      direction: dir,
      counterpartyLabel: pick(COUNTERPARTIES),
      amount,
      status: st,
      createdAt: ts,
      providerReference: `CA${digits(2)}${String.fromCharCode(65 + (k % 26))}${digits(6)}`,
    });
    addTxn({
      ref: tr.transactionReference,
      transferId: tr.id,
      customerId: a.id,
      accountId: `acc_${a.id.slice(4)}_ss`,
      transactionType: dir === "Incoming" ? "Interac Received" : "Interac Sent",
      description: `${dir === "Incoming" ? "Interac e-Transfer from" : "Interac e-Transfer to"} ${tr.counterpartyLabel}`,
      direction: dir === "Incoming" ? "credit" : "debit",
      amount,
      status: st,
      timestamp: ts,
      providerReference: tr.providerReference,
      paymentRail: "Interac",
      errorMessage: st === "Failed" ? "Recipient did not accept before expiry" : undefined,
    });
  }
  for (let k = 0; k < 10; k++) {
    const a = actives[(k * 7 + 2) % actives.length];
    const toSave = k % 3 !== 2;
    const nn = a.id.slice(4);
    const amount = money(20, 600);
    const ts = ago(Math.floor(rnd() * 20), Math.floor(rnd() * 20));
    const src = toSave ? `acc_${nn}_ss` : `acc_${nn}_sv`;
    const dst = toSave ? `acc_${nn}_sv` : `acc_${nn}_ss`;
    const tr = addTransfer({
      transferType: "Account-to-Account",
      senderCustomerId: a.id,
      recipientCustomerId: a.id,
      sourceAccountId: src,
      destinationAccountId: dst,
      amount,
      status: "Completed",
      createdAt: ts,
      providerReference: `A2A-${digits(8)}`,
    });
    addTxn({
      ref: tr.transactionReference,
      transferId: tr.id,
      customerId: a.id,
      accountId: src,
      transactionType: "Account Transfer",
      description: toSave ? "Smart Spend → Sense Save" : "Sense Save → Smart Spend",
      direction: "debit",
      amount,
      status: "Completed",
      timestamp: ts,
      providerReference: tr.providerReference,
      paymentRail: "Internal Ledger",
    });
  }
  transactions.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  transfers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  // Savings goals
  const GOALS: [string, string, number, number | null, SavingsGoal["status"]][] = [
    ["cus_020", "Emergency fund", 3000, 1240, "Active"],
    ["cus_021", "Trip to Lisbon", 4500, 1875.5, "Active"],
    ["cus_023", "New laptop", 2200, 2200, "Completed"],
    ["cus_023", "Wedding fund", 15000, 3920, "Active"],
    ["cus_024", "Studio equipment", 1800, 310, "Paused"],
    ["cus_026", "Down payment", 60000, 18450, "Active"],
    ["cus_027", "Winter tires", 1200, 960, "Active"],
    ["cus_028", "Japan trip", 6000, 2480, "Active"],
    ["cus_029", "Home renovation", 25000, 7600, "Active"],
    ["cus_030", "Car replacement", 18000, null, "Active"],
    ["cus_031", "Holiday gifts", 900, 900, "Completed"],
    ["cus_032", "Vineyard tour, Napa", 3500, 640, "Active"],
    ["cus_022", "Kids' camp", 1600, 420, "Active"],
  ];
  GOALS.forEach(([cid, name, target, cur, status], i) => {
    const ts = ago(30 - i * 2);
    goals.push({
      id: `gol_${String(i + 1).padStart(3, "0")}`,
      customerId: cid,
      accountId: `acc_${cid.slice(4)}_sv`,
      goalName: name,
      targetAmount: target,
      currentAmount: cur,
      currency: "CAD",
      status,
      createdAt: ts,
      targetDate: iso(DEMO_NOW + (60 + i * 20) * D),
    });
    act(cid, "Profile", `Savings goal "${name}" created with Alfie`, ts);
  });

  // Support cases
  const findTxn = (cid: string, pred: (t: Transaction) => boolean = () => true) =>
    transactions.find((t) => t.customerId === cid && pred(t));
  const failedTx = transactions.find((t) => t.status === "Failed" && t.paymentRail === "Interac");
  const failedCardTx = transactions.find(
    (t) => t.status === "Failed" && t.paymentRail === "Mastercard",
  );
  type CS = [
    string,
    string,
    string,
    SupportCase["category"],
    SupportCase["priority"],
    SupportCase["status"],
    string | null,
    number,
    SupportCase["links"],
  ];
  const CASES: CS[] = [
    [
      "cus_017",
      "Account setup stuck after verification",
      "I passed verification days ago but my accounts still haven't been opened. What's going on?",
      "Banking Account",
      "High",
      "In Progress",
      "emp_05",
      2,
      [],
    ],
    [
      "cus_012",
      "Why was my ID rejected?",
      "The app says my verification failed. I uploaded my driver's licence. Can you tell me what was wrong?",
      "Verification",
      "Normal",
      "Awaiting Customer",
      "emp_02",
      4,
      [],
    ],
    [
      failedTx?.customerId ?? "cus_022",
      "Interac transfer never arrived",
      "I sent an e-Transfer to my landlord and it shows failed but I'm not sure if the money left my account.",
      "Transfer",
      "High",
      "Open",
      null,
      1,
      failedTx ? [{ type: "transaction", id: failedTx.id }] : [],
    ],
    [
      "cus_026",
      "Replacement card status",
      "My card chip stopped working. When will my new Blue Nova card arrive?",
      "Card",
      "Normal",
      "Resolved",
      "emp_06",
      7,
      [{ type: "card", id: "crd_026_p2" }],
    ],
    [
      "cus_025",
      "Choosing my Plus card design",
      "I upgraded to Plus but I'm not sure where to pick my card. Can you help?",
      "Membership",
      "Normal",
      "Open",
      "emp_03",
      0,
      [],
    ],
    [
      failedCardTx?.customerId ?? "cus_020",
      "Card declined at grocery store",
      "My card was declined even though I have money in my account.",
      "Transaction",
      "Normal",
      "In Progress",
      "emp_02",
      2,
      failedCardTx ? [{ type: "transaction", id: failedCardTx.id }] : [],
    ],
    [
      "cus_033",
      "Account restricted. Need access",
      "I can't send money anymore. Please explain why my account is restricted.",
      "Account Access",
      "Urgent",
      "Escalated",
      "emp_04",
      3,
      [{ type: "account", id: "acc_033_ss" }],
    ],
    [
      "cus_028",
      "Alfie miscategorized subscriptions",
      "Alfie says I'm paying for two streaming services but I cancelled one last month.",
      "Alfie",
      "Low",
      "Open",
      null,
      1,
      [],
    ],
    [
      "cus_021",
      "Savings goal progress not updating",
      "My Lisbon goal hasn't changed after my last transfer to Sense Save.",
      "Savings",
      "Low",
      "Resolved",
      "emp_03",
      9,
      [],
    ],
    [
      "cus_005",
      "Didn't receive SMS code",
      "I'm trying to verify my phone and the code never arrives.",
      "Account Access",
      "Normal",
      "Open",
      null,
      0,
      [],
    ],
    [
      "cus_029",
      "Question about Plus benefits",
      "Does Plus include any travel insurance?",
      "General Inquiry",
      "Low",
      "Closed",
      "emp_02",
      15,
      [],
    ],
    [
      "cus_027",
      "Change card design",
      "I'd like to switch from Pearl Ivory to Classic.",
      "Card",
      "Normal",
      "Resolved",
      "emp_06",
      4,
      [{ type: "card", id: "crd_027_p2" }],
    ],
    [
      "cus_010",
      "Verification taking too long",
      "It's been over a week since I submitted my ID.",
      "Verification",
      "High",
      "In Progress",
      "emp_04",
      1,
      [],
    ],
    [
      "cus_031",
      "When will my physical card ship?",
      "Just joined Plus and selected Classic. What's the timeline?",
      "Card",
      "Low",
      "Open",
      "emp_06",
      0,
      [],
    ],
  ];
  const supportCases: SupportCase[] = CASES.map(
    ([cid, subject, message, category, priority, status, assignee, days, links], i) => {
      const created = ago(days, 3 + (i % 5));
      const closed = status === "Resolved" || status === "Closed";
      const tl: SupportCase["timeline"] = [
        { at: created, by: null, text: "Case submitted from the in-app Help section" },
      ];
      if (assignee)
        tl.push({
          at: iso(new Date(created).getTime() + 1.5 * H),
          by: assignee,
          text: `Assigned to ${EMPLOYEES.find((e) => e.id === assignee)!.name}`,
        });
      if (closed)
        tl.push({
          at: iso(new Date(created).getTime() + 30 * H),
          by: assignee,
          text: `Status changed to ${status}`,
        });
      return {
        id: `case_${String(i + 1).padStart(3, "0")}`,
        customerId: cid,
        caseReference: `SC-${String(20410 + i * 3)}`,
        subject,
        message,
        category,
        priority,
        status,
        assignedEmployeeId: assignee,
        createdAt: created,
        updatedAt: tl[tl.length - 1].at,
        notes:
          assignee && i % 2 === 0
            ? [
                {
                  id: `note_s${i}`,
                  at: iso(new Date(created).getTime() + 2 * H),
                  by: assignee,
                  text: "Reviewed customer record. Following up with the relevant team.",
                },
              ]
            : [],
        links,
        resolution: closed
          ? category === "Card"
            ? "Confirmed replacement card included in submitted manufacturing batch. Customer informed of expected timeline."
            : "Explained to customer; no further action required."
          : null,
        timeline: tl,
      };
    },
  );
  supportCases.forEach((c) =>
    act(
      c.customerId,
      "Support",
      `Support case ${c.caseReference} opened: ${c.subject}`,
      c.createdAt,
      { to: "/support/$caseId", params: { caseId: c.id } },
    ),
  );
  void findTxn;

  const alfieEvents: AlfieEvent[] = [
    {
      id: "alf_01",
      timestamp: ago(0, 1),
      workflow: "Integration",
      description:
        "Merchant categorization service timed out (3 retries). Spending insights delayed.",
      severity: "Warning",
      status: "Open",
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
      customerId: null,
    },
    {
      id: "alf_02",
      timestamp: ago(0, 3),
      workflow: "Savings Goals",
      description: 'Savings goal setup completed: "Vineyard tour, Napa"',
      severity: "Info",
      status: "Resolved",
      resolvedAt: ago(0, 1),
      resolvedBy: "emp_01",
      resolutionNote: "Handled in the demo dataset.",
      customerId: "cus_032",
    },
    {
      id: "alf_03",
      timestamp: ago(1, 2),
      workflow: "Subscription Analysis",
      description:
        "Subscription analysis failed: duplicate merchant descriptors could not be reconciled.",
      severity: "Error",
      status: "Open",
      resolvedAt: null,
      resolvedBy: null,
      resolutionNote: null,
      customerId: "cus_028",
    },
    {
      id: "alf_04",
      timestamp: ago(1, 7),
      workflow: "Spending Insights",
      description: "Monthly insights generated for 13 active customers.",
      severity: "Info",
      status: "Resolved",
      resolvedAt: ago(0, 1),
      resolvedBy: "emp_01",
      resolutionNote: "Handled in the demo dataset.",
      customerId: null,
    },
    {
      id: "alf_05",
      timestamp: ago(2, 4),
      workflow: "Savings Goals",
      description: "Goal progress sync requires attention. Sense Save balance not yet reflected.",
      severity: "Warning",
      status: "Resolved",
      resolvedAt: ago(0, 1),
      resolvedBy: "emp_01",
      resolutionNote: "Handled in the demo dataset.",
      customerId: "cus_021",
    },
    {
      id: "alf_06",
      timestamp: ago(2, 9),
      workflow: "Conversation",
      description: "Conversation handed off to Help. Customer asked about card delivery.",
      severity: "Info",
      status: "Resolved",
      resolvedAt: ago(0, 1),
      resolvedBy: "emp_01",
      resolutionNote: "Handled in the demo dataset.",
      customerId: "cus_031",
    },
    {
      id: "alf_07",
      timestamp: ago(3, 1),
      workflow: "Subscription Analysis",
      description: "Subscription identified: Spotify Premium (CAD 11.99/mo).",
      severity: "Info",
      status: "Resolved",
      resolvedAt: ago(0, 1),
      resolvedBy: "emp_01",
      resolutionNote: "Handled in the demo dataset.",
      customerId: "cus_024",
    },
    {
      id: "alf_08",
      timestamp: ago(4, 6),
      workflow: "Integration",
      description: "Banking data feed latency above threshold for 12 minutes.",
      severity: "Warning",
      status: "Resolved",
      resolvedAt: ago(0, 1),
      resolvedBy: "emp_01",
      resolutionNote: "Handled in the demo dataset.",
      customerId: null,
    },
  ];

  const audit: AuditEvent[] = [
    {
      id: "aud_0001",
      employeeId: "emp_06",
      action: "Manufacturing batch created",
      module: "Card Manufacturing",
      entityType: "Batch",
      entityId: "bat_001",
      entityLabel: "MB-2026-W43",
      timestamp: ago(5, 8),
      outcome: "Success",
      details: "2 orders included",
    },
    {
      id: "aud_0002",
      employeeId: "emp_06",
      action: "Manufacturing PDF exported",
      module: "Card Manufacturing",
      entityType: "Batch",
      entityId: "bat_001",
      entityLabel: "MB-2026-W43",
      timestamp: ago(5, 7),
      outcome: "Success",
      details: "MB-2026-W43.pdf",
    },
    {
      id: "aud_0003",
      employeeId: "emp_06",
      action: "Batch submission recorded",
      module: "Card Manufacturing",
      entityType: "Batch",
      entityId: "bat_001",
      entityLabel: "MB-2026-W43",
      timestamp: ago(5, 5),
      outcome: "Success",
      details: "Sent via manufacturer portal upload.",
      before: { status: "Ready for Submission" },
      after: { status: "Submitted" },
    },
    {
      id: "aud_0004",
      employeeId: "emp_02",
      action: "Replacement card request created",
      module: "Cards",
      entityType: "Card",
      entityId: "crd_026_p2",
      entityLabel: "RPL-2026-0311",
      timestamp: ago(8),
      outcome: "Success",
      details: "Classic → Blue Nova · Damaged card",
    },
    {
      id: "aud_0005",
      employeeId: "emp_03",
      action: "Support case assigned",
      module: "Customer Support",
      entityType: "Support Case",
      entityId: "case_005",
      entityLabel: "SC-20422",
      timestamp: ago(0, 2),
      outcome: "Success",
      details: "Assigned to Kevin Adeyemi",
    },
    {
      id: "aud_0006",
      employeeId: "emp_06",
      action: "Manufacturing batch created",
      module: "Card Manufacturing",
      entityType: "Batch",
      entityId: "bat_002",
      entityLabel: "MB-2026-W44-A",
      timestamp: ago(1, 4),
      outcome: "Success",
      details: "2 orders included",
    },
    {
      id: "aud_0007",
      employeeId: "emp_06",
      action: "Manufacturing PDF exported",
      module: "Card Manufacturing",
      entityType: "Batch",
      entityId: "bat_002",
      entityLabel: "MB-2026-W44-A",
      timestamp: ago(1, 3),
      outcome: "Success",
      details: "MB-2026-W44-A.pdf",
    },
    {
      id: "aud_0008",
      employeeId: "emp_06",
      action: "Batch marked ready for submission",
      module: "Card Manufacturing",
      entityType: "Batch",
      entityId: "bat_002",
      entityLabel: "MB-2026-W44-A",
      timestamp: ago(1, 2),
      outcome: "Success",
      details: "",
      before: { status: "Draft" },
      after: { status: "Ready for Submission" },
    },
    {
      id: "aud_0009",
      employeeId: "emp_01",
      action: "Employee role changed",
      module: "Employees & Permissions",
      entityType: "Employee",
      entityId: "emp_08",
      entityLabel: "Dana Morrison",
      timestamp: ago(6),
      outcome: "Success",
      details: "Account suspended",
      before: { status: "Active" },
      after: { status: "Suspended" },
    },
    {
      id: "aud_0010",
      employeeId: "emp_07",
      action: "Customer information update attempted",
      module: "Customers",
      entityType: "Customer",
      entityId: "cus_020",
      entityLabel: "Marcus Bennett",
      timestamp: ago(2, 1),
      outcome: "Denied",
      details: "Role Read-Only Analyst lacks customers.edit",
    },
    {
      id: "aud_0011",
      employeeId: "emp_06",
      action: "Manufacturing batch created",
      module: "Card Manufacturing",
      entityType: "Batch",
      entityId: "bat_003",
      entityLabel: "MB-2026-W44-B",
      timestamp: ago(0, 7),
      outcome: "Success",
      details: "1 order included",
    },
  ].sort((a, b) => b.timestamp.localeCompare(a.timestamp)) as AuditEvent[];

  activity.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    version: 5,
    customers,
    accounts,
    transactions,
    transfers,
    cards,
    cardOrders,
    batches,
    subscriptions,
    goals,
    supportCases,
    employees: EMPLOYEES,
    audit,
    kycCases,
    activity,
    alfieEvents,
    alfieServices: [
      { name: "Conversation engine", status: "Operational", latencyMs: 640, successRate: 99.6 },
      { name: "Subscription analysis", status: "Degraded", latencyMs: 2140, successRate: 94.2 },
      { name: "Savings goal workflows", status: "Operational", latencyMs: 410, successRate: 99.9 },
      { name: "Merchant categorization", status: "Degraded", latencyMs: 3880, successRate: 91.5 },
    ],
    settings: {
      organizationName: "Renda Financial Technologies",
      timezone: "America/Toronto",
      density: "compact",
      notifyKyc: true,
      notifySupport: true,
      notifyManufacturing: true,
      kycReviewSlaHours: 48,
      supportResponseSlaHours: 24,
      batchProcessingDay: "Friday",
      manufacturerName: "Card manufacturer (to be confirmed)",
      planRetryIntervalDays: 5,
    },
    currentEmployeeId: "",
    readNotificationIds: [],
  };
}
