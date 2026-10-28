import Phaser from 'phaser'
import { PLAYER_H, PLAYER_W, TILE } from '../sim/constants'
import { GAME_MAP } from '../sim/levels'
import { createInitialState, gridOf, hasAbility, isDoorOpen, respawn, step } from '../sim/step'
import type { WorldState } from '../sim/state'
import { isSolid } from '../sim/tiles'
import { BTN, type InputMask } from '../sim/input'
import { FIXED_DT } from '../sim/constants'

declare global {
  interface Window {
    __game?: {
      ready: boolean
      getState: () => WorldState
      getInputMask: () => InputMask
      tickCount: () => number
      roomId: () => string
    }
  }
}

/**
 * The render + input layer. It owns no game rules: it samples the keyboard into
 * an input bitmask, advances the pure sim on a fixed-step accumulator, and draws
 * the result. Sprites are deliberately rectangles until the harness is green.
 */
export class PlayScene extends Phaser.Scene {
  private state: WorldState = createInitialState(GAME_MAP)
  private accumulator = 0
  private lastMask: InputMask = 0
  private drawnKey = ''

  private terrain!: Phaser.GameObjects.Graphics
  private props!: Phaser.GameObjects.Graphics
  private playerRect!: Phaser.GameObjects.Rectangle
  private hudText!: Phaser.GameObjects.Text
  private keys!: {
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
    jump: Phaser.Input.Keyboard.Key
    a: Phaser.Input.Keyboard.Key
    d: Phaser.Input.Keyboard.Key
    r: Phaser.Input.Keyboard.Key
  }

  constructor() {
    super('play')
  }

  create(): void {
    this.terrain = this.add.graphics()
    this.props = this.add.graphics()
    this.playerRect = this.add.rectangle(0, 0, PLAYER_W, PLAYER_H, 0x6ee7ff)

    this.hudText = this.add
      .text(4, 3, '', { fontFamily: 'monospace', fontSize: '8px', color: '#8aa0b4' })
      .setScrollFactor(0)
      .setDepth(10)
    this.add
      .text(4, 12, 'arrows move   space jump (x2)   r respawn', {
        fontFamily: 'monospace',
        fontSize: '7px',
        color: '#4d6478',
      })
      .setScrollFactor(0)
      .setDepth(10)

    const keyboard = this.input.keyboard
    if (!keyboard) throw new Error('keyboard input unavailable')
    const K = Phaser.Input.Keyboard.KeyCodes
    this.keys = {
      left: keyboard.addKey(K.LEFT),
      right: keyboard.addKey(K.RIGHT),
      jump: keyboard.addKey(K.SPACE),
      a: keyboard.addKey(K.A),
      d: keyboard.addKey(K.D),
      r: keyboard.addKey(K.R),
    }

    this.cameras.main.setRoundPixels(true)
    this.drawRoom()
    this.syncView()

    window.__game = {
      ready: true,
      getState: () => this.state,
      getInputMask: () => this.lastMask,
      tickCount: () => this.state.tick,
      roomId: () => this.state.roomId,
    }
  }

  private sampleInput(): InputMask {
    let mask: InputMask = 0
    if (this.keys.left.isDown || this.keys.a.isDown) mask |= BTN.LEFT
    if (this.keys.right.isDown || this.keys.d.isDown) mask |= BTN.RIGHT
    if (this.keys.jump.isDown) mask |= BTN.JUMP
    return mask
  }

  /**
   * Terrain, items and doors for the current room.
   *
   * Redrawn when the room *or* the collected/ability sets change — a pickup
   * inside a room leaves a ghost marker on screen if only room changes trigger
   * a redraw, and no assertion would ever catch that.
   */
  private drawRoom(): void {
    const room = this.state.map.rooms[this.state.roomId]!
    const grid = gridOf(this.state)

    this.terrain.clear()
    this.props.clear()

    this.terrain.fillStyle(0x1b2530, 1)
    for (let row = 0; row < grid.h; row++) {
      for (let col = 0; col < grid.w; col++) {
        if (isSolid(grid, col, row)) this.terrain.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
    // Highlight the walkable top edge of every solid run.
    this.terrain.lineStyle(1, 0x38a3c4, 0.55)
    for (let row = 0; row < grid.h; row++) {
      for (let col = 0; col < grid.w; col++) {
        if (isSolid(grid, col, row) && !isSolid(grid, col, row - 1)) {
          this.terrain.lineBetween(col * TILE, row * TILE, (col + 1) * TILE, row * TILE)
        }
      }
    }

    // Items not yet collected.
    for (const item of room.items) {
      if (this.state.collected.includes(item.id)) continue
      const cx = item.col * TILE + TILE / 2
      const cy = item.row * TILE + TILE / 2
      this.props.fillStyle(0xffd166, 1)
      this.props.fillCircle(cx, cy, 4)
      this.props.fillStyle(0xfff3c4, 1)
      this.props.fillCircle(cx, cy, 1.5)
    }

    // Doors: green when passable, red when a gate is holding them shut.
    for (const door of room.doors) {
      const open = isDoorOpen(this.state.map, door, this.state.abilities)
      this.props.fillStyle(open ? 0x38d39f : 0xd3575c, open ? 0.9 : 0.75)
      this.props.fillRect(door.col * TILE + 5, door.row * TILE + 2, TILE - 10, TILE - 2)
    }

    const roomW = grid.w * TILE
    const roomH = grid.h * TILE
    this.cameras.main.setBounds(0, 0, roomW, roomH)
    this.drawnKey = this.viewKey()
  }

  /** Everything that invalidates the room drawing. */
  private viewKey(): string {
    return `${this.state.roomId}|${this.state.collected.join(',')}|${this.state.abilities.join(',')}`
  }

  private syncView(): void {
    if (this.drawnKey !== this.viewKey()) this.drawRoom()

    const p = this.state.player
    // pos is the feet; the rectangle origin is its centre.
    this.playerRect.setPosition(p.pos.x, p.pos.y - PLAYER_H / 2)
    this.playerRect.setFillStyle(hasAbility(this.state, 'doubleJump') ? 0x9ef7ff : 0x6ee7ff)

    this.cameras.main.centerOn(p.pos.x, p.pos.y - PLAYER_H / 2)

    const ability = hasAbility(this.state, 'doubleJump') ? 'double jump' : 'no ability'
    this.hudText.setText(
      `${this.state.roomId}  ${ability}  ` +
        `x ${p.pos.x.toFixed(0)} y ${p.pos.y.toFixed(0)}` +
        (this.state.reachedGoal ? '  GOAL' : ''),
    )
  }

  update(_time: number, delta: number): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.r)) {
      this.state = respawn(this.state)
    }

    const mask = this.sampleInput()
    this.lastMask = mask

    // Clamp the frame delta so a stalled tab cannot spiral the accumulator.
    this.accumulator += Math.min(delta, 250) / 1000
    while (this.accumulator >= FIXED_DT) {
      this.state = step(this.state, mask, FIXED_DT)
      this.accumulator -= FIXED_DT
    }

    this.syncView()
  }
}
