import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';
import { ValidationError } from './errors';

const schema = z.object({ email: z.string().email(), age: z.number().int().positive() });

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns parsed, typed data for valid input', () => {
    expect(pipe.transform({ email: 'a@b.com', age: 30 })).toEqual({ email: 'a@b.com', age: 30 });
  });

  it('throws a typed 422 ValidationError with field details', () => {
    try {
      pipe.transform({ email: 'nope', age: -1 });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      const ve = err as ValidationError;
      expect(ve.status).toBe(422);
      expect(ve.details).toHaveProperty('email');
      expect(ve.details).toHaveProperty('age');
    }
  });
});
