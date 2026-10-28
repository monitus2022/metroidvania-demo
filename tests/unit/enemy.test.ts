import { describe, expect, it } from 'vitest'
import { overlapsSolid } from '../../src/sim/collision'
import {
  ATTACK_COOLDOWN_TICKS,
  ATTACK_TICKS,
  ENEMY_ACTIVE_TICKS,
  ENEMY_HP,
  ENEMY_RESPAWN_TICKS,
  ENEMY_WINDUP_TICKS,
  PLAYER_INVULN_TICKS,
  PLAYER_MAX_HP,
} from '../../src/sim/constants'
import { singleRoomMap } from '../../src/sim/content'
import { BTN } from '../../src/sim/input'
import { createInitialState, enemyAttackPhase, step } from '../../src/sim/step'
import type { WorldState } from '../../src/sim/state'
import { enemyInFront, enemyRoom, playerOnEnemy } from './fixtures'

/*
 * Combat is the second thing in this project that is *deterministic and
 * testable* while being difficult by feel. Everything here is a property that
 * can be pinned: damage lands once per swing, invulnerability stops a single
 * touch from draining the bar, death returns the player to the room entry, and
 * no enemy ever ends up inside a wall.
 *
 * Difficulty — whether three hit points and one enemy type is the right fight —
 * is not in this file and cannot be.
 */

const run = (s: WorldState, mask: number, ticks: number): WorldState => {
  let out = s
  for (let i = 0; i < ticks; i++) out = step(out, mask)
  return out
}

describe('enemy: patrol', () => {
  it('walks, and stays inside its patrol range', () => {
    const s0 = createInitialState(enemyRoom({ patrol: 3 }))
    const spawnX = s0.enemies[0]!.spawn.x
    const reach = 3 * 16

    let s = s0
    let minX = spawnX
    let maxX = spawnX
    for (let i = 0; i < 900; i++) {
      s = step(s, 0)
      const x = s.enemies[0]!.pos.x
      minX = Math.min(minX, x)
      maxX = Math.max(maxX, x)
    }

    expect(maxX - minX, 'enemy never moved').toBeGreaterThan(8)
    expect(minX).toBeGreaterThanOrEqual(spawnX - reach - 1)
    expect(maxX).toBeLessThanOrEqual(spawnX + reach + 1)
  })

  it('never walks off the platform it was placed on', () => {
    // A five-tile ledge with `patrol: 8`, so the patrol bound is much wider than
    // the ledge. An enemy that only turned at its patrol bounds would walk
    // straight off the edge, fall, and become unreachable — so this asserts the
    // ledge check specifically, not the bound.
    const map = singleRoomMap(
      [
        ...Array(9).fill('....................'),
        '..P.................',
        '........#####.......',
        '........#####.......',
      ],
      { id: 'ledge', enemies: [{ id: 'e1', kind: 'enraged', col: 10, row: 9, patrol: 8 }] },
    )
    let s = createInitialState(map)
    let minX = s.enemies[0]!.pos.x
    let maxX = minX
    for (let i = 0; i < 600; i++) {
      s = step(s, 0)
      const e = s.enemies[0]!
      minX = Math.min(minX, e.pos.x)
      maxX = Math.max(maxX, e.pos.x)
      expect(e.pos.y, 'enemy fell off the ledge').toBe(160)
    }
    // It patrolled the width of the ledge and no more.
    expect(maxX - minX).toBeGreaterThan(8)
    expect(minX).toBeGreaterThanOrEqual(8 * 16)
    expect(maxX).toBeLessThanOrEqual(13 * 16)
  })

  it('never ends up inside terrain', () => {
    let s = createInitialState(enemyRoom({ patrol: 6 }))
    for (let i = 0; i < 1200; i++) {
      s = step(s, i % 7 === 0 ? BTN.LEFT : BTN.RIGHT)
      expect(overlapsSolid(s.enemies[0]!, s.map.rooms['enemy-room']!.grid)).toBeNull()
    }
  })
})

