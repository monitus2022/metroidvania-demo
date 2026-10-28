import Phaser from 'phaser'
import { FIXED_DT, PLAYER_H, PLAYER_W, TILE } from '../sim/constants'
import { BTN, type InputMask } from '../sim/input'
import { GAME_MAP } from '../sim/levels'
import { createInitialState, gridOf, hasAbility, isDoorOpen, respawn, step } from '../sim/step'
import type { WorldState } from '../sim/state'
import { floorTopY, isSolid } from '../sim/tiles'
import { PARALLAX } from './parallax'
import { CURRENT } from './sprites'

/** Diagnostic view of the sprite, so anchoring can be asserted exactly. */
export interface SpriteInfo {
  x: number
  y: number
  displayWidth: number
  displayHeight: number
  originX: number
  originY: number
  frameWidth: number
  frameHeight: number
  flipX: boolean
  anim: string | null
  posX: number
  posY: number
}

declare global {
  interface Window {
    __game?: {
      ready: boolean
      getState: () => WorldState
      getInputMask: () => InputMask
      tickCount: () => number
      roomId: () => string
      spriteInfo: () => SpriteInfo
    }
  }
}

/** `?boxes` draws the collision box over the sprite, for checking alignment. */
const DEBUG_BOXES = new URLSearchParams(window.location.search).has('boxes')

/** Above this horizontal speed the character reads as running, not standing. */
const RUN_ANIM_THRESHOLD = 12

/**
 * The render + input layer. It owns no game rules: it samples the keyboard into
 * an input bitmask, advances the pure sim on a fixed-step accumulator, and draws
 * the result from sim state alone.
 */
export class PlayScene extends Phaser.Scene {
  private state: WorldState = createInitialState(GAME_MAP)
  private accumulator = 0
  private lastMask: InputMask = 0
  private drawnKey = ''
  private prevAirJumps = 0

  private hud!: HTMLDivElement
  private parallax: { ts: Phaser.GameObjects.TileSprite; layer: (typeof PARALLAX)[number]; texH: number }[] = []
  private terrain!: Phaser.GameObjects.Graphics
  private props!: Phaser.GameObjects.Graphics
  private box!: Phaser.GameObjects.Graphics
  private player!: Phaser.GameObjects.Sprite
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

  preload(): void {
    for (const [name, sheet] of Object.entries(CURRENT.sheets)) {
      this.load.spritesheet(`${CURRENT.id}-${name}`, sheet.url, {
        frameWidth: sheet.frameWidth,
        frameHeight: sheet.frameHeight,
      })
    }
    for (const layer of PARALLAX) this.load.image(layer.key, layer.url)
  }

