import { z } from 'zod';

/**
 * PHI tagging for shared Zod schemas.
 *
 * CollectiveOS handles protected health information across 30 states. Every
 * field that carries PHI must be explicitly tagged so that downstream layers
 * can do the right thing automatically:
 *   - the crypto layer encrypts tagged fields at rest (pgcrypto / KMS envelope)
 *   - the audit interceptor records access to tagged fields
 *   - the custom ESLint rule (`@rxledger/phi`) fails the build if a field that
 *     *looks* like PHI is declared without this tag
 *
 * `phi()` wraps a schema and brands it at runtime; `isPhi()` and
 * `collectPhiKeys()` let the runtime read the tags back out of a schema.
 */

const PHI_BRAND = Symbol.for('rxledger.phi');

type Branded<T> = T & { [PHI_BRAND]?: true };

/** Mark a schema as carrying PHI. Returns the same schema, branded. */
export function phi<T extends z.ZodTypeAny>(schema: T): T {
  (schema as Branded<T>)[PHI_BRAND] = true;
  return schema;
}

/** True if a schema was tagged with `phi()`. */
export function isPhi(schema: z.ZodTypeAny): boolean {
  return (schema as Branded<z.ZodTypeAny>)[PHI_BRAND] === true;
}

/**
 * Given a `z.object({...})` schema, return the set of top-level keys that were
 * tagged as PHI. Used by the crypto and audit layers to act on the right
 * columns without hand-maintained allowlists drifting from the schema.
 */
export function collectPhiKeys(schema: z.ZodObject<z.ZodRawShape>): string[] {
  const shape = schema.shape;
  const keys: string[] = [];
  for (const [key, value] of Object.entries(shape)) {
    if (isPhi(unwrap(value))) keys.push(key);
  }
  return keys;
}

/** Peel optional/nullable/default wrappers to reach the branded inner schema. */
function unwrap(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  // Check the outer wrapper first so `phi(z.string()).optional()` still reads as PHI.
  if (isPhi(current)) return current;
  let inner = (current as { _def?: { innerType?: z.ZodTypeAny } })._def?.innerType;
  while (inner) {
    current = inner;
    if (isPhi(current)) return current;
    inner = (current as { _def?: { innerType?: z.ZodTypeAny } })._def?.innerType;
  }
  return current;
}
