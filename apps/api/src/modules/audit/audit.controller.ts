import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Role } from '@rxledger/contracts';
import { Roles } from '../../common/decorators/auth.decorators';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AuditService } from './audit.service';

/** Read-only access to the audit trail. Admin-only — the trail is evidence. */
@Controller('audit')
@UseGuards(RolesGuard)
@Roles(Role.ADMIN)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get(':resourceType/:resourceId')
  async forResource(
    @Param('resourceType') resourceType: string,
    @Param('resourceId') resourceId: string,
    @Query('limit') limit?: string,
  ) {
    const rows = await this.audit.listForResource(
      resourceType,
      resourceId,
      limit ? Math.min(Number(limit), 500) : 100,
    );
    return { items: rows };
  }
}
