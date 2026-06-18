# Live database proof — audit immutability & PHI encryption

These two guarantees are the heart of the JD's success criteria ("zero security
incidents", "audit-ready at all times"). They are not claims in a README — they
are enforced by the database and were verified on a **real managed Postgres 17
instance** (Supabase, the RDS-equivalent). The verification ran in an isolated
schema that was dropped immediately afterward, so nothing was persisted.

The same DDL ships in [`apps/api/src/database/migrations/0001_init.sql`](../apps/api/src/database/migrations/0001_init.sql).

## 1. The audit log is append-only — enforced by the DB, not the app

A `BEFORE UPDATE OR DELETE` trigger refuses to mutate audit rows for **any**
connecting role, including the table owner. Even a compromised application
credential cannot rewrite history.

```sql
-- After inserting one audit row (id = 1):

UPDATE rxledger_demo.audit_log SET action = 'tampered' WHERE id = 1;
-- ERROR:  23000: audit_log is append-only: UPDATE is not permitted
--   CONTEXT: PL/pgSQL function audit_log_is_append_only() line 3 at RAISE

DELETE FROM rxledger_demo.audit_log WHERE id = 1;
-- ERROR:  23000: audit_log is append-only: DELETE is not permitted
--   CONTEXT: PL/pgSQL function audit_log_is_append_only() line 3 at RAISE
```

Both statements were rejected. The row was confirmed intact afterward. INSERT
and SELECT continue to work normally — the log only ever grows.

A second, independent layer (defense in depth) revokes `UPDATE/DELETE/TRUNCATE`
on the audit table from the application's database role and grants only
`INSERT, SELECT`, so the privilege to mutate the log does not even exist on the
connection the app uses.

## 2. PHI is stored as ciphertext, never plaintext

PHI fields (`indication`, dosage, clinician notes, DOB, …) are encrypted by the
application's envelope-encryption layer before they touch the database. A real
ciphertext produced by `FieldCipherService` was inserted and read back:

```sql
SELECT left(indication_enc, 24) || '…(' || length(indication_enc) || ' chars)' AS stored,
       (indication_enc LIKE 'v1.%')                              AS is_encrypted_envelope,
       (indication_enc ILIKE '%BPC%' OR indication_enc ILIKE '%recovery%') AS leaks_plaintext
FROM rxledger_demo.prescriptions;
```

| stored | is_encrypted_envelope | leaks_plaintext |
| --- | --- | --- |
| `v1.L27CP0-3dtgrlibxykKPf…(200 chars)` | **true** | **false** |

The original plaintext was `Indication: soft-tissue recovery; BPC-157 250mcg BID x8wk`.
What the database holds is an opaque `v1.<wrappedDataKey>.<iv>.<tag>.<ciphertext>`
envelope. Decryption requires the KMS master key, which lives outside the
database. A database dump alone yields nothing.

## Reproduce locally

```bash
docker compose up -d db
cp .env.example .env
npm install
npm --workspace @rxledger/api run db:migrate
npm --workspace @rxledger/api run db:seed
# then: SELECT * FROM audit_log;  and try UPDATE/DELETE — both rejected.
```
