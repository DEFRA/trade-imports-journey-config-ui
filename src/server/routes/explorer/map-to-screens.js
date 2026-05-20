/**
 * Compatibility shim for the engine refactor (story 06).
 *
 * The canonical implementations live at:
 *   - `engine/resolve-screens.js` (protocol §5.3, exports `resolveScreens`)
 *   - `engine/roll-up-to-sections.js` (protocol §5.4, exports `rollUpToSections`)
 *
 * This shim preserves the legacy `mapToScreens` name for explorer
 * controllers and existing tests until story 07 switches every caller
 * to import from the engine modules directly.
 */
export { resolveScreens as mapToScreens } from '#server/engine/resolve-screens.js'
export { rollUpToSections } from '#server/engine/roll-up-to-sections.js'