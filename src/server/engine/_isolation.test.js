/**
 * Framework-isolation test for the engine.
 *
 * The engine is a framework-agnostic library — its public modules and
 * their non-public helper (`path.js`) must not import any Hapi package.
 * If a future PR adds `import x from '@hapi/...'` anywhere under
 * `src/server/engine/`, this test fails: the boundary becomes
 * machine-enforced.
 *
 * Mechanism: every non-test `.js` file under the engine directory is
 * scanned for ESM `import` / `export ... from` source specifiers; any
 * specifier whose package name is `@hapi/...` or exactly `@hapi`
 * triggers a failure. Direct-file scanning is sufficient because the
 * engine is self-contained — every engine module imports only from
 * other engine modules or from Node stdlib (`node:*`), so a transitive
 * Hapi import would have to land in one of the engine files itself.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ENGINE_DIR = dirname(fileURLToPath(import.meta.url))

const sourceFiles = readdirSync(ENGINE_DIR).filter(
  (file) => file.endsWith('.js') && !file.endsWith('.test.js')
)

// Strip line and block comments so a commented-out import inside an
// engine file doesn't trigger a false-positive failure.
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/**
 * Extract every module specifier appearing in `import` / `import(...)` /
 * `export ... from` clauses in an ESM source. Returns the raw specifier
 * strings.
 */
const extractImportSpecifiers = (source) => {
  const code = stripComments(source)
  const patterns = [
    /\bimport\s+(?:[^'"`;]*?\bfrom\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:[^'"`;]*?\bfrom\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ]
  return patterns.flatMap((re) => [...code.matchAll(re)].map((m) => m[1]))
}

const isHapiPackage = (specifier) =>
  specifier === '@hapi' || specifier.startsWith('@hapi/')

describe('engine framework isolation', () => {
  it('scans every non-test engine source file', () => {
    expect(sourceFiles.length).toBeGreaterThan(0)
  })

  it.each(sourceFiles)('%s does not import any @hapi/* package', (file) => {
    const source = readFileSync(join(ENGINE_DIR, file), 'utf-8')
    const hapiImports = extractImportSpecifiers(source).filter(isHapiPackage)
    expect(hapiImports).toEqual([])
  })
})
