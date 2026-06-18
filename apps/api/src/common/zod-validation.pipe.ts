import { PipeTransform } from '@nestjs/common';
import { ZodError, type ZodSchema } from 'zod';
import { ValidationError } from './errors';

/**
 * Validates and narrows request payloads against a shared Zod schema (the same
 * schemas the web client uses). Invalid input becomes a typed 422 with a
 * field-level breakdown — the contract is enforced at the boundary, so handlers
 * only ever see well-formed, fully-typed data.
 */
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    try {
      return this.schema.parse(value);
    } catch (error) {
      if (error instanceof ZodError) {
        throw new ValidationError('Request validation failed', error.flatten().fieldErrors);
      }
      throw error;
    }
  }
}
