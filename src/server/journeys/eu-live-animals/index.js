import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dataDir = import.meta.dirname

const loadJSON = (filename) =>
  JSON.parse(readFileSync(join(dataDir, filename), 'utf-8'))

const obligationsData = loadJSON('obligations.json')

export const obligations = obligationsData.obligations
export const refdata = loadJSON('refdata.json')
export const journeyMap = loadJSON('journey.json')
export { scenarioMap as scenarios } from './scenarios.js'
export { resolvers } from './resolvers.js'
export { refdataView, commodityKeys, commodityDetail } from './refdata-view.js'
