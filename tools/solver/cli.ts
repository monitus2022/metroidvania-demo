import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { loadGameMap, type GatesFile, type RoomsFile } from '../../src/sim/content'
import { solve } from './reachability'

/**
 * Solver CLI: proves the shipped content is beatable and softlock-free.
 * Exits non-zero when it is not, so CI fails loudly.
 *
 *   npm run solve
 */

const here = dirname(fileURLToPath(import.meta.url))
const contentDir = join(here, '..', '..', 'content')

const readJson = <T>(name: string): T =>
  JSON.parse(readFileSync(join(contentDir, name), 'utf8')) as T

const map = loadGameMap(readJson<RoomsFile>('rooms.json'), readJson<GatesFile>('gates.json'))

const result = solve(map)

const line = (label: string, value: string): void => {
  console.log(`  ${label.padEnd(18)} ${value}`)
}

console.log(`\nMap: ${map.startRoom} -> ${map.goal.room}(${map.goal.col},${map.goal.row})`)
console.log(`Rooms: ${map.order.join(', ')}\n`)

if (result.errors.length > 0) {
  console.log('CONTENT ERRORS')
  for (const e of result.errors) console.log(`  ! ${e}`)
  console.log('\nUNBEATABLE\n')
  process.exit(1)
}

line('beatable', result.beatable ? 'yes' : 'NO')
line('abilities', result.abilities.length > 0 ? result.abilities.join(', ') : '(none)')
line('rooms reached', result.reachableRooms.join(', '))
line('doors opened', result.openedDoors.join(', ') || '(none)')

if (result.blockedDoors.length > 0) {
  line(
    'blocked doors',
    result.blockedDoors.map((b) => `${b.door} (needs ${b.requires})`).join(', '),
  )
}
if (result.softlocks.length > 0) line('SOFTLOCKS', result.softlocks.join(', '))
if (result.warnings.length > 0) {
  console.log('\nWARNINGS')
  for (const w of result.warnings) console.log(`  ~ ${w}`)
}

const ok = result.beatable && result.softlocks.length === 0 && result.warnings.length === 0
console.log(ok ? '\nOK\n' : '\nFAILED\n')
process.exit(ok ? 0 : 1)
