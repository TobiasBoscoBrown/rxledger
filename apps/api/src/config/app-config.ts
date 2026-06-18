import { z } from 'zod';

/**
 * Environment is validated once, at boot. A regulated service must never come
 * up half-configured (e.g. a missing KMS key or JWT secret), so an invalid
 * environment is a hard, immediate failure with a precise message.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be >= 32 chars'),
  JWT_ACCESS_TTL_SEC: z.coerce.number().int().positive().default(900), // 15 min
  JWT_REFRESH_TTL_SEC: z.coerce.number().int().positive().default(60 * 60 * 24 * 14), // 14 days

  /** base64-encoded 32-byte AES-256 master key for the local KMS. */
  KMS_MASTER_KEY: z.string().min(1),

  DATABASE_URL: z.string().url().optional(),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(120),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
});

export type Env = z.infer<typeof envSchema>;

export class AppConfig {
  readonly nodeEnv: Env['NODE_ENV'];
  readonly port: number;
  readonly logLevel: Env['LOG_LEVEL'];
  readonly jwtSecret: string;
  readonly jwtAccessTtlSec: number;
  readonly jwtRefreshTtlSec: number;
  readonly kmsMasterKey: string;
  readonly databaseUrl: string | undefined;
  readonly rateLimitMax: number;
  readonly rateLimitWindowMs: number;

  private constructor(env: Env) {
    this.nodeEnv = env.NODE_ENV;
    this.port = env.PORT;
    this.logLevel = env.LOG_LEVEL;
    this.jwtSecret = env.JWT_SECRET;
    this.jwtAccessTtlSec = env.JWT_ACCESS_TTL_SEC;
    this.jwtRefreshTtlSec = env.JWT_REFRESH_TTL_SEC;
    this.kmsMasterKey = env.KMS_MASTER_KEY;
    this.databaseUrl = env.DATABASE_URL;
    this.rateLimitMax = env.RATE_LIMIT_MAX;
    this.rateLimitWindowMs = env.RATE_LIMIT_WINDOW_MS;
  }

  static fromEnv(source: NodeJS.ProcessEnv = process.env): AppConfig {
    const parsed = envSchema.safeParse(source);
    if (!parsed.success) {
      const issues = parsed.error.issues
        .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
        .join('\n');
      throw new Error(`Invalid environment configuration:\n${issues}`);
    }
    return new AppConfig(parsed.data);
  }
}
