# RxLedger — a regulated prescription backbone

A working slice of the backend a regulated D2C health platform actually needs,
built in the exact stack from the **CollectiveOS Senior Backend Engineer** role:
NestJS modular monolith · TypeScript · PostgreSQL · shared Zod schemas in a
Turborepo · AWS-ready (ECS Fargate / RDS / KMS / S3 / CloudTrail).

It models the clinical core of "the Thrive Market for peptides": a patient is
seen in a **clinician encounter**, a **prescription** moves through a guarded
state machine, an **order** captures payment idempotently and submits to a
**pharmacy** vendor over resilient plumbing — and **every step is audited into a
log the database itself will not let anyone edit.**

> Built as a focused demo for the CollectiveOS application. It implements the
> hard, security-critical parts end-to-end rather than a broad shallow CRUD app.

## Why these pieces

The JD says success looks like *zero security incidents* and *audit-ready at all
times*. So the demo leads with the things that make that true:

| JD requirement | In this repo |
| --- | --- |
| Self-built auth: bcrypt + JWT **refresh rotation** + TOTP MFA + RBAC | `modules/auth/*` |
| Immutable audit log, **INSERT-only application access** | `database/migrations/0001_init.sql`, `modules/audit/*` |
| PHI encrypted at rest (KMS-backed) | `modules/crypto/*` (envelope AES-256-GCM, KMS-swappable) |
| Prescription **state machine**, optimistic locking, PostgreSQL data modeling | `modules/prescriptions/*` |
| Vendor adapters: webhook **idempotency**, retry/backoff, **circuit breakers** | `modules/pharmacy/*`, `common/util/*` |
| Shared Zod schemas across web + API | `packages/contracts` |
| **PHI-tagged fields enforced by an ESLint rule** | `packages/eslint-plugin-phi` |
| Jest **80/80/80** coverage gate, integration + smoke layers | `apps/api/jest.config.cjs`, `*.spec.ts`, `*.e2e-spec.ts` |
| CI/CD with auto-rollback, IaC | `.github/workflows/ci.yml`, `apps/api/Dockerfile`, `infra/main.tf` |

See **[docs/JD-MAPPING.md](docs/JD-MAPPING.md)** for the line-by-line mapping and
**[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for the design rationale.

## Proof, not promises

The two load-bearing guarantees were verified on a **real managed Postgres**:
audit `UPDATE`/`DELETE` are rejected by the database, and PHI is stored only as
ciphertext. Full transcript: **[docs/DB-PROOF.md](docs/DB-PROOF.md)**.

```
✓ 46 unit tests (domain + security logic)      80/80/80 coverage gate: PASS
✓  6 contract tests (shared Zod / state table)
✓  3 e2e smoke tests (full app boots, guards + validation live)
✓  PHI ESLint rule: passes clean code, fails an untagged PHI field
✓  tsc --strict: clean    eslint: clean
```

## Quickstart

```bash
npm install
docker compose up -d db                      # local Postgres
cp .env.example .env                          # set JWT_SECRET + KMS_MASTER_KEY
npm --workspace @rxledger/api run db:migrate  # apply schema + audit trigger
npm --workspace @rxledger/api run db:seed     # demo users + encrypted records
npm run dev                                   # http://localhost:8787/health
```

Tests:

```bash
npm test                                      # all workspaces
npm --workspace @rxledger/api run test:cov    # unit + coverage gate
npm --workspace @rxledger/api run test:integration   # needs DATABASE_URL
```

## API surface (selected)

```
POST /auth/register | /auth/login | /auth/refresh | /auth/logout
POST /auth/mfa/enroll | /auth/mfa/confirm
POST /encounters            (clinician/admin)        GET /encounters/:id      [audited, PHI]
POST /prescriptions         (clinician/admin)        GET /prescriptions/:id   [audited, PHI]
POST /prescriptions/:id/transition                   — guarded state machine + optimistic lock
POST /orders                (patient/admin)          — idempotent (Idempotency-Key header)
POST /webhooks/pharmacy     (HMAC-signed, idempotent)
GET  /audit/:type/:id       (admin)                  GET /health  GET /ready
```

## Layout

```
apps/api/                NestJS modular monolith
  src/modules/           auth · crypto · audit · encounters · prescriptions · orders · pharmacy · payments · health
  src/common/            zod pipe · exception filter · request id · RBAC decorators · retry · circuit breaker
  src/database/          pg layer · migrations (incl. immutable audit log) · migrate + seed runners
packages/contracts/      shared Zod schemas + PHI tagging + prescription transition table
packages/eslint-plugin-phi/   the custom PHI guardrail (with RuleTester tests)
infra/                   Terraform: ECS Fargate (auto-rollback) · RDS+KMS · Redis · S3 · CloudTrail
```

## Notes on scope

A live AWS deployment is expressed as IaC (`infra/`) + a production Dockerfile
rather than stood up in someone else's account. The database-level guarantees —
the part that's easy to *claim* and hard to *prove* — were executed against real
managed Postgres and captured in `docs/DB-PROOF.md`.
