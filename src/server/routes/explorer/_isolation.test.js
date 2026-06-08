/**
 * Lift-out invariant test for the explorer routes.
 *
 * After Story 06 no file under `src/server/routes/` may import from
 * `#server/engine/*` or `#server/plugins/evaluation-engine/*`. The UI
 * codebase is portable: it could be lifted to a separate deployment
 * pointed at a different host via `apiBaseUrl` and would render
 * identically. This test fails the build if a future PR re-introduces
 * an in-process engine import anywhere under the routes tree.
 *
 * Mechanism: every non-test `.js` file under `src/server/routes/` is
 * scanned for ESM `import` / `export ... from` / `import(...)` source
 * specifiers; any specifier starting with `#server/engine/` or
 * `#server/plugins/evaluation-engine/` triggers a failure.
 *
 * Per-file scanning (rather than transitive closure walking) is
 * sufficient: engine modules are kept Hapi-free by
 * `src/server/engine/_isolation.test.js`, so no transitive vector
 * threads back through engine modules in ways grep wouldn't catch.
 * The closure of any controller is bounded by its direct imports +
 * the engine isolation guarantee, which together cover the property
 * the lift-out invariant requires.
 *
 * Test files (`*.test.js`) are exempt: tests legitimately reach
 * across boundaries to verify them.
 *
 * Limitation: the scanner uses regex on raw source after stripping
 * comments. A string literal containing engine import-looking text
 * could in theory produce a false positive, and a path embedded
 * inside a nested block-comment could survive comment-stripping.
 * Neither appears in this codebase; if it ever does, the failure
 * message points at the file and the human reviewer adjudicates.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROUTES_DIR = dirname(fileURLToPath(import.meta.url)).replace(
  /\/explorer$/,
  ''
)

const collectSourceFiles = (dir) => {
  const entries = readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(full)
    if (!entry.name.endsWith('.js')) return []
    if (entry.name.endsWith('.test.js')) return []
    return [full]
  })
}

const sourceFiles = collectSourceFiles(ROUTES_DIR)

// Strip line and block comments so commented-out imports don't trip
// the regex.
const stripComments = (source) =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

const extractImportSpecifiers = (source) => {
  const code = stripComments(source)
  const patterns = [
    /\bimport\s+(?:[^'"`;]*?\bfrom\s+)?['"]([^'"]+)['"]/g,
    /\bexport\s+(?:[^'"`;]*?\bfrom\s+)?['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g
  ]
  return patterns.flatMap((re) => [...code.matchAll(re)].map((m) => m[1]))
}

const isEngineImport = (specifier) =>
  specifier.startsWith('#server/engine/') ||
  specifier.startsWith('#server/plugins/evaluation-engine/')

describe('explorer routes lift-out invariant', () => {
  it('scans every non-test routes source file', () => {
    expect(sourceFiles.length).toBeGreaterThan(0)
  })

  it.each(sourceFiles)(
    '%s does not import #server/engine/* or #server/plugins/evaluation-engine/*',
    (file) => {
      const source = readFileSync(file, 'utf-8')
      const engineImports = extractImportSpecifiers(source).filter(
        isEngineImport
      )
      expect(engineImports).toEqual([])
    }
  )
})
