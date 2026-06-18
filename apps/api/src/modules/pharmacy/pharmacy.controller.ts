import { Controller, Headers, HttpCode, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../common/decorators/auth.decorators';
import { ValidationError } from '../../common/errors';
import { PharmacyService } from './pharmacy.service';

/**
 * Inbound pharmacy webhooks. Authenticated by HMAC signature (not a JWT), so
 * the route is @Public to the auth guard but verified by the adapter. The raw
 * request body is captured in main.ts so the signature is checked against the
 * exact bytes the vendor signed.
 */
@Controller('webhooks/pharmacy')
export class PharmacyWebhookController {
  constructor(private readonly pharmacy: PharmacyService) {}

  @Public()
  @Post()
  @HttpCode(200)
  async receive(
    @Req() req: Request & { rawBody?: string },
    @Headers('x-pharmacy-signature') signature?: string,
  ) {
    if (!signature) throw new ValidationError('Missing x-pharmacy-signature header');
    const rawBody = req.rawBody ?? JSON.stringify(req.body);
    const result = await this.pharmacy.handleWebhook(rawBody, signature);
    return { received: true, applied: result.applied };
  }
}
