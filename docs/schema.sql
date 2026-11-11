-- Renda Admin — reference PostgreSQL schema for employee accounts, roles and the administration audit trail.
--
-- This is a standalone reference for the backend team, not a migration the app runs.
-- It maps one-to-one onto the TypeScript contracts in src/services/contracts/employees.ts
-- (EmployeeRow, RoleRecord, RoleAssignment, AdminAuditRecord).
--
-- Assumptions to adapt for your stack:
--   * `auth.users`, `auth.uid()`, `auth.jwt()` and `auth.mfa_factors` come from a Postgres-backed auth
--     service. Replace them with your own users table / session claims if you use something else.
--   * Row-level security makes these tables read-only to signed-in employees; every write is expected
--     to go through trusted backend code that first checks `has_permission(...)`.
--   * Customer, account, card and support records are not modelled here yet; their shapes are in
--     src/types/models.ts and the operations they need are in src/services/contracts/operations.ts.

-- Roles (system + custom) with explicit permission lists
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  department text,
  landing_page text NOT NULL DEFAULT '/',
  permissions text[] NOT NULL DEFAULT '{}',
  is_system boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

CREATE SEQUENCE public.employee_code_seq START 1001;
GRANT USAGE ON SEQUENCE public.employee_code_seq TO service_role;

-- Employee directory (one row per employee login)
CREATE TABLE public.employees (
  id uuid PRIMARY KEY,
  employee_code text NOT NULL UNIQUE DEFAULT ('EMP-' || nextval('public.employee_code_seq')::text),
  first_name text NOT NULL,
  last_name text NOT NULL,
  email text NOT NULL UNIQUE,
  department text NOT NULL,
  job_title text,
  phone text,
  status text NOT NULL DEFAULT 'Invitation Pending' CHECK (status IN ('Active','Invitation Pending','Inactive','Suspended')),
  must_change_password boolean NOT NULL DEFAULT true,
  last_login_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;

-- Role assignment kept separate from the employee record
CREATE TABLE public.user_roles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Administration audit trail
CREATE TABLE public.admin_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text NOT NULL DEFAULT '',
  action text NOT NULL,
  module text NOT NULL DEFAULT 'Employees & Permissions',
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  entity_label text NOT NULL,
  outcome text NOT NULL DEFAULT 'Success',
  details text NOT NULL DEFAULT '',
  before jsonb,
  after jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.admin_audit_events TO authenticated;
GRANT ALL ON public.admin_audit_events TO service_role;
ALTER TABLE public.admin_audit_events ENABLE ROW LEVEL SECURITY;

-- updated_at maintenance
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER roles_touch BEFORE UPDATE ON public.roles FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER employees_touch BEFORE UPDATE ON public.employees FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Session check: caller is an Active employee and has completed MFA when enrolled
CREATE OR REPLACE FUNCTION public.is_active_employee()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, auth AS $$
  SELECT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = auth.uid() AND e.status = 'Active')
    AND (
      coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
      OR NOT EXISTS (SELECT 1 FROM auth.mfa_factors f WHERE f.user_id = auth.uid() AND f.status = 'verified')
    )
$$;

CREATE OR REPLACE FUNCTION public.has_permission(_permission text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_active_employee() AND EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
    WHERE ur.user_id = auth.uid() AND _permission = ANY (r.permissions)
  )
$$;

-- Whether the first administrator still needs to be created
CREATE OR REPLACE FUNCTION public.setup_required()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NOT EXISTS (SELECT 1 FROM public.employees)
$$;
GRANT EXECUTE ON FUNCTION public.setup_required() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_employee() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated;

-- Read policies (all writes go through verified server functions)
CREATE POLICY "Active employees read roles" ON public.roles FOR SELECT TO authenticated USING (public.is_active_employee());
CREATE POLICY "Employees read own record" ON public.employees FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY "Active employees read directory" ON public.employees FOR SELECT TO authenticated USING (public.is_active_employee());
CREATE POLICY "Employees read own role" ON public.user_roles FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "Active employees read assignments" ON public.user_roles FOR SELECT TO authenticated USING (public.is_active_employee());
CREATE POLICY "Own role readable" ON public.roles FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role_id = roles.id));
CREATE POLICY "Audit viewers read admin events" ON public.admin_audit_events FOR SELECT TO authenticated USING (public.has_permission('audit.view'));

-- System roles
INSERT INTO public.roles (name, description, department, landing_page, permissions, is_system) VALUES
('Administrator', 'Full access to every module, employee accounts and role configuration.', 'Executive', '/',
  ARRAY['customers.view','customers.edit','customers.lifecycle','kyc.view','kyc.decide','accounts.view','accounts.manage','transactions.view','transactions.investigate','cards.view','cards.lock','cards.replace','manufacturing.manage','subscriptions.view','subscriptions.manage','support.view','support.manage','alfie.view','alfie.sensitive','employees.manage','roles.manage','audit.view','settings.manage'], true),
('Customer Support', 'Handles customer enquiries, card help and membership changes.', 'Customer Support', '/support',
  ARRAY['customers.view','customers.edit','accounts.view','transactions.view','transactions.investigate','cards.view','cards.lock','cards.replace','subscriptions.view','subscriptions.manage','support.view','support.manage','alfie.view'], true),
('Compliance', 'Reviews identity verification and records compliance decisions.', 'Compliance', '/onboarding',
  ARRAY['customers.view','customers.lifecycle','kyc.view','kyc.decide','accounts.view','transactions.view','transactions.investigate','support.view','support.manage','audit.view','alfie.view','alfie.sensitive'], true),
('Banking Operations', 'Runs account issuance and banking operational actions.', 'Banking Operations', '/accounts',
  ARRAY['customers.view','customers.lifecycle','kyc.view','accounts.view','accounts.manage','transactions.view','transactions.investigate','subscriptions.view','support.view','alfie.view'], true),
('Card Operations', 'Manages cards, replacements and manufacturing batches.', 'Card Operations', '/cards',
  ARRAY['customers.view','accounts.view','cards.view','cards.lock','cards.replace','manufacturing.manage','subscriptions.view','support.view','support.manage'], true),
('Read-Only Analyst', 'View-only access for reporting and analysis.', 'Operations', '/',
  ARRAY['customers.view','kyc.view','accounts.view','transactions.view','cards.view','subscriptions.view','support.view','alfie.view','audit.view'], true);
