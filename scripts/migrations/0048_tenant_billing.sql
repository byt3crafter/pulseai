-- Per-tenant billing, so one deployment can serve customers on different terms.
--
-- Today `billingMode` lives in globalSettings and applies to EVERY workspace on
-- the deployment. As a vendor that is unworkable: Runstate runs unlimited on its
-- own keys while a paying customer is on a monthly plan, and both are tenants on
-- the same box.
--
-- `tenants.status` already existed and NOTHING read it, so a non-paying customer
-- could not actually be suspended. See pulse/src/billing/tenant-access.ts, which
-- is the single place that decides.

CREATE TABLE IF NOT EXISTS tenant_billing (
    tenant_id        uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,

    -- credits   — pre-paid balance, the existing behaviour
    -- flat      — a monthly fee; usage is not metered against a balance
    -- unlimited — internal or a customer on their own provider keys
    plan             varchar(24) NOT NULL DEFAULT 'credits',

    monthly_price    numeric(12,2),
    currency         varchar(3) NOT NULL DEFAULT 'USD',

    -- trialing | active | past_due | suspended | cancelled
    -- Only suspended and cancelled stop the agents. past_due is a warning, on
    -- purpose: cutting a customer off the moment an invoice slips is how you
    -- lose one over a failed card.
    status           varchar(24) NOT NULL DEFAULT 'active',

    period_start     timestamptz,
    period_end       timestamptz,
    suspended_reason text,
    notes            text,

    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_billing_status ON tenant_billing (status);

-- Existing workspaces keep exactly what they have now: no row means "fall back
-- to the global billingMode", so this migration changes nobody's behaviour.
COMMENT ON TABLE tenant_billing IS
    'Per-tenant commercial terms. Absent row = fall back to globalSettings.billingMode.';
