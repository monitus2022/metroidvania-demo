import { expect, test, type Page } from '@playwright/test'

/**
 * Page-side probes. These must be evaluated *in the browser* — a bare
 * `window.__game` reference at module scope would run in Node and throw.
 */
const isReady = (page: Page): Promise<boolean> =>
  page.evaluate(() => window.__game?.ready === true)

const tickCount = (page: Page): Promise<number> =>
  page.evaluate(() => window.__game?.tickCount() ?? -1)

const playerX = (page: Page): Promise<number> =>
  page.evaluate(() => window.__game!.getState().player.pos.x)

const onGround = (page: Page): Promise<boolean> =>
  page.evaluate(() => window.__game!.getState().player.onGround)

const velX = (page: Page): Promise<number> =>
  page.evaluate(() => window.__game!.getState().player.vel.x)

const roomId = (page: Page): Promise<string> =>
  page.evaluate(() => window.__game!.getState().roomId)

const abilities = (page: Page): Promise<string[]> =>
  page.evaluate(() => [...window.__game!.getState().abilities])

const open = async (page: Page): Promise<void> => {
  await page.goto('/')
  await expect.poll(() => isReady(page), { timeout: 15_000 }).toBe(true)
}

test('boots the built bundle, responds to keys, and screenshots', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await open(page)
  await expect.poll(() => tickCount(page), { timeout: 5_000 }).toBeGreaterThan(10)

  const before = await playerX(page)
  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(700)
  await page.keyboard.up('ArrowRight')

  expect(await playerX(page)).toBeGreaterThan(before)
  expect(errors).toEqual([])

  await page.screenshot({ path: 'artifacts/m3-atrium.png' })
})

test('jump input leaves the ground', async ({ page }) => {
  await open(page)
  await expect.poll(() => onGround(page), { timeout: 5_000 }).toBe(true)

  await page.keyboard.down('Space')
  await expect.poll(() => onGround(page), { timeout: 3_000 }).toBe(false)
  await page.keyboard.up('Space')
})

/**
 * Regression guard: keys must *release*. A binding that only sets isDown on
 * keydown (an event-handler hook) would leave the player accelerating forever.
 */
test('releasing a movement key brings the player to rest', async ({ page }) => {
  await open(page)
  await expect.poll(() => onGround(page), { timeout: 5_000 }).toBe(true)

  await page.keyboard.down('KeyD')
  await expect.poll(() => velX(page), { timeout: 3_000 }).toBeGreaterThan(0)
  await page.keyboard.up('KeyD')
  await expect.poll(() => velX(page), { timeout: 3_000 }).toBe(0)
})

/**
 * M3 acceptance: real key events walk the player out of the first room and into
 * the second. This is the integration the sim tests cannot cover — that the
 * browser, the input sampling and the transition logic agree with each other.
 */
test('walking right carries the player into the next room', async ({ page }) => {
  await open(page)
  expect(await roomId(page)).toBe('atrium')

  await page.keyboard.down('ArrowRight')
  await expect.poll(() => roomId(page), { timeout: 10_000 }).toBe('gallery')
  await page.keyboard.up('ArrowRight')

  // Arriving in a room must not immediately send the player back.
  await page.waitForTimeout(400)
  expect(await roomId(page)).toBe('gallery')

  await page.screenshot({ path: 'artifacts/m3-gallery.png' })
})

test('the double jump is picked up by walking, and then works mid-air', async ({ page }) => {
  await open(page)
  expect(await abilities(page)).toEqual([])

  await page.keyboard.down('ArrowRight')
  await expect.poll(() => abilities(page), { timeout: 15_000 }).toContain('doubleJump')
  await page.keyboard.up('ArrowRight')

  // Artifact for vision review: the collected marker must be gone from screen.
  await page.screenshot({ path: 'artifacts/m3-gallery-collected.png' })

  // Settle somewhere with clear headroom, and give the input sampler a few
  // frames to observe the release before the next press.
  await expect.poll(() => onGround(page), { timeout: 5_000 }).toBe(true)
  await page.waitForTimeout(300)

  const airJumps = (): Promise<number> =>
    page.evaluate(() => window.__game!.getState().player.airJumpsUsed)

  await page.keyboard.down('Space')
  await page.waitForTimeout(150)
  await page.keyboard.up('Space')
  await page.waitForTimeout(150)
  await page.keyboard.down('Space')

  // Only a mid-air second jump sets this.
  await expect.poll(airJumps, { timeout: 3_000 }).toBe(1)
  await page.keyboard.up('Space')
})

test('the player can walk back into the previous room', async ({ page }) => {
  await open(page)
  expect(await roomId(page)).toBe('atrium')

  await page.keyboard.down('ArrowRight')
  await expect.poll(() => roomId(page), { timeout: 15_000 }).toBe('gallery')
  await page.keyboard.up('ArrowRight')

  // Standing still on arrival must not bounce the player back.
  await page.waitForTimeout(600)
  expect(await roomId(page)).toBe('gallery')

  await page.keyboard.down('ArrowLeft')
  await expect.poll(() => roomId(page), { timeout: 15_000 }).toBe('atrium')
  await page.keyboard.up('ArrowLeft')
})

test('respawn returns the player to the room entry', async ({ page }) => {
  await open(page)
  const entryX = await playerX(page)

  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(500)
  await page.keyboard.up('ArrowRight')
  expect(await playerX(page)).toBeGreaterThan(entryX)

  // A held press, not press(): Phaser's JustDown needs the key state to be
  // observable across an update frame, and press() can down+up inside one.
  await page.keyboard.down('KeyR')
  await page.waitForTimeout(150)
  await page.keyboard.up('KeyR')

  await expect.poll(() => playerX(page), { timeout: 3_000 }).toBe(entryX)
})
