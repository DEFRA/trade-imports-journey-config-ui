import { describe, test, expect } from 'vitest'
import { obligations, refdata, scenarios } from './index.js'

describe('eu-live-animals journey module', () => {
  describe('obligations export', () => {
    test('Should have expected contract structure', () => {
      expect(Array.isArray(obligations)).toBe(true)
      expect(obligations.length).toBeGreaterThan(0)

      obligations.forEach((ob) => {
        expect(ob.id).toBeDefined()
        expect(typeof ob.id).toBe('string')
        expect(ob.schemaPaths).toBeDefined()
        expect(Array.isArray(ob.schemaPaths)).toBe(true)
      })
    })
  })

  describe('refdata export', () => {
    test('Should have expected routing structure', () => {
      expect(typeof refdata).toBe('object')
      expect(refdata.routing).toBeDefined()
      expect(typeof refdata.routing).toBe('object')

      const routingEntries = Object.entries(refdata.routing)
      expect(routingEntries.length).toBeGreaterThan(0)

      routingEntries.forEach(([_key, value]) => {
        expect(typeof value.cph_number).toBe('boolean')
        expect(typeof value.permanent_address).toBe('boolean')
        expect(typeof value.transporter_address).toBe('boolean')
      })
    })
  })

  describe('scenarios export', () => {
    test('Should export all 7 scenario fixtures', () => {
      expect(typeof scenarios).toBe('object')
      const scenarioNames = Object.keys(scenarios).sort()
      expect(scenarioNames).toEqual([
        'import-cats',
        'import-cattle',
        'import-mixed-livestock',
        'import-owls',
        'import-semen',
        'transhipment-cattle',
        'transhipment-semen'
      ])
    })

    test('Each scenario should have notification with partOne', () => {
      Object.entries(scenarios).forEach(([_name, scenario]) => {
        expect(scenario.notification).toBeDefined()
        expect(scenario.notification.partOne).toBeDefined()
        expect(typeof scenario.notification.partOne).toBe('object')
      })
    })

    test('import-cattle scenario should have cattle commodity', () => {
      const { notification } = scenarios['import-cattle']
      expect(
        notification.partOne.commodities.commodityComplement[0].commodityID
      ).toBe('102')
      expect(
        notification.partOne.commodities.commodityComplement[0].speciesName
      ).toBe('Bos taurus')
    })

    test('transhipment-cattle scenario should have transit purpose and exit details', () => {
      const { notification } = scenarios['transhipment-cattle']
      expect(notification.partOne.purpose.purposeGroup).toBe(
        'For Transhipment to'
      )
      expect(notification.partOne.purpose.exitBIP).toBeDefined()
      expect(notification.partOne.portOfExit).toBeDefined()
    })
  })
})
