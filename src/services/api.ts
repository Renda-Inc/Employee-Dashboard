// Single wiring point for every backend dependency. To connect a real backend, implement the
// contracts in src/services/contracts/ (for example with fetch calls to your API) and swap them here.
// Nothing else in the app imports an implementation directly.
import type { AuthService } from "./contracts/auth";
import type { EmployeeAdminApi } from "./contracts/employees";
import type { OperationsService } from "./contracts/operations";
import { mockAuthService } from "./mock/auth";
import { mockEmployeeAdminApi } from "./mock/employees";
import { localOperations } from "./actions";

/** Employee sign-in, session and two-step verification. */
export const auth: AuthService = mockAuthService;
/** Employee accounts, roles and the administration audit trail. */
export const employeesApi: EmployeeAdminApi = mockEmployeeAdminApi;
/** Changes to customer, banking, card and support records. */
export const operations: OperationsService = localOperations;
