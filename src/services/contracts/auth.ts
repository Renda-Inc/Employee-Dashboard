// Authentication contract for Renda Admin employees. Swap the implementation in `src/services/api.ts`.
import type { EmployeeRow, RoleRecord } from "./employees";

export interface AuthSession {
  userId: string;
  email: string;
  /** "aal2" once the employee has completed two-step verification in this session. */
  assurance: "aal1" | "aal2";
  /** True when two-step verification is enrolled but not yet completed for this session. */
  mfaRequired: boolean;
}

export type LoginResult =
  | { ok: true; session: AuthSession }
  /** Never reveal whether the email exists: "invalid" covers unknown emails, wrong passwords and blocked accounts. */
  | { ok: false; error: "invalid" | "rate-limited" };

export interface CurrentEmployee {
  employee: EmployeeRow | null;
  role: RoleRecord | null;
}

export type AuthEvent = "SIGNED_IN" | "SIGNED_OUT" | "USER_UPDATED";

export interface MfaEnrollment {
  enrollmentId: string;
  /** Base32 key for manual entry in an authenticator app. */
  secret: string;
  /** otpauth:// URI encoded in the QR code. */
  otpauthUri: string;
  /** Optional image (data URL) of the QR code. */
  qrCodeDataUrl?: string;
}

export interface MfaService {
  /** Whether the signed-in employee has a verified authenticator. */
  isEnrolled(): Promise<boolean>;
  startEnrollment(): Promise<MfaEnrollment>;
  /** Verifies the first code from the authenticator and turns two-step verification on. */
  confirmEnrollment(enrollmentId: string, code: string): Promise<void>;
  cancelEnrollment(enrollmentId: string): Promise<void>;
  disable(): Promise<void>;
}

/**
 * Employee sign-in and session. Implementations record successful sign-ins (last login and an
 * audit event) themselves, and must reject Inactive or Suspended employees.
 */
export interface AuthService {
  login(email: string, password: string): Promise<LoginResult>;
  /** Completes a sign-in that requires two-step verification. Throws on a wrong code. */
  verifyMfa(code: string): Promise<void>;
  logout(): Promise<void>;
  getSession(): Promise<AuthSession | null>;
  /** The signed-in employee's directory record and role, or nulls when signed out. */
  getCurrentEmployee(): Promise<CurrentEmployee>;
  /** Replaces a temporary password with one the employee chose. */
  completePasswordSetup(password: string): Promise<void>;
  mfa: MfaService;
  /** Subscribes to identity changes; returns an unsubscribe function. */
  onAuthStateChange(listener: (event: AuthEvent) => void): () => void;
}
