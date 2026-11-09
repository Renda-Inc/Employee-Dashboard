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
- Employee, role and admin-audit tables are read-only to browsers; all writes go through `src/services/employees.functions.ts`, which checks `has_permission` in the database first, so business rules (last Administrator, self-changes, automatic Invitation Pending) can't be bypassed.
- Pure access rules live in `src/services/employee-rules.ts` with tests in `src/test/employee-rules.test.ts`; server functions and UI both import them so behavior stays identical.
- The demo operations dataset reads permissions through the live role registry (`setRolePermissions`) and mirrors directory employees into the local store, so custom roles apply to every existing module without changing module code.
- Sign-in temporarily falls back to one shared demo Administrator when credentials don't match a real employee (`OPEN_SIGN_IN` in `src/services/employees.functions.ts`); one flag turns it off, and real employee logins still take priority.
