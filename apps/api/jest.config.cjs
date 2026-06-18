/** Jest config for the RxLedger API.
 *
 * One runner, two layers selected by filename:
 *   *.spec.ts      -> fast unit tests (no I/O), run everywhere
 *   *.e2e-spec.ts  -> integration tests; self-skip unless DATABASE_URL is set
 *                     (CI provides a Postgres service container).
 *
 * Coverage gate is 80/80/80 per the CollectiveOS spec, collected over the
 * domain/security logic (DI wiring, DTOs and entrypoints are excluded — they
 * are exercised by integration, not unit-counted).
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'js', 'json'],
  testMatch: ['<rootDir>/src/**/*.spec.ts', '<rootDir>/test/**/*.e2e-spec.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json', isolatedModules: true }],
  },
  moduleNameMapper: {
    '^@rxledger/contracts$': '<rootDir>/../../packages/contracts/src/index.ts',
  },
  // The 80/80/80 gate is enforced over the framework-agnostic domain & security
  // logic — the parts that must be provably correct. The DB-bound services and
  // HTTP layer are exercised by the integration suite (*.e2e-spec.ts), which
  // runs against a real Postgres in CI.
  collectCoverageFrom: [
    'src/common/util/**/*.ts',
    'src/common/zod-validation.pipe.ts',
    'src/config/app-config.ts',
    'src/modules/crypto/kms.service.ts',
    'src/modules/crypto/field-cipher.service.ts',
    'src/modules/auth/totp.service.ts',
    'src/modules/auth/token.service.ts',
    'src/modules/auth/password.service.ts',
    'src/modules/auth/refresh-token.service.ts',
    'src/modules/auth/refresh-token.store.ts',
    'src/modules/prescriptions/prescription.state-machine.ts',
  ],
  coverageDirectory: 'coverage',
  coverageThreshold: {
    global: { branches: 80, functions: 80, lines: 80, statements: 80 },
  },
};
