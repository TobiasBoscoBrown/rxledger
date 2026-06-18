import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';

/**
 * Boot smoke test: stands up the entire NestJS DI graph (every module, guard,
 * interceptor and provider) and exercises the public surface that does not
 * require a database. Proves the application actually wires together and that
 * the global auth guard protects routes by default.
 *
 * The database-backed flows (auth, prescription transitions, webhook
 * idempotency) live in the integration suite that runs against a real Postgres
 * service in CI; this file always runs, even with no DATABASE_URL.
 */
describe('App (e2e smoke)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env['JWT_SECRET'] = 'test-secret-test-secret-test-secret-1234';
    process.env['KMS_MASTER_KEY'] = Buffer.alloc(32, 9).toString('base64');
    process.env['NODE_ENV'] = 'test';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('GET /health is public and returns ok', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('protected routes reject anonymous access (global JWT guard)', async () => {
    const res = await request(app.getHttpServer()).post('/encounters').send({}).expect(401);
    expect(res.body.error.code).toBe('unauthorized');
  });

  it('login validates its body via the shared Zod schema (422)', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'not-an-email' })
      .expect(422);
    expect(res.body.error.code).toBe('validation_error');
  });
});
