import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/decorators/auth.decorators';
import { DatabaseService } from '../../database/database.service';

@Controller()
export class HealthController {
  constructor(private readonly db: DatabaseService) {}

  /** Liveness: process is up. */
  @Public()
  @Get('health')
  health() {
    return { status: 'ok', uptimeSec: Math.round(process.uptime()) };
  }

  /** Readiness: dependencies (DB) are reachable. Used by ECS/ALB health checks. */
  @Public()
  @Get('ready')
  async ready() {
    const dbOk = await this.db.healthCheck();
    if (!dbOk) throw new ServiceUnavailableException({ status: 'degraded', db: false });
    return { status: 'ready', db: true };
  }
}
