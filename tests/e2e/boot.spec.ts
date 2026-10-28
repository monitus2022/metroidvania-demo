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

/**
 * M0 acceptance: the *built* bundle boots in a real browser, responds to real
 * synthetic key events, and produces a screenshot artifact for vision review.
 */
test('boots the built bundle, responds to keys, and screenshots', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/')
  await expect.poll(() => isReady(page), { timeout: 15_000 }).toBe(true)

  // The sim must advance on its own (gravity needs no input).
  await expect.poll(() => tickCount(page), { timeout: 5_000 }).toBeGreaterThan(10)

  const before = await playerX(page)

  await page.keyboard.down('ArrowRight')
  await page.waitForTimeout(700)
  await page.keyboard.up('ArrowRight')

  const after = await playerX(page)
  expect(after).toBeGreaterThan(before)

  expect(errors).toEqual([])

  await page.screenshot({ path: 'artifacts/m0-boot.png' })
})

test('jump input leaves the ground', async ({ page }) => {
  await page.goto('/')
  await expect.poll(() => isReady(page), { timeout: 15_000 }).toBe(true)
  await expect.poll(() => onGround(page), { timeout: 5_000 }).toBe(true)

  await page.keyboard.down('Space')
  await expect.poll(() => onGround(page), { timeout: 3_000 }).toBe(false)
  await page.keyboard.up('Space')
})

/**
 * Regression guard: keys must *release*. A binding that only sets isDown on
 * keydown (an event-handler hack) would leave the player accelerating forever.
 */
test('releasing a movement key brings the player to rest', async ({ page }) => {
  await page.goto('/')
  await expect.poll(() => isReady(page), { timeout: 15_000 }).toBe(true)
  await expect.poll(() => onGround(page), { timeout: 5_000 }).toBe(true)

  await page.keyboard.down('KeyD')
  await expect.poll(() => velX(page), { timeout: 3_000 }).toBeGreaterThan(0)
  await page.keyboard.up('KeyD')

  await expect.poll(() => velX(page), { timeout: 3_000 }).toBe(0)
})
