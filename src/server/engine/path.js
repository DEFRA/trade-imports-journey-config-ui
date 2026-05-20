/**
 * Path resolution helpers used by the engine's evaluators.
 *
 * Non-public surface: these helpers are not part of `protocol.md` §3 and
 * are imported only by other engine modules. Kept here so that the
 * canonical evaluator and the trace evaluator share one source of truth
 * (see `engine-design.md` §1).
 */

/**
 * Resolve a dot-path (with optional [] array markers) against a notification
 * object. Returns the value at the path, or undefined if any segment is
 * missing.
 *
 * Array paths: a segment ending with [] means "look inside each array element
 * for the remaining path". We check whether the array has at least one element
 * where the remaining path is non-empty.
 */
const resolvePath = (obj, path) => {
  // Strip leading "notification." prefix — the object IS the notification
  const stripped = path.startsWith('notification.')
    ? path.slice('notification.'.length)
    : path

  const segments = stripped.split('.')
  let current = obj

  for (let i = 0; i < segments.length; i++) {
    if (current == null) return undefined

    const seg = segments[i]

    // Handle array marker: "foo[]"
    if (seg.endsWith('[]')) {
      const key = seg.slice(0, -2)
      const arr = current[key]
      if (!Array.isArray(arr) || arr.length === 0) return undefined

      // If this is the last segment, return the array itself
      const remaining = segments.slice(i + 1)
      if (remaining.length === 0) return arr

      // Check if at least one array element has a non-empty value at the
      // remaining path
      const remainingPath = remaining.join('.')
      const values = arr.map((item) => resolvePath(item, remainingPath))
      const hasValue = values.some((v) => !isEmpty(v))
      return hasValue ? values.find((v) => !isEmpty(v)) : undefined
    }

    current = current[seg]
  }

  return current
}

/**
 * Check if a value is "empty" per the spec rules:
 * - undefined, null -> empty
 * - "" -> empty
 * - [] -> empty
 * - {} (no populated fields) -> empty
 * - false is NOT empty (boolean false is a valid value)
 */
const isEmpty = (value) => {
  if (value === undefined || value === null) return true
  if (typeof value === 'string') return value === ''
  if (typeof value === 'boolean') return false
  if (typeof value === 'number') return false
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') {
    return Object.keys(value).length === 0
  }
  return false
}

export { resolvePath, isEmpty }
