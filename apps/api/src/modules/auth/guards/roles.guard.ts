import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Role } from '@rxledger/contracts';
import { ROLES_KEY } from '../../../common/decorators/auth.decorators';
import { ForbiddenError } from '../../../common/errors';
import type { AuthUser } from '../auth.types';

/** Enforces @Roles(...) declared on a handler/controller. Runs after the JWT
 *  guard, so `request.user` is present. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenError();
    }
    return true;
  }
}
