import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { tap } from 'rxjs';
import { AuditService } from './audit.service';
import type { AuthUser } from '../auth/auth.types';

export interface AuditMeta {
  action: string;
  resourceType: string;
  /** Whether reaching this handler constitutes PHI access. */
  phi?: boolean;
  /** Route param to record as the resource id (default: 'id'). */
  idParam?: string;
}

export const AUDIT_KEY = 'audit';
/** Declare that a route must be audited. The interceptor writes the row on success. */
export const Audited = (meta: AuditMeta): MethodDecorator => SetMetadata(AUDIT_KEY, meta);

/**
 * App-level audit middleware. For any handler annotated with @Audited(), it
 * appends an audit row after the handler succeeds, attributing the action to
 * the authenticated principal and the request id. This is the application-layer
 * complement to CloudTrail (which covers infra-level access).
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler) {
    const meta = this.reflector.get<AuditMeta | undefined>(AUDIT_KEY, context.getHandler());
    if (!meta) return next.handle();

    const req = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser; requestId?: string }>();
    const idParam = meta.idParam ?? 'id';

    return next.handle().pipe(
      tap(() => {
        void this.audit.record({
          actorId: req.user?.id ?? null,
          actorRole: req.user?.role ?? null,
          action: meta.action,
          resourceType: meta.resourceType,
          resourceId: (req.params?.[idParam] as string) ?? null,
          phiAccessed: meta.phi ?? false,
          ip: req.ip ?? null,
          metadata: { requestId: req.requestId, method: req.method, path: req.path },
        });
      }),
    );
  }
}
