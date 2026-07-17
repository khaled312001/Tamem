import { z } from 'zod';

/**
 * A query-string boolean.
 *
 * NOT `z.coerce.boolean()`: that is `Boolean(value)`, and `Boolean("false")` is
 * `true` — every non-empty string is truthy. So `?isAvailable=false` parsed as
 * TRUE and each "show me the disabled ones" filter quietly returned the enabled
 * ones instead. Reading the literal text is the only correct way here.
 */
export const queryBool = z
  .enum(['true', 'false', '1', '0'])
  .transform((v) => v === 'true' || v === '1');

/** Same, with a default when the param is absent. */
export const queryBoolDefault = (fallback: boolean) =>
  z
    .enum(['true', 'false', '1', '0'])
    .default(fallback ? 'true' : 'false')
    .transform((v) => v === 'true' || v === '1');
