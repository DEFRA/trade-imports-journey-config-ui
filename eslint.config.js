import neostandard from 'neostandard'

export default [
  ...neostandard({
    env: ['node', 'vitest'],
    ignores: [...neostandard.resolveIgnoresFromGitignore()],
    noJsx: true,
    noStyle: true
  }),
  // Lift-out invariant: UI route handlers must consume the engine over
  // HTTP, not in-process. The rule catches direct imports; property
  // access on `request.server.app.evaluationEngine` is governed by
  // code review + the grep pre-check documented in
  // features/http-api/05b-switch-controller-and-enforce-lift-out.md.
  {
    files: ['src/server/routes/**/*.js'],
    ignores: ['src/server/routes/**/*.test.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          // Pattern-based blocking via globs would be preferable, but
          // minimatch treats a leading `#` as a comment marker so
          // `#server/engine/*` silently matches nothing. We enumerate
          // the engine + plugin modules explicitly instead. New engine
          // modules need adding here — the engine module list is
          // small, stable, and the engine isolation test pins what
          // lives under #server/engine/.
          paths: [
            '#server/engine/combinators.js',
            '#server/engine/evaluate-with-trace.js',
            '#server/engine/evaluate.js',
            '#server/engine/path.js',
            '#server/engine/resolve-screens.js',
            '#server/engine/roll-up-to-sections.js',
            '#server/engine/types.js',
            '#server/plugins/evaluation-engine/plugin.js'
          ].map((name) => ({
            name,
            message:
              'UI route handlers must consume the engine over HTTP, not in-process. See features/http-api/design.md.'
          }))
        }
      ]
    }
  },
  // Deliberate carve-out for nav-context.js — Story 06 closes this
  // last gap (currentJourneyKey validation + listJourneys fallback)
  // and removes this block.
  {
    files: ['src/server/routes/explorer/nav-context.js'],
    rules: { 'no-restricted-imports': 'off' }
  }
]