describe('enemy: attacks are telegraphed', () => {
  it('does not hurt the player merely by touching them', () => {
    // The fairness property. Contact damage with no wind-up is a cheap hit, and
    // it is exactly what every assertion in this file used to pass on.
    let s = playerOnEnemy(createInitialState(enemyRoom()))
    s = run(s, 0, 5)
    expect(s.hp).toBe(PLAYER_MAX_HP)
  })

  it('lands nothing until the wind-up is over', () => {
    let s = playerOnEnemy(createInitialState(enemyRoom()))
    // Overlapping the whole time, through the entire telegraph.
    s = run(s, 0, ENEMY_WINDUP_TICKS)
    expect(s.hp, 'damage during the wind-up').toBe(PLAYER_MAX_HP)

    s = step(s, 0)
    expect(s.hp).toBe(PLAYER_MAX_HP - 1)
  })

  it('is rooted through the wind-up, so the telegraph is readable', () => {
    // Note the bound: the last tick of the wind-up count is the first active
    // tick, and that is when the lunge starts. Stopping one short asserts the
    // telegraph without tripping over the boundary.
    let s = playerOnEnemy(createInitialState(enemyRoom()))
    s = step(s, 0) // commits
    const x = s.enemies[0]!.pos.x
    s = run(s, 0, ENEMY_WINDUP_TICKS - 1)
    expect(enemyAttackPhase(s.enemies[0]!)).toBe('windup')
    expect(s.enemies[0]!.pos.x).toBe(x)
  })

  it('lunges only while the hitbox is live', () => {
    let s = playerOnEnemy(createInitialState(enemyRoom()), 34)
    s = step(s, 0)
    const x = s.enemies[0]!.pos.x
    // Through the wind-up: still.
    s = run(s, 0, ENEMY_WINDUP_TICKS - 1)
    expect(s.enemies[0]!.pos.x).toBe(x)
    // Into the active window: it closes the gap, and the player was on its right.
    s = run(s, 0, 4)
    expect(enemyAttackPhase(s.enemies[0]!)).toBe('active')
    expect(s.enemies[0]!.pos.x).toBeGreaterThan(x)
  })

  it('can be dodged by leaving range during the wind-up', () => {
    // Stand just inside its reach, then walk away while it winds up.
    let s = playerOnEnemy(createInitialState(enemyRoom()), 14)
    s = run(s, 0, 3) // it commits, facing right
    expect(s.enemies[0]!.attackTimer).toBeGreaterThan(0)

    s = run(s, BTN.LEFT, ENEMY_WINDUP_TICKS + ENEMY_ACTIVE_TICKS + 4)
    expect(s.hp, 'a dodgeable attack still landed').toBe(PLAYER_MAX_HP)
  })

  it('knocks the player back and shows the hurt pose when it lands', () => {
    // Offset rather than exactly co-located: the knockback direction is
    // sign(player.x - enemy.x), which is zero when they sit on the same pixel.
    let s = playerOnEnemy(createInitialState(enemyRoom()), 6)
    s = run(s, 0, ENEMY_WINDUP_TICKS + 1)

    expect(s.hp).toBe(PLAYER_MAX_HP - 1)
    expect(s.hurtTimer).toBeGreaterThan(0)
    expect(s.invulnTimer).toBeGreaterThan(0)
    // Knocked up and away, so the player is not left standing inside it.
    expect(s.player.vel.y).toBeLessThan(0)
    expect(s.player.vel.x).toBeGreaterThan(0) // away from the enemy on the left
  })

  it('does not drain a second point while invulnerable', () => {
    let s = playerOnEnemy(createInitialState(enemyRoom()), 6)
    s = run(s, 0, ENEMY_WINDUP_TICKS + 1)
    expect(s.hp).toBe(PLAYER_MAX_HP - 1)

    // Stay inside it for the rest of the invulnerable window. Note the bound:
    // a full ENEMY attack cycle is shorter than 90 ticks, so running the whole
    // window would legitimately let a second swing land right at the end.
    s = playerOnEnemy(s, 6)
    s = run(s, 0, PLAYER_INVULN_TICKS - 2)
    expect(s.invulnTimer).toBeGreaterThan(0)
    expect(s.hp).toBe(PLAYER_MAX_HP - 1)
  })

  it('sends the player back to the room entry when health runs out', () => {
    const start = createInitialState(enemyRoom())
    const entryX = start.player.pos.x
    let s = playerOnEnemy({ ...start, hp: 1 })
    s = run(s, 0, ENEMY_WINDUP_TICKS + 1)

    expect(s.hp).toBe(PLAYER_MAX_HP)
    expect(s.player.pos.x).toBe(entryX)
    expect(s.player.pos.y).toBe(start.player.pos.y)
  })
})

