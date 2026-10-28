import Phaser from 'phaser'
import { FIXED_DT, PLAYER_H, PLAYER_W, TILE } from '../sim/constants'
import { BTN, type InputMask } from '../sim/input'
import { DEMO_LEVEL } from '../sim/levels'
import { createInitialState, step } from '../sim/step'
import type { WorldState } from '../sim/state'
import { isSolid } from '../sim/tiles'

declare global {
  interface Window {
    __game?: {
      ready: boolean
      getState: () => WorldState
      getInputMask: () => InputMask
      tickCount: () => number
    }
  }
}

/**
 * The render + input layer. It owns no game rules: it samples the keyboard into
 * an input bitmask, advances the pure sim on a fixed-step accumulator, and draws
 * the result. Sprites are deliberately rectangles until the harness is green.
 */
export class PlayScene extends Phaser.Scene {
  private state: WorldState = createInitialState(DEMO_LEVEL)
  private accumulator = 0
  private lastMask: InputMask = 0
  private playerRect!: Phaser.GameObjects.Rectangle
  private hudText!: Phaser.GameObjects.Text
  private keys!: {
    left: Phaser.Input.Keyboard.Key
    right: Phaser.Input.Keyboard.Key
    jump: Phaser.Input.Keyboard.Key
    a: Phaser.Input.Keyboard.Key
    d: Phaser.Input.Keyboard.Key
  }

  constructor() {
    super('play')
  }

  create(): void {
    const level = this.state.level

    // Static geometry, drawn once. Tile colours come from level data, not art.
    const g = this.add.graphics()
    g.fillStyle(0x1b2530, 1)
    for (let row = 0; row < level.h; row++) {
      for (let col = 0; col < level.w; col++) {
        if (isSolid(level, col, row)) g.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }
    // Highlight the walkable top edge of every solid run.
    g.lineStyle(1, 0x38a3c4, 0.6)
    for (let row = 0; row < level.h; row++) {
      for (let col = 0; col < level.w; col++) {
        if (isSolid(level, col, row) && !isSolid(level, col, row - 1)) {
          g.lineBetween(col * TILE, row * TILE, (col + 1) * TILE, row * TILE)
        }
      }
    }

    this.playerRect = this.add.rectangle(0, 0, PLAYER_W, PLAYER_H, 0x6ee7ff)
    this.hudText = this.add.text(4, 3, '', {
      fontFamily: 'monospace',
      fontSize: '8px',
      color: '#8aa0b4',
    })

    const keyboard = this.input.keyboard
    if (!keyboard) throw new Error('keyboard input unavailable')
    const K = Phaser.Input.Keyboard.KeyCodes
    this.keys = {
      left: keyboard.addKey(K.LEFT),
      right: keyboard.addKey(K.RIGHT),
      jump: keyboard.addKey(K.SPACE),
      a: keyboard.addKey(K.A),
      d: keyboard.addKey(K.D),
    }

    this.syncView()

    window.__game = {
      ready: true,
      getState: () => this.state,
      getInputMask: () => this.lastMask,
      tickCount: () => this.state.tick,
    }
  }

  private sampleInput(): InputMask {
    let mask: InputMask = 0
    if (this.keys.left.isDown || this.keys.a.isDown) mask |= BTN.LEFT
    if (this.keys.right.isDown || this.keys.d.isDown) mask |= BTN.RIGHT
    if (this.keys.jump.isDown) mask |= BTN.JUMP
    return mask
  }

  private syncView(): void {
    const p = this.state.player
    // pos is the feet; rectangle origin is centre, so shift up by half height.
    this.playerRect.setPosition(p.pos.x, p.pos.y - PLAYER_H / 2)
    this.hudText.setText(
      `tick ${this.state.tick}  x ${p.pos.x.toFixed(1)}  y ${p.pos.y.toFixed(1)}  ` +
        `onGround ${p.onGround ? 'Y' : 'n'}`,
    )
  }

  update(_time: number, delta: number): void {
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
