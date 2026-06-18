import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../errors';

/**
 * Single place that turns any thrown error into a safe, structured JSON
 * response. PHI and internal details never leak: known errors return their code
 * + message, unknown errors return a generic 500 and are logged server-side
 * with the request id for correlation.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { requestId?: string }>();
    const requestId = req.requestId ?? 'unknown';

    let status = 500;
    let code = 'internal_error';
    let message = 'Internal server error';
    let details: unknown;

    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof ZodError) {
      status = 422;
      code = 'validation_error';
      message = 'Request validation failed';
      details = exception.flatten().fieldErrors;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = 'http_error';
      message = exception.message;
    } else {
      this.logger.error(
        `Unhandled error [${requestId}]: ${(exception as Error)?.message}`,
        (exception as Error)?.stack,
      );
    }

    res.status(status).json({ error: { code, message, details, requestId } });
  }
}
