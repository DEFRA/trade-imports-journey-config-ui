/**
 * Section rollup.
 *
 * Public engine surface — owns the protocol.md §5.4 contract:
 *
 *   rollUpToSections(screens) → Section[]
 *
 * Groups screens by section in first-appearance order, filters
 * notApplicable screens out of each section, omits whole-notApplicable
 * sections entirely, and derives a SectionStatus from the remaining
 * screens. SectionStatus is a 3-value enum (no notApplicable) per §5.4.
 */
import { SCREEN_STATUS, SECTION_STATUS } from './types.js'

/**
 * @param {import('./types.js').Screen[]} screens
 * @returns {import('./types.js').Section[]}
 */
export const rollUpToSections = (screens) => {
  if (!Array.isArray(screens)) {
    throw new Error('rollUpToSections: screens must be an array')
  }

  const sectionMap = new Map()

  for (const screen of screens) {
    const { sectionId } = screen
    if (!sectionMap.has(sectionId)) {
      if (!screen.sectionName) {
        throw new Error(
          `rollUpToSections: screen "${screen.screenId}" has sectionId "${sectionId}" but missing sectionName.`
        )
      }
      sectionMap.set(sectionId, {
        sectionId,
        sectionName: screen.sectionName,
        screens: []
      })
    }
    if (screen.status !== SCREEN_STATUS.NOT_APPLICABLE) {
      sectionMap.get(sectionId).screens.push(screen)
    }
  }

  return [...sectionMap.values()]
    .filter((section) => section.screens.length > 0)
    .map((section) => ({
      sectionId: section.sectionId,
      sectionName: section.sectionName,
      status: deriveSectionStatus(section.screens),
      screens: section.screens
    }))
}

/**
 * §5.4 section-status derivation — top-down, first match wins.
 * SectionStatus excludes notApplicable; callers filter those screens
 * out before calling this.
 */
const deriveSectionStatus = (screens) => {
  if (screens.some((s) => s.status === SCREEN_STATUS.INCOMPLETE)) {
    return SECTION_STATUS.INCOMPLETE
  }
  if (screens.some((s) => s.status === SCREEN_STATUS.CANNOT_START_YET)) {
    return SECTION_STATUS.CANNOT_START_YET
  }
  return SECTION_STATUS.COMPLETE
}
