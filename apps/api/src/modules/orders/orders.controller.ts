import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { createOrderSchema, Role, type CreateOrderInput } from '@rxledger/contracts';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OrdersService } from './orders.service';
import type { AuthUser } from '../auth/auth.types';

@Controller('orders')
@UseGuards(RolesGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles(Role.PATIENT, Role.ADMIN)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOrderSchema)) body: CreateOrderInput,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.orders.create(user, body, idempotencyKey);
  }
}
