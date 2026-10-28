# Character sprites — provenance and licence

Source: **"Characters Pack" by Dreamir** — https://dreamir.itch.io/characters-pack
(the `Characters PackV2` download, which splits animations into separate sheets).

Licence, verbatim from the pack page:

> This asset pack can be used in both free and commercial projects. You can
> modify it to suit your own needs. Credit is not necessary, but appreciated.
> You may not redistribute it or resell it.

## What that means for this repo

Using the sprites in the game is explicitly allowed. **This repository is public,
and committing the pack's raw files is closer to "redistributing the pack" than
to "using it in a project".** Two safe options:

1. keep the repository private (Cloudflare Pages deploys fine from a private repo), or
2. ask the author for permission to vendor the sheets in a public repo.

Either way, credit is cheap — link the pack in the game's README.

## Only three sheets are vendored

`Idle`, `Run`, `Jump` — the animations the game currently uses. The rest of the
pack (attacks, block, spells, wall climb, slide, death) stays out of the repo
until it is actually needed.

Note for anyone swapping in the **male** character: his sheets are **64×64**
frames; the woman's are **80×64**. Do not copy one config to the other.
