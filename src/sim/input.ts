/**
 * Input is a per-frame bitmask rather than a live key-state read.
 *
 * This is what makes replay possible: record one mask per tick, and feeding the
 * same mask sequence back through `step` must produce a byte-identical state.
 * The M1 replay test asserts exactly that.
 */

export const BTN = {
  LEFT: 1 << 0,
  RIGHT: 1 << 1,
  JUMP: 1 << 2,
  ATTACK: 1 << 3,
} as const

export type InputMask = number

export const held = (mask: InputMask, btn: number): boolean => (mask & btn) !== 0

/** Horizontal intent: -1 left, 1 right, 0 neither/both. */
export function axisX(mask: InputMask): -1 | 0 | 1 {
  const l = held(mask, BTN.LEFT)
  const r = held(mask, BTN.RIGHT)
  if (l === r) return 0
  return l ? -1 : 1
}
