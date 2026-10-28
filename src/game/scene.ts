import Phaser from 'phaser'
import {
  DOOR_ARRIVAL_INSET,
  FIXED_DT,
  PLAYER_H,
  PLAYER_W,
  TILE,
  TRANSITION_LOCK_TICKS,
} from '../sim/constants'
import { BTN, type InputMask } from '../sim/input'
import { GAME_MAP } from '../sim/levels'
import { createInitialState, gridOf, hasAbility, isDoorOpen, respawn, step } from '../sim/step'
import type { WorldState } from '../sim/state'
import { floorTopY, isSolid } from '../sim/tiles'
import { PARALLAX } from './parallax'
import { PROP_STYLES } from './props'
import { CURRENT } from './sprites'
import { TERRAIN } from './terrain'

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
      /**
       * Test hook: drop the player into another room at its entry cell without
       * playing the route there. Touches no abilities or pickups, so it can be
       * used for visual checks but cannot fake progression.
       */
      gotoRoom: (roomId: string, atCol?: number) => boolean
      /** Prop positions in the current room, for asserting scenery placement. */
      propInfo: () => { id: string; kind: string; x: number; y: number; anim: string | null }[]
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
  private propSprites: Phaser.GameObjects.Sprite[] = []
  private surfaceTiles: Phaser.GameObjects.TileSprite[] = []
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
    this.load.image(TERRAIN.key, TERRAIN.url)
    for (const [kind, style] of Object.entries(PROP_STYLES)) {
      this.load.spritesheet(`prop-${kind}`, style.url, {
        frameWidth: style.frameWidth,
        frameHeight: style.frameHeight,
      })
    }
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

    for (const [kind, style] of Object.entries(PROP_STYLES)) {
      const key = `prop-${kind}`
      if (style.frameRate <= 0 || this.anims.exists(key)) continue
      this.anims.create({
        key,
        frames: this.anims.generateFrameNumbers(key, { start: 0, end: style.frames - 1 }),
        frameRate: style.frameRate,
        repeat: -1,
      })
    }

    // Cut the terrain atlas into named frames; the pack is not grid-aligned, so
    // a uniform spritesheet slice would not work.
    const terrainTexture = this.textures.get(TERRAIN.key)
    for (const [name, frame] of Object.entries(TERRAIN.frames)) {
      terrainTexture.add(name, 0, frame.x, frame.y, frame.width, frame.height)
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

    // Explicit depths: props are sprites now, so creation order alone would let
    // a prop drawn after the player cover her.
    this.terrain.setDepth(0)
    this.props.setDepth(1)
    this.box.setDepth(2)
    this.player.setDepth(3)

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
      gotoRoom: (roomId: string, atCol?: number) => {
        const room = this.state.map.rooms[roomId]
        if (!room) return false
        // A room whose entry cell is also its return door (the spire) would
        // bounce straight back out, so mirror what a real door transition does
        // and step inward off the door tile.
        const onDoor = room.doors.some((d) => d.col === room.entry.col && d.row === room.entry.row)
        const inward = room.entry.col < room.grid.w / 2 ? 1 : -1
        const spawnCol =
          atCol ?? (onDoor ? room.entry.col + inward * DOOR_ARRIVAL_INSET : room.entry.col)
        this.state = {
          ...this.state,
          roomId,
          player: {
            ...this.state.player,
            pos: {
              x: Math.min(room.grid.w - 1, Math.max(0, spawnCol)) * TILE + TILE / 2,
              y: (room.entry.row + 1) * TILE,
            },
            vel: { x: 0, y: 0 },
            onGround: true,
            airJumpsUsed: 0,
            coyoteTimer: 0,
            jumpBufferTimer: 0,
          },
          // Same lock `createInitialState` uses. Without it, a room whose entry
          // cell is also its return door — the spire — bounces you straight back
          // out on the next tick.
          transitionLock: TRANSITION_LOCK_TICKS,
        }
        this.drawRoom()
        this.syncView()
        return true
      },
      propInfo: () =>
        this.propSprites.map((sprite, i) => ({
          id: this.state.map.rooms[this.state.roomId]!.props[i]?.id ?? '',
          kind: this.state.map.rooms[this.state.roomId]!.props[i]?.kind ?? '',
          x: sprite.x,
          y: sprite.y,
          anim: sprite.anims.currentAnim?.key ?? null,
        })),
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

    // Ground body: flat dirt. A single colour in the source art, so it is a
    // fill rather than a tiled sprite.
    this.terrain.fillStyle(TERRAIN.bodyColor, 1)
    for (let row = 0; row < grid.h; row++) {
      for (let col = 0; col < grid.w; col++) {
        if (isSolid(grid, col, row)) this.terrain.fillRect(col * TILE, row * TILE, TILE, TILE)
      }
    }

    // Ground surface: the sand-capped strip, on every solid cell with air above
    // it. Emitted per contiguous run so a 20-tile floor is one sprite rather
    // than twenty.
    for (const sprite of this.surfaceTiles) sprite.destroy()
    this.surfaceTiles = []
    for (let row = 0; row < grid.h; row++) {
      let col = 0
      while (col < grid.w) {
        const isSurface = isSolid(grid, col, row) && !isSolid(grid, col, row - 1)
        if (!isSurface) {
          col++
          continue
        }
        let end = col
        while (
          end + 1 < grid.w &&
          isSolid(grid, end + 1, row) &&
          !isSolid(grid, end + 1, row - 1)
        ) {
          end++
        }
        const sprite = this.add.tileSprite(
          col * TILE,
          row * TILE,
          (end - col + 1) * TILE,
          TILE,
          TERRAIN.key,
          'surface',
        )
        sprite.setOrigin(0, 0)
        sprite.setDepth(0.5)
        this.surfaceTiles.push(sprite)
        col = end + 1
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

    // Scenery. Sprites rather than Graphics, so they are destroyed and rebuilt
    // whenever the room drawing is invalidated. Anchored to the bottom of their
    // cell, which puts them on whatever ground is below.
    for (const sprite of this.propSprites) sprite.destroy()
    this.propSprites = []
    for (const prop of room.props) {
      const style = PROP_STYLES[prop.kind]
      if (!style) continue
      const key = `prop-${prop.kind}`
      const sprite = this.add.sprite(prop.col * TILE + TILE / 2, (prop.row + 1) * TILE, key, 0)
      sprite.setOrigin(style.originX, style.originY)
      sprite.setDepth(1)
      if (style.frameRate > 0 && this.anims.exists(key)) sprite.play(key)
      this.propSprites.push(sprite)
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
