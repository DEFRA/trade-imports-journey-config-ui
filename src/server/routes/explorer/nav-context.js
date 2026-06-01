/**
 * Shared view-context fragment for the explorer nav partial
 * (`partials/explorer-nav.njk`).
 *
 * The partial reads `journeyKey` (display) and `showCommodityConfig` (link
 * visibility). Every view controller that renders an explorer page needs
 * to supply both — this helper keeps the journey-specific gating logic in
 * one place so Story 02 can flip the gate by changing a single line.
 *
 * @param {string} journeyKey - The configured journey identifier
 * @returns {{ journeyKey: string, showCommodityConfig: boolean }}
 */
export const navContext = (journeyKey) => ({
  journeyKey,
  showCommodityConfig: journeyKey === 'eu-live-animals'
})