describe('enemy: the swing', () => {
  it('lands exactly once per swing', () => {
    // The bug this exists to prevent: a 12-tick hitbox window that damages every
    // tick deals 12 damage, and no enemy survives a single swing.
    let s = enemyInFront(createInitialState(enemyRoom()), 20)
    const before = s.enemies[0]!.hp

    s = step(s, BTN.ATTACK) // press edge
    for (let i = 0; i < ATTACK_TICKS + 10; i++) s = step(s, BTN.ATTACK)

    expect(s.enemies[0]!.hp).toBe(before - 1)
  })

  it('misses an enemy that is out of reach', () => {
    let s = enemyInFront(createInitialState(enemyRoom()), 64)
    const before = s.enemies[0]!.hp
    s = step(s, BTN.ATTACK)
    for (let i = 0; i < ATTACK_TICKS + 4; i++) s = step(s, BTN.ATTACK)
    expect(s.enemies[0]!.hp).toBe(before)
  })

  it('does not fire again while the button is held', () => {
    // Attack is a press edge. Holding must produce one swing, not one per tick.
    let s = enemyInFront(createInitialState(enemyRoom()), 20)
    const before = s.enemies[0]!.hp
    s = run(s, BTN.ATTACK, 200)
    expect(s.enemies[0]!.hp).toBe(before - 1)
  })

  it('kills the enemy, which then respawns', () => {
    let s = enemyInFront(createInitialState(enemyRoom()), 20)
    const before = s.enemies[0]!.hp
    expect(before).toBe(ENEMY_HP)

    for (let swing = 0; swing < ENEMY_HP; swing++) {
      s = enemyInFront(s, 20) // re-arm: keep it in reach
      s = step(s, 0) // release, so the next press is a fresh edge
      s = step(s, BTN.ATTACK)
      s = run(s, BTN.ATTACK, ATTACK_COOLDOWN_TICKS + 2)
    }

    expect(s.enemies[0]!.alive).toBe(false)
    expect(s.enemies[0]!.hp).toBe(0)
    expect(s.enemies[0]!.respawnTimer).toBeGreaterThan(0)

    s = run(s, 0, ENEMY_RESPAWN_TICKS + 2)
    expect(s.enemies[0]!.alive).toBe(true)
    expect(s.enemies[0]!.hp).toBe(ENEMY_HP)
    expect(s.enemies[0]!.pos.x).toBe(s.enemies[0]!.spawn.x)
  })

  it('a dead enemy stops hurting you', () => {
    // Swing from 20px: at 0px the enemy's body only just touches the front edge
    // of the swing box, so the hit depends on sub-pixel patrol jitter.
    let s = enemyInFront(createInitialState(enemyRoom()), 20)
    for (let swing = 0; swing < ENEMY_HP; swing++) {
      s = enemyInFront(s, 20)
      s = step(s, 0)
      s = step(s, BTN.ATTACK)
      s = run(s, BTN.ATTACK, ATTACK_COOLDOWN_TICKS + 2)
    }
    expect(s.enemies[0]!.alive).toBe(false)

    // Sit inside the corpse with invulnerability expired: no further damage.
    const hpBefore = s.hp
    s = playerOnEnemy({ ...s, invulnTimer: 0 })
    s = run(s, 0, ENEMY_WINDUP_TICKS + ENEMY_ACTIVE_TICKS + 4)
    expect(s.hp).toBe(hpBefore)
  })
})

describe('enemy: determinism', () => {
  it('the same inputs produce the same enemy positions', () => {
    const masks = Array.from({ length: 300 }, (_, i) => (i % 3 === 0 ? BTN.RIGHT : BTN.LEFT))
    const a = masks.reduce((s, m) => step(s, m), createInitialState(enemyRoom({ patrol: 5 })))
    const b = masks.reduce((s, m) => step(s, m), createInitialState(enemyRoom({ patrol: 5 })))

    expect(a.enemies.map((e) => [e.pos.x, e.pos.y, e.hp, e.dir])).toEqual(
      b.enemies.map((e) => [e.pos.x, e.pos.y, e.hp, e.dir]),
    )
  })

  it('does not mutate the state it was given', () => {
    // `step` clones the enemy list; a shared reference would make the replay
    // hash disagree with itself.
    const before = createInitialState(enemyRoom({ patrol: 5 }))
    const snapshot = JSON.stringify(before.enemies)
    run(before, BTN.RIGHT, 60)
    expect(JSON.stringify(before.enemies)).toBe(snapshot)
  })
})
