// Per spec section 13: SAP responses do not always expose the technical ID
// in exactly the same shape. This helper centralizes resolution and, most
// importantly, THROWS when it cannot find one - it never returns undefined
// and never lets `{ id: undefined }` reach a downstream payload.
//
// It only inspects generic response-envelope keys (id / ObjectID / objectId
// / ID) - it does not invent or guess business/custom field names.
const CANDIDATE_KEYS = ['id', 'ID', 'ObjectID', 'objectId'];

export function resolveTechnicalId(entity, { entityName = 'entity' } = {}) {
  if (!entity || typeof entity !== 'object') {
    throw new Error(`Cannot resolve technical ID for ${entityName}: response was empty or not an object.`);
  }

  for (const key of CANDIDATE_KEYS) {
    const value = entity[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value;
    }
  }

  throw new Error(
    `Cannot resolve technical ID for ${entityName}: none of [${CANDIDATE_KEYS.join(', ')}] were present on the response.`
  );
}

// Guards against ever serializing a collection containing an empty/blank
// entry (e.g. `registeredProducts: [{}]`), per spec section 13.
export function assertNonEmptyId(id, label) {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new Error(`Missing required technical ID for ${label}.`);
  }
  return id;
}
