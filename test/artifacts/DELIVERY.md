# Afterlight local Mac delivery

Installed: `/Applications/Afterlight.app` (Apple Silicon, local ad hoc signature verified).
Source: `/Users/chrisdimarco/Projects/afterlight`.
App version: 0.1.0.
Packaged app.asar SHA-256: `aebbab5e44916ea984a7a613e1a7fa25e7eb447fae8482029e49e5c1049e89e8`.

Verified on the installed bundle with browser networking disabled:
- 15 native acceptance checks including a complete 26-move game, exact engine agreement after every turn, real worker AI reply, mouse selection, occupied protection, orbit/top/reset camera, sound toggle, undo, save/reload, replay and minimum window.
- 10 spectator lifecycle checks including a full AI match, default 15–30 second adaptive reading pace, distinct side commentary, pause/resume, single step, pace, replay, human-save isolation, reload recovery and returning during an animation.
- 23 engine/commentary tests pass.
- Independent code reviews passed; forecast text and coordinate issues found during review were fixed before packaging.
- Native app screenshots inspected for genuine 3D, readable board and commentary panel.

Receipts: `acceptance.json`, `spectator-acceptance.json`, and PNG screenshots in this directory.

Limits: experimental competitive balance; computer is bounded local search; commentary describes observable tactical facts and counterfactuals, not an LLM's private reasoning. Local Mac build is not notarized for public distribution.
