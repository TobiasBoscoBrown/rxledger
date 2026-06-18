import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import {
  createPrescriptionSchema,
  transitionPrescriptionSchema,
  Role,
  type CreatePrescriptionInput,
  type TransitionPrescriptionInput,
} from '@rxledger/contracts';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Audited, AuditInterceptor } from '../audit/audit.interceptor';
import { PrescriptionsService } from './prescriptions.service';
import type { AuthUser } from '../auth/auth.types';

@Controller('prescriptions')
@UseGuards(RolesGuard)
@UseInterceptors(AuditInterceptor)
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Post()
  @Roles(Role.CLINICIAN, Role.ADMIN)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPrescriptionSchema)) body: CreatePrescriptionInput,
  ) {
    return this.prescriptions.create(user, body);
  }

  @Post(':id/transition')
  @Roles(Role.PATIENT, Role.CLINICIAN, Role.ADMIN)
  transition(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(transitionPrescriptionSchema)) body: TransitionPrescriptionInput,
  ) {
    return this.prescriptions.transition(id, user, body);
  }

  @Get(':id')
  @Roles(Role.PATIENT, Role.CLINICIAN, Role.ADMIN)
  @Audited({ action: 'prescription.read', resourceType: 'prescription', phi: true })
  getById(@Param('id') id: string) {
    return this.prescriptions.getById(id);
  }
}
