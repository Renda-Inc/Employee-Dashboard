# Welcome to your Lovable project

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Open your project in the [Lovable editor](https://lovable.dev) and keep building.

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: connect the project to GitHub and every change made in Lovable is committed straight to your repository.
- **Full ownership**: this code is yours. Push to your repository and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Backend integration

The app currently runs standalone: employee sign-in, accounts and roles use an in-browser mock, and
operations records are stored in the browser. To connect your own backend:

1. Implement the interfaces in `src/services/contracts/` — `AuthService` (sign-in, session, two-step
   verification), `EmployeeAdminApi` (employees, roles, admin audit) and `OperationsService` (customer,
   card, support and billing actions).
2. Swap the implementations in `src/services/api.ts`. No page imports an implementation directly.
3. Use `docs/schema.sql` as the reference schema for employee accounts, roles and the admin audit trail.
4. Turn off open sign-in (`OPEN_SIGN_IN` in `src/services/mock/auth.ts`) or remove the mock once replaced.

Run `npm test` to check access rules and the mock services.

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
