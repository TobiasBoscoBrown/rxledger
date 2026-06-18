import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../../common/decorators/auth.decorators';
import { UnauthorizedError } from '../../../common/errors';
import { TokenService } from '../token.service';
import type { AuthUser } from '../auth.types';

/** Authenticates requests via Bearer JWT and attaches `request.user`. Routes
 *  flagged @Public() are allowed through unauthenticated. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly tokens: TokenService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedError('Missing Bearer token');
    }
    try {
      const claims = this.tokens.verifyAccessToken(header.slice('Bearer '.length));
      req.user = { id: claims.sub, role: claims.role };
      return true;
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  }
}
