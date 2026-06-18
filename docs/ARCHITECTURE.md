# Architecture & decisions

A short tour of the choices that matter, and why — the kind of reasoning the
role expects its "named architect" to be able to defend under scrutiny.

## Shape: modular monolith
One deployable, hard module boundaries. At a 12-person company shipping web
first, a monolith is the right call: one thing to deploy, debug, and secure,
with module seams (`modules/*`) clean enough to extract a service later if a
real scaling reason appears. Matches the JD's stated architecture.

## Persistence: raw SQL over a thin `DatabaseService`, no ORM
In a regulated system the query plan and the index strategy are first-class.
An ORM hides exactly what you most need to reason about under load and under
audit. The data layer is a ~60-line wrapper exposing `query`, `queryOne`, and
`withTransaction`. Transactions bind the acting user to a Postgres session
variable (`app.actor_id`) so writes are attributable. Migrations are plain SQL,
applied by a small idempotent runner — no migration framework to fight.

## Security invariants, each enforced where it can't be bypassed
- **Audit is evidence, so the database refuses to mutate it.** A trigger blocks
  UPDATE/DELETE for every role; a restricted app role can only INSERT/SELECT.
  App bugs and stolen app credentials both fail to rewrite history.
- **PHI is encrypted before it reaches the DB.** Envelope encryption: a per-value
  data key encrypts the field; the KMS master key wraps the data key. A DB dump
  is inert without KMS. `KmsService` is an interface — `LocalKmsService` for
  dev/test, AWS KMS in prod, identical envelope contract.
- **The PHI tag is the single source of truth.** `phi()` marks a field; the
  crypto and audit layers read the tag; the ESLint rule fails the build if a
  PHI-looking field is declared untagged. Untagged PHI literally cannot ship.
- **Auth is stateless where it can be, stateful where it must be.** Access
  tokens are short-lived JWTs (no DB hit on every request). Refresh tokens are
  opaque, stored only as a SHA-256 hash, and **rotate on every use**; replaying a
  spent token is treated as theft and revokes the whole token family.

## Concurrency: optimistic locking on the state machine
Two clinicians can open the same prescription. The transition checks an expected
`version` and updates `WHERE version = $expected` inside a `FOR UPDATE`
transaction; the loser gets a clean 409, not a silent overwrite. The transition
table itself is pure data shared with the web client, so neither side can invent
an illegal move.

## Integrations: assume every vendor is hostile and flaky
Each external dependency sits behind an adapter interface, wrapped in bounded
retry (full-jitter backoff) and a per-vendor circuit breaker so one bad vendor
fails fast instead of exhausting workers. Inbound webhooks are HMAC-verified and
de-duplicated on `(vendor, event_id)`, so retried deliveries are safe no-ops.
Money movement and fulfillment are idempotent on a client-supplied key.

## Testing strategy: prove the dangerous parts
The 80/80/80 gate is enforced over the framework-agnostic domain and security
logic — the code that must be correct (crypto, TOTP, token rotation, the state
machine, retry, circuit breaker). DB-bound services are covered by an
integration suite against real Postgres in CI, and a boot smoke test proves the
whole DI graph wires up and the global auth guard is active. Pure logic is
isolated from I/O specifically so it can be tested exhaustively and fast.

## Failure modes considered
- Stolen refresh token → reuse detection revokes the family.
- DB dump leaked → PHI is ciphertext; keys are elsewhere.
- Compromised app credential → cannot edit/delete audit rows.
- Vendor outage → circuit opens, requests fail fast, webhook reconciles later.
- Bad deploy → CloudWatch alarms trip ECS deployment circuit breaker → auto-rollback.
- Misconfiguration → env validated by Zod at boot; the process refuses to start.
