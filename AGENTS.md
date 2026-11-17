# AGENTS.md

Working notes for anyone building on this project.

## History

This project was started in a hosted editor and moved to standalone
development on 2026-11-15. The editor is disconnected: nothing in the repo
depends on it, and the build runs on the plain Vite config in
`vite.config.ts`. Work happens directly on the `main` branch, which
auto-deploys to GitHub Pages.

## Cards and manufacturing (product rule, user, 2026-11-15)

Card manufacturing is outsourced end to end. Renda's job is the batch: build it, generate the PDF, mark it ready, record its submission to the manufacturer. The manufacturer prints the cards and mails them to customers directly. Renda does NOT track shipping or delivery, and the admin must never show a delivery state, tracking reference or shipping status. The lifecycle after submission is driven by one signal: the customer activating the card (reported by the card processor; `recordCardActivation` in the operations service). Activation moves the card to Active, completes the order as "Activated", and retires any card it replaces. A card still In Production `ACTIVATION_FOLLOWUP_DAYS` (14) after submission surfaces in the attention queue as "Card not activated", and a submitted, never-activated order can still be canceled so a replacement can be issued.

## Plans and billing (product rule, user, 2026-11-17)

Plus is charged from the customer's Smart Spend account. An upgrade charges the fee immediately, in the same action (`changePlan` in the operations service): if Smart Spend cannot cover it, the upgrade does not happen and the customer stays on Everyday. There is no pending upgrade state. A failed monthly renewal does not suspend the plan and is never a "Billing Issue" status (that status does not exist): the fee becomes outstanding (`billingOutstandingSince`), the plan stays active, and the charge is retried at intervals (`planRetryIntervalDays` in Settings; the exact interval is still being decided) for the rest of the billing month, including automatic collection whenever funds land. Retries are recorded as billing-system events (`recordRenewalAttempt`), not employee simulations of a pending charge. If the fee is still unpaid when the new billing date arrives (the subscription's `nextBillingDate`, advanced past the missed date at the first failure; `billingDowngradeDue` in `src/services/rules.ts`), the plan is downgraded to Everyday (`downgradeForNonPayment`), which also cancels physical cards and open card orders because Everyday is virtual-only. Physical cards exist only for Plus members, and account issuance always creates Smart Spend and Sense Save together.

## UI architecture

- Use the shared semantic tokens, Button, PageHeader, Panel and table controls for every employee module; visual refinements must not modify service rules or data relationships.
- Keep customer overview sections in the shared unboxed summary workspace and preserve URL-backed profile tabs, so detailed records remain accessible without fragmented containers.
- Use SelectField to restyle existing select fields while retaining their option values and event handlers; shared dropdown presentation prevents inconsistent native controls.

## Employee access

- Every dashboard page lives under `src/routes/_authenticated/`, whose gate (`resolveAccess` in `src/services/directory.ts`) requires an Active employee with a role, completed MFA when enrolled, and a non-temporary password; this keeps sign-in, MFA and first-password rules in one place.
- All backend access goes through the contracts in `src/services/contracts/` (`AuthService`, `EmployeeAdminApi`, `OperationsService`, `OperationsRepository`), wired in one place, `src/services/api.ts`; pages never import an implementation, so a real backend replaces the in-browser mocks in `src/services/mock/` without UI changes.
- Employee writes must check the caller's permission and the rules in `employee-rules.ts` inside the service implementation (the mock does this in `src/services/mock/employees.ts`), so business rules (last Administrator, self-changes, automatic Invitation Pending) can't be bypassed from the UI.
- Pure access rules live in `src/services/employee-rules.ts` with tests in `src/test/employee-rules.test.ts`; mock-service behavior is covered by `src/test/mock-backend.test.ts`.
- `docs/schema.sql` is the reference schema for employee tables and must stay in step with `src/services/contracts/employees.ts`.
- The operations dataset is a synchronous React snapshot (`useDB`) loaded through `OperationsRepository` by the workspace gate (`loadOperations`); writes before it loads are never persisted, so stale state can't overwrite saved records.
- The demo operations dataset reads permissions through the live role registry (`setRolePermissions`) and mirrors directory employees into the local store, so custom roles apply to every existing module without changing module code.
- Temporary testing mode (user decision, 2026-11-15): `OPEN_SIGN_IN` is ON in `src/services/mock/auth.ts`. Any credentials that do not match a real employee sign in as the ephemeral Test Administrator (`ensureTestAdmin` in `src/services/mock/backend.ts`), a fixed generic identity that lives only in memory: the typed credentials are never stored or turned into an account, the identity is stripped from every persisted tables write, its session is memory-only (a reload signs it out), it leaves no audit or last-login record, and it does not count as a safeguard Administrator. Real accounts sign in normally and take precedence. While the flag is on, the first-run setup screen is skipped (`needsInitialSetup` returns false) and failed-attempt rate limiting is bypassed. Turn `OPEN_SIGN_IN` off before any real use: strict mode has no shared or fallback account, sign-in then offers the one-time first-administrator setup (`needsInitialSetup` / `setupInitialAdmin` in the AuthService contract) only while no real accounts exist, and failed sign-ins are rate-limited per email, returning the contract's "rate-limited" error.
