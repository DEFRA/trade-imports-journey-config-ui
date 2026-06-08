import camelCase from 'lodash/camelCase.js'

const isPlainObject = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/**
 * Deep, immutable transform: every object key is camelCased; arrays
 * preserve order and length; primitives (including null and undefined)
 * pass through unchanged. Used by per-journey commodityDetail to align
 * refdata's snake_case storage with the camelCase API surface (D18).
 */
export const mapKeysDeep = (value) => {
  if (Array.isArray(value)) return value.map(mapKeysDeep)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([key, val]) => [camelCase(key), mapKeysDeep(val)])
  )
}
