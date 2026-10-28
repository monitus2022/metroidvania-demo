import { execFileSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

/*
 * A guard against committing things that must not be in the repo.
 *
 * Twice now a downloaded asset pack has been swept in by `git add -A`: the first
 * character pack, and then NightBorne. Both licences allow use in a project but
 * forbid redistribution, and this repo is public — so publishing the pack files
 * is the one thing the licence actually prohibits.
 *
 * `.gitignore` did not stop either one. It names packs explicitly, and a pack the
 * user drops in later has a name that is not on the list yet, so it shows up as
 * untracked and the next `git add -A` takes it. That is a by-name defence against
 * an open-ended set of names.
 *
 * This asserts the *shape* of the repo instead: every tracked path must sit under
 * a known directory. A stray pack at the root fails immediately, before the
 * commit is made, whatever it happens to be called.
 */

/** Directories that may contain tracked files. */
const ALLOWED_DIRS = ['src/', 'content/', 'tests/', 'tools/', 'public/']

/** Individual files allowed at the repo root. */
const ALLOWED_ROOT_FILES = new Set([
  '.gitignore',
  '.nvmrc',
  'DEPLOY.md',
  'PLAN.md',
  'README.md',
  'index.html',
  'package-lock.json',
  'package.json',
  'playwright.config.ts',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
  'wrangler.toml',
])

function trackedFiles(): string[] {
  return execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean)
}

describe('repo hygiene', () => {
  it('tracks nothing outside the expected directories', () => {
    const strays = trackedFiles().filter(
      (f) => !ALLOWED_DIRS.some((dir) => f.startsWith(dir)) && !ALLOWED_ROOT_FILES.has(f),
    )

    expect(
      strays,
      'These paths are tracked but live outside the allowed directories. If one is ' +
        'a downloaded asset pack, it must not be in a public repo: gitignore the ' +
        'folder, `git rm -r --cached` it, and vendor only the sheets the game loads ' +
        'under src/assets/.',
    ).toEqual([])
  })

  it('vendors only a small number of files under src/assets', () => {
    // The vendored sheets are deliberate and few. A jump here means a whole pack
    // has been added rather than the specific files the game loads.
    const assets = trackedFiles().filter((f) => f.startsWith('src/assets/'))
    expect(assets.length).toBeGreaterThan(0)
    expect(assets.length).toBeLessThan(40)
  })

  it('never tracks a raw pack directory by name', () => {
    const banned = ['characters packv2/', 'tileset wasteland/', 'nightborne/']
    const offenders = trackedFiles().filter((f) => banned.some((b) => f.toLowerCase().startsWith(b)))
    expect(offenders).toEqual([])
  })
})
