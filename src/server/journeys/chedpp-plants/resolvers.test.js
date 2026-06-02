/**
 * Resolver unit tests for the corrected GMS-declaration predicate.
 *
 * Each cell of the authority × marketing-standard variance gets a case,
 * using the ACTUAL chosen species from the committed refdata (not a
 * hand-rolled minimal fixture). A refdata regeneration that drops or
 * re-classifies any of these species fails this test as well as the
 * scenario parity pins — refdata drift is caught at unit level too.
 *
 * Verified predicate (gms-declaration-rule-investigation.md §1):
 *   active iff species.regulatory_authority === 'HMI'
 *        AND species.marketing_standard === 'GMS'.
 */
import { describe, test, expect } from 'vitest'
import { tests as conditions } from './resolvers.js'
import { refdata } from './index.js'

const commodity = (id, eppoCode) => ({ id, species: { eppoCode } })

// The same species the scenarios use for each variance cell (and apples /
// peppers for the long-standing JOINT+SMS pin). Co-located here so a
// future refdata picker is forced to update both places coherently.
const CELLS = [
  {
    label: 'HMI + GMS (canonical positive case)',
    commodity: commodity('0805108010', 'CIDAU'),
    expectedActive: true,
    expectedAuthority: 'HMI',
    expectedStandard: 'GMS'
  },
  {
    label: 'HMI + SMS (Specific Marketing Standard — GMS page does not fire)',
    commodity: commodity('08059000', 'CIDAL'),
    expectedActive: false,
    expectedAuthority: 'HMI',
    expectedStandard: 'SMS'
  },
  {
    label: 'JOINT + GMS (JOINT routing — GMS page does not fire)',
    commodity: commodity('0709999090', 'DATME'),
    expectedActive: false,
    expectedAuthority: 'JOINT',
    expectedStandard: 'GMS'
  },
  {
    label: 'JOINT + SMS (apples MABSD — GMS page does not fire)',
    commodity: commodity('0808108090', 'MABSD'),
    expectedActive: false,
    expectedAuthority: 'JOINT',
    expectedStandard: 'SMS'
  },
  {
    label: 'PHSI-only (no species row — GMS page does not fire)',
    commodity: commodity('06042090', 'RSVSS'),
    expectedActive: false,
    expectedAuthority: null,
    expectedStandard: null
  }
]

describe('requiresGmsDeclaration — variance coverage', () => {
  test.each(CELLS)(
    '$label',
    ({ commodity: c, expectedActive, expectedAuthority, expectedStandard }) => {
      // Sanity: the refdata still classifies the species the way the
      // scenario expects. If this fails, a regeneration changed the
      // underlying data and the scenario picker needs updating.
      const key = `${c.id}|${c.species.eppoCode}`
      const sp = refdata.species[key]
      expect(sp?.regulatory_authority ?? null).toBe(expectedAuthority)
      expect(sp?.marketing_standard ?? null).toBe(expectedStandard)

      const { active } = conditions.requiresGmsDeclaration(c, refdata)
      expect(active).toBe(expectedActive)
    }
  )
})
