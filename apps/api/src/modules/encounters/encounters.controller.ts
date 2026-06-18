import { Body, Controller, Get, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { createEncounterSchema, Role, type CreateEncounterInput } from '@rxledger/contracts';
import { ZodValidationPipe } from '../../common/zod-validation.pipe';
import { CurrentUser, Roles } from '../../common/decorators/auth.decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Audited, AuditInterceptor } from '../audit/audit.interceptor';
import { EncountersService } from './encounters.service';
import type { AuthUser } from '../auth/auth.types';

@Controller('encounters')
@UseGuards(RolesGuard)
@UseInterceptors(AuditInterceptor)
export class EncountersController {
  constructor(private readonly encounters: EncountersService) {}

  @Post()
  @Roles(Role.CLINICIAN, Role.ADMIN)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createEncounterSchema)) body: CreateEncounterInput,
  ) {
    return this.encounters.create(user.id, body);
  }

  @Get(':id')
  @Roles(Role.CLINICIAN, Role.ADMIN)
  @Audited({ action: 'encounter.read', resourceType: 'encounter', phi: true })
  getById(@Param('id') id: string) {
    return this.encounters.getById(id);
  }
}
