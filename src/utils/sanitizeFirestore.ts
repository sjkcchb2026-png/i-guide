/**
 * deepSanitizeFirestore
 * Recursively removes or converts `undefined` values to `null` to prevent Firestore
 * "Cannot use undefined as a Firestore value" errors.
 */
export function deepSanitizeFirestore<T = any>(val: T): T {
  if (val === undefined) {
    return null as any;
  }
  if (val === null || typeof val !== 'object') {
    return val;
  }
  // Preserve Date and Firestore FieldValue / Timestamp instances
  if (
    val instanceof Date ||
    (val as any).constructor?.name === 'FieldValue' ||
    (val as any)._methodName ||
    (val as any).nanoseconds !== undefined
  ) {
    return val;
  }
  if (Array.isArray(val)) {
    return val.map(item => deepSanitizeFirestore(item)) as any;
  }
  const result: Record<string, any> = {};
  for (const [k, v] of Object.entries(val)) {
    if (v === undefined) {
      result[k] = null;
    } else {
      result[k] = deepSanitizeFirestore(v);
    }
  }
  return result as any;
}
