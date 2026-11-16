# AGENTS.md

Working notes for anyone building on this project.

## History

This project was started in a hosted editor and moved to standalone
development on 2026-11-15. The editor is disconnected: nothing in the repo
depends on it, and the build runs on the plain Vite config in
`vite.config.ts`. Work happens directly on the `main` branch, which
auto-deploys to GitHub Pages.

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
