import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { CryptoModule } from './modules/crypto/crypto.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { EncountersModule } from './modules/encounters/encounters.module';
import { PrescriptionsModule } from './modules/prescriptions/prescriptions.module';
import { PharmacyModule } from './modules/pharmacy/pharmacy.module';
import { OrdersModule } from './modules/orders/orders.module';
import { HealthModule } from './modules/health/health.module';
import { RequestIdMiddleware } from './common/interceptors/request-id.middleware';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    CryptoModule,
    AuditModule,
    AuthModule,
    EncountersModule,
    PrescriptionsModule,
    PharmacyModule,
    OrdersModule,
    HealthModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