  create(): void {
    for (const [name, anim] of Object.entries(CURRENT.animations)) {
      this.anims.create({
        key: `${CURRENT.id}-${name}`,
        frames: this.anims.generateFrameNumbers(`${CURRENT.id}-${anim.sheet}`, {
          start: anim.start,
          end: anim.end,
        }),
        frameRate: anim.frameRate,
        repeat: anim.repeat,
      })
    }

    this.buildParallax()
    this.terrain = this.add.graphics()
    this.props = this.add.graphics()
    this.box = this.add.graphics()

    this.player = this.add.sprite(0, 0, `${CURRENT.id}-idle`)
    // Origin at the feet, measured from the source sheets. The art carries 16px
    // of transparent padding below the feet, so origin y = 1 would float the
    // character a full tile above the ground.
    this.player.setOrigin(0.5, CURRENT.footOrigin)

    this.createHud()

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
      // Exposed so the sprite anchoring can be asserted exactly rather than
      // inferred from a screenshot.
      spriteInfo: () => ({
        x: this.player.x,
        y: this.player.y,
        displayWidth: this.player.displayWidth,
        displayHeight: this.player.displayHeight,
        originX: this.player.originX,
        originY: this.player.originY,
        frameWidth: this.player.width,
        frameHeight: this.player.height,
        flipX: this.player.flipX,
        anim: this.player.anims.currentAnim?.key ?? null,
        posX: this.state.player.pos.x,
        posY: this.state.player.pos.y,
      }),
    }
  }

  /**
   * Layered backgrounds, built once and resized per room.
   *
   * A tileSprite sized to the room, with `scrollFactor` set to the layer's
   * factor, means Phaser does the parallax offset and the texture loops to fill
   * however large the room is — no seams at the edges, no manual tiling.
   */
  private buildParallax(): void {
    this.parallax = PARALLAX.map((layer, i) => {
      const ts = this.add.tileSprite(0, 0, 1, 1, layer.key)
      ts.setOrigin(0, 0)
      ts.setScrollFactor(layer.factor, layer.factor)
      // Behind everything: terrain sits at depth 0.
      ts.setDepth(-100 + i)
      const source = this.textures.get(layer.key).getSourceImage()
      return { ts, layer, texH: source.height }
    })
  }

  /**
   * HUD as a DOM overlay rather than canvas text.
   *
   * The canvas is 240x160 and `Scale.FIT` blows it up ~5x on a desktop window,
   * so 8px canvas text gets upscaled like a sprite and reads as mush. DOM text
   * stays crisp at any scale.
   */
  private createHud(): void {
    this.hud = document.createElement('div')
    this.hud.id = 'hud'
    this.hud.style.cssText = [
      'position:fixed',
      'left:10px',
      'top:10px',
      'font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',
      'color:#93a9bd',
      'text-shadow:0 1px 2px #000',
      'pointer-events:none',
      'white-space:pre',
      'user-select:none',
    ].join(';')
    document.body.appendChild(this.hud)
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

    // Align each layer's opaque horizon with the room's floor line, so the flat
    // band at the bottom of every layer ends up behind the terrain instead of
    // striping across the middle of the play area.
    const floorY = floorTopY(grid)
    for (const { ts, layer, texH } of this.parallax) {
      ts.setSize(roomW, roomH)
      ts.setPosition(0, 0)
      const offset = layer.opaqueFrom - floorY
      ts.tilePositionY = Math.max(0, Math.min(Math.max(0, texH - roomH), offset))
    }

    this.drawnKey = this.viewKey()
  }

  /** Everything that invalidates the room drawing. */
  private viewKey(): string {
    return `${this.state.roomId}|${this.state.collected.join(',')}|${this.state.abilities.join(',')}`
  }

  private syncView(): void {
    if (this.drawnKey !== this.viewKey()) this.drawRoom()

    const p = this.state.player
    const wanted = !p.onGround ? 'air' : Math.abs(p.vel.x) > RUN_ANIM_THRESHOLD ? 'run' : 'idle'
    const animKey = `${CURRENT.id}-${wanted}`
    const current = this.player.anims.currentAnim?.key
    const doubleJumped = p.airJumpsUsed > this.prevAirJumps
    this.prevAirJumps = p.airJumpsUsed

    if (wanted === 'air') {
      // Restart the air strip on the mid-air jump; otherwise let it play out and
      // hold its last frame, which is the falling pose.
      if (doubleJumped || current !== animKey || !this.player.anims.isPlaying) {
        this.player.anims.play(animKey, true)
      }
    } else if (current !== animKey) {
      this.player.anims.play(animKey, true)
    }

    const nudge = p.facing === 1 ? CURRENT.xNudge : -CURRENT.xNudge
    this.player.setPosition(p.pos.x + nudge, p.pos.y)
    this.player.setFlipX(p.facing === -1)

    if (DEBUG_BOXES) {
      this.box.clear()
      // Pure magenta: no colour in the character art comes close, so the box
      // can be measured out of a screenshot without ambiguity.
      this.box.lineStyle(1, 0xff00ff, 0.9)
      this.box.strokeRect(p.pos.x - PLAYER_W / 2, p.pos.y - PLAYER_H, PLAYER_W, PLAYER_H)
      this.box.lineStyle(1, 0xffffff, 0.3)
      this.box.lineBetween(p.pos.x - 2, p.pos.y, p.pos.x + 2, p.pos.y)
    }

    this.cameras.main.centerOn(p.pos.x, p.pos.y - PLAYER_H / 2)

    const ability = hasAbility(this.state, 'doubleJump') ? 'double jump' : 'no ability'
    this.hud.textContent =
      `${this.state.roomId}   ${ability}${this.state.reachedGoal ? '   — GOAL' : ''}\n` +
      `← → move    space jump    r respawn`
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
