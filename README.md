# Renda Admin (Employee Dashboard)

Internal operations dashboard for Renda employees: customers, accounts, cards,
transactions, support, onboarding, employee accounts and roles.

Live preview: https://renda-inc.github.io/Employee-Dashboard/
Deploys automatically from `main` via GitHub Pages (`.github/workflows/pages.yml`).

## Development

You need Node.js or Bun. This repo uses Bun as its package manager
(`bun.lock` is the lockfile; there is no package-lock).

```sh
bun install
bun run dev
bun test
bun run build
```

## First sign-in

**Temporary testing mode is ON** (`OPEN_SIGN_IN` in
`src/services/mock/auth.ts`, enabled 2026-11-15 while the team tests the
dashboard): any email and password sign you in as an ephemeral Test
Administrator with full access. The credentials you type are never saved:
no account is created from them, no password is stored, the test identity
is a fixed generic one held in memory only, and reloading the page signs
it out. Real employee accounts still sign in with their own credentials
exactly as below.

Set `OPEN_SIGN_IN` to `false` before any real use. Strict mode has no
default or shared account: on a fresh workspace (no employee accounts at
all), the sign-in page offers a one-time setup where the first person
creates their own Administrator account with a password they choose, and
setup closes permanently as soon as that account exists. An administrator
then adds employees from Employees, each with a system-generated temporary
password they must replace at first sign-in. Sign-in attempts are
rate-limited per email in strict mode: repeated failures lock further
attempts for a few minutes.

## Backend integration

The app currently runs standalone: employee sign-in, accounts and roles use
an in-browser mock, and operations records are stored in the browser. The
mock is not secure storage and must not hold real customer data. To connect
your own backend:

1. Implement the interfaces in `src/services/contracts/`: `AuthService`
   (sign-in, session, two-step verification, first-run setup),
   `EmployeeAdminApi` (employees, roles, admin audit) and
   `OperationsService` (customer, card, support and billing actions).
2. Swap the implementations in `src/services/api.ts`. No page imports an
   implementation directly.
3. Use `docs/schema.sql` as the reference schema for employee accounts,
   roles and the admin audit trail.

Run `bun test` to check access rules and the mock services.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
