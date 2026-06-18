import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';
import { PaymentAdapter, FakePaymentAdapter } from '../payments/payment.adapter';
import { PharmacyModule } from '../pharmacy/pharmacy.module';
import { DatabaseService } from '../../database/database.service';
import { AuditService } from '../audit/audit.service';
import { PharmacyService } from '../pharmacy/pharmacy.service';

@Module({
  imports: [PharmacyModule],
  controllers: [OrdersController],
  providers: [
    { provide: PaymentAdapter, useClass: FakePaymentAdapter },
    {
      provide: OrdersService,
      inject: [DatabaseService, PaymentAdapter, PharmacyService, AuditService],
      useFactory: (
        db: DatabaseService,
        pay: PaymentAdapter,
        pharmacy: PharmacyService,
        audit: AuditService,
      ) => new OrdersService(db, pay, pharmacy, audit),
    },
  ],
})
export class OrdersModule {}
