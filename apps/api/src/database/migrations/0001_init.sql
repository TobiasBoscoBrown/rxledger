-- RxLedger initial schema.
-- Design goals, straight from the CollectiveOS spec:
--   * audit log that is immutable at the database level (INSERT-only)
--   * PHI stored as ciphertext, never plaintext
--   * indexing strategy that supports the real access paths
--   * optimistic concurrency on the prescription state machine

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Identity & auth
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role          text NOT NULL CHECK (role IN ('patient', 'clinician', 'admin')),
  mfa_secret_enc text,                       -- TOTP secret, envelope-encrypted (PHI-adjacent secret)
  mfa_enabled   boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Refresh-token family for rotation + reuse detection. We store only a SHA-256
-- hash of the token; the raw token never touches the database.
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  family_id   uuid NOT NULL,
  token_hash  text NOT NULL UNIQUE,
  replaced_by uuid REFERENCES refresh_tokens(id),
  revoked     boolean NOT NULL DEFAULT false,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);

-- Patient demographics. dob/phone are PHI -> stored as envelope ciphertext.
CREATE TABLE IF NOT EXISTS patients (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  dob_enc       text NOT NULL,
  phone_enc     text NOT NULL,
  shipping_state char(2) NOT NULL
);

-- ---------------------------------------------------------------------------
-- Clinical workflow
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS encounters (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id          uuid NOT NULL REFERENCES users(id),
  clinician_id        uuid NOT NULL REFERENCES users(id),
  chief_complaint_enc text NOT NULL,         -- PHI (envelope ciphertext)
  clinician_notes_enc text,                  -- PHI (envelope ciphertext)
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_encounters_patient ON encounters(patient_id);

CREATE TABLE IF NOT EXISTS prescriptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id    uuid NOT NULL REFERENCES users(id),
  encounter_id  uuid NOT NULL REFERENCES encounters(id),
  status        text NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','pending_clinician_review','approved',
                                  'denied','sent_to_pharmacy','fulfilled','cancelled')),
  indication_enc text NOT NULL,              -- PHI (envelope ciphertext)
  items_enc     text NOT NULL,               -- PHI: full protocol/dosage, envelope ciphertext
  peptides      text[] NOT NULL DEFAULT '{}',-- non-PHI summary for search/reporting
  version       integer NOT NULL DEFAULT 0,  -- optimistic concurrency token
  created_by    uuid NOT NULL REFERENCES users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- Primary access path: "a patient's prescriptions in a given state".
CREATE INDEX IF NOT EXISTS idx_prescriptions_patient_status ON prescriptions(patient_id, status);
CREATE INDEX IF NOT EXISTS idx_prescriptions_peptides ON prescriptions USING gin(peptides);

-- Append-only transition history for every prescription state change.
CREATE TABLE IF NOT EXISTS prescription_events (
  id              bigserial PRIMARY KEY,
  prescription_id uuid NOT NULL REFERENCES prescriptions(id),
  from_status     text,
  to_status       text NOT NULL,
  actor_id        uuid NOT NULL REFERENCES users(id),
  reason          text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prescription_events_rx ON prescription_events(prescription_id, created_at);

-- ---------------------------------------------------------------------------
-- Orders / payments
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id uuid NOT NULL REFERENCES prescriptions(id),
  status          text NOT NULL DEFAULT 'created'
                  CHECK (status IN ('created','payment_authorized','payment_captured',
                                    'fulfilled','refunded','failed')),
  amount_cents    integer NOT NULL CHECK (amount_cents >= 0),
  payment_token   text NOT NULL,             -- tokenized card ref from PSP, never a PAN
  idempotency_key text NOT NULL UNIQUE,      -- client-supplied; makes order creation safe to retry
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_prescription ON orders(prescription_id);

-- Inbound webhook idempotency: (vendor, event_id) seen at most once.
CREATE TABLE IF NOT EXISTS processed_webhooks (
  id          bigserial PRIMARY KEY,
  vendor      text NOT NULL,
  event_id    text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendor, event_id)
);

-- ---------------------------------------------------------------------------
-- Immutable audit log  (the heart of "audit-ready at all times")
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id            bigserial PRIMARY KEY,
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  actor_id      uuid,
  actor_role    text,
  action        text NOT NULL,               -- e.g. 'prescription.transition'
  resource_type text NOT NULL,               -- e.g. 'prescription'
  resource_id   text,
  phi_accessed  boolean NOT NULL DEFAULT false,
  ip            text,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_occurred_at ON audit_log(occurred_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_log(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_phi ON audit_log(phi_accessed) WHERE phi_accessed;

-- Layer 1 (defense in depth): a trigger that refuses UPDATE/DELETE on the audit
-- log, regardless of the connecting role — even the table owner. The audit log
-- is evidence; evidence is not editable.
CREATE OR REPLACE FUNCTION audit_log_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP
    USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_audit_log_no_mutate ON audit_log;
CREATE TRIGGER trg_audit_log_no_mutate
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_is_append_only();

-- Layer 2 (least privilege): the application connects as a role that can only
-- INSERT/SELECT the audit log. Create the role if running with sufficient privs;
-- harmless to skip in environments where the role is managed externally.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rxledger_app') THEN
    CREATE ROLE rxledger_app NOLOGIN;
  END IF;
  REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM rxledger_app;
  GRANT INSERT, SELECT ON audit_log TO rxledger_app;
  GRANT USAGE, SELECT ON SEQUENCE audit_log_id_seq TO rxledger_app;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Skipping role grants (insufficient privilege in this environment)';
END;
$$;
