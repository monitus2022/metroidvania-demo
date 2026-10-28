/**
 * mulberry32 — small, fast, and seedable.
 *
 * Determinism matters far more than statistical quality here: the fuzzer and
 * the replay test both need the same seed to produce the same stream forever.
 * Never use Math.random() inside the sim.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
