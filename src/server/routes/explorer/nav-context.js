/**
 * Shared view-context fragment for the explorer nav partial
 * (`partials/explorer-nav.njk`).
 *
 * The partial reads `journeyKey` for the "Journey: <key>" indicator.
 * Every view controller that renders an explorer page passes through
 * here so the gating literal would live in one place if we ever
 * re-introduced a per-journey nav gate.
 *
 * Story 02 made commodity-config journey-agnostic, so the
 * `showCommodityConfig` flag the previous Story 01 carried has been
 * retired. The helper stays so controllers keep a single threading
 * call.
 *
 * @param {string} journeyKey - The configured journey identifier
 * @returns {{ journeyKey: string }}
 */
export const navContext = (journeyKey) => ({
  journeyKey
})
