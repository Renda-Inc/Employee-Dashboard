<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

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
- Sign-in temporarily falls back to one shared demo Administrator when credentials don't match a real employee (`OPEN_SIGN_IN` in `src/services/mock/auth.ts`); one flag turns it off, and real employee logins still take priority.
