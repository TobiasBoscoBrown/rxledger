import { Module } from '@nestjs/common';
import { PharmacyService } from './pharmacy.service';
import { PharmacyWebhookController } from './pharmacy.controller';
import { PharmacyAdapter } from './pharmacy.adapter';
import { FakePharmacyAdapter } from './adapters/fake-pharmacy.adapter';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../audit/audit.service';

@Module({
  controllers: [PharmacyWebhookController],
  providers: [
    {
      provide: PharmacyAdapter,
      useFactory: () => new FakePharmacyAdapter(process.env['PHARMACY_WEBHOOK_SECRET'] ?? 'fake-secret'),
    },
    {
      provide: PharmacyService,
      inject: [PharmacyAdapter, DatabaseService, AuditService],
      useFactory: (a: PharmacyAdapter, db: DatabaseService, audit: AuditService) =>
        new PharmacyService(a, db, audit),
    },
  ],
  exports: [PharmacyService, PharmacyAdapter],
})
export class PharmacyModule {}
