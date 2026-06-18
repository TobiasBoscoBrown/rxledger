# JD → implementation map

Every responsibility and "technical depth" line from the CollectiveOS Senior
Backend Engineer posting, mapped to where it lives in this repo.

## Backend architecture & ownership
- **NestJS module structure** — `apps/api/src/modules/*`, one module per bounded context (auth, crypto, audit, encounters, prescriptions, orders, pharmacy, payments, health), composed in `app.module.ts`.
- **PostgreSQL data modeling at production scale** — `database/migrations/0001_init.sql`: FKs, CHECK constraints, partial indexes (`idx_audit_phi ... WHERE phi_accessed`), GIN index on `peptides[]`, composite `(patient_id, status)` for the primary access path.
- **Prescription state machine** — `modules/prescriptions/prescription.state-machine.ts` (pure, exhaustively tested) + `prescriptions.service.ts` (locks `FOR UPDATE`, checks version, writes status + event + audit in one transaction).
- **Optimistic concurrency** — `version` column + `WHERE id = $1 AND version = $3`; `StaleVersionError` (409) on conflict.
- **Query plan / indexing** — raw SQL via a thin `DatabaseService` (no ORM hiding the plan); indexes chosen per access path, documented in the migration.

## Infrastructure & DevOps
- **ECS Fargate, RDS, S3, KMS, CloudTrail, Secrets Manager, IAM** — `infra/main.tf`.
- **CloudWatch alarms with auto-rollback** — `aws_ecs_service.deployment_circuit_breaker { rollback = true }` gated by 5xx + p95-latency alarms.
- **GitHub Actions CI/CD** — `.github/workflows/ci.yml`: lint → typecheck → unit+coverage → integration (real Postgres service) → docker build.
- **On-call posture / health** — `/health` (liveness) and `/ready` (DB readiness) for ALB/ECS checks.

## Security & audit posture
- **Encryption at rest** — `modules/crypto`: envelope AES-256-GCM with per-value data keys; `KmsService` abstraction swaps Local→AWS KMS with zero call-site changes. RDS/S3 also KMS-encrypted in `infra/`.
- **Immutable audit log, INSERT-only application access** — trigger blocks UPDATE/DELETE for all roles + role grants restrict the app to INSERT/SELECT. **Verified live** → `docs/DB-PROOF.md`.
- **app-level PHI audit middleware** — `modules/audit/audit.interceptor.ts` (`@Audited({ phi: true })`), complementing CloudTrail at the infra level.
- **ESLint PHI tag enforcement** — `packages/eslint-plugin-phi/rules/require-phi-tag.js`; an untagged PHI field fails CI.
- **IAM least-privilege** — separate task vs. execution roles in `infra/main.tf`.
- **Threat modeling / breach posture** — uniform login timing (no user enumeration), refresh-token reuse detection (stolen-token containment), tokenized cards only (no PAN → out of PCI scope), HMAC-verified webhooks.

## Integrations & data flow
- **Vendor adapter interfaces before implementations** — `PharmacyAdapter` / `PaymentAdapter` abstract classes; concrete fakes in `adapters/`. Swapping a vendor is one module.
- **Webhook idempotency** — `processed_webhooks (vendor, event_id)` unique + `ON CONFLICT DO NOTHING`; duplicate deliveries are no-ops.
- **Retry & backoff** — `common/util/retry.ts` (full-jitter exponential backoff, retry predicate).
- **Circuit breakers** — `common/util/circuit-breaker.ts`, one per vendor in `PharmacyService`.
- **Tokenized card capture / CIT semantics** — `PaymentAdapter.charge` takes a `paymentMethodToken` + idempotency key; never a PAN.

## API integration & testing infrastructure
- **Shared schemas keep both sides honest** — `packages/contracts` is imported by the API today and by the web client tomorrow; validation at the boundary via `ZodValidationPipe`.
- **Jest 80/80/80** — enforced in `jest.config.cjs` over the domain/security logic.
- **Unit / smoke / integration layers** — `*.spec.ts` (unit), `test/app.e2e-spec.ts` (boot smoke), `*.e2e-spec.ts` (integration vs. real Postgres in CI).
- **Regression-ready** — typed errors + deterministic fakes make new regressions easy to pin with a test.

## AI infrastructure & developer leverage
- **Machine-readable approval gate** — the CI `quality` job (lint incl. PHI rule + typecheck + coverage) is the gate an adversarial AI reviewer attaches its verdict to; `adversarial-review` job is the wiring point.
- **Custom ESLint guardrails** — the PHI rule is exactly this: encoding a domain safety invariant as an automated check so AI-generated (or human) code can't quietly violate it.

## On the horizon (mobile)
- The API is the contract layer a native app will consume: stateless JWT access + rotating refresh tokens already support multiple clients; shared Zod contracts give the app type-safe payloads on day one.
