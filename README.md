# Afterlight

A local Mac strategy game played on a three-dimensional field of self-turning tracks. Built as an Electron app with Three.js, with a deterministic engine and an offline search opponent.

## Play

Open `/Applications/Afterlight.app`. Click an empty tile to preview its turn, then choose **Turn & advance**. Drag to orbit, scroll to zoom, or use **Top view**. Amber collects at the west edge and blue at the east. First to five sparks wins; 4–4 or threefold repetition draws.

Every move advances all sparks through one tile. Each spark turns the tile it just used. Even numbers of simultaneous visitors cancel the turn. Occupied tiles cannot be manually changed; top and bottom walls reflect. A pass advances the field without a manual turn.

The app includes three computer strengths, two-player local mode, undo, local autosave, optional sound, reduced motion, keyboard tile selection, and a rules guide. **Watch AI** starts a separate computer-versus-computer match with a live commentary dialog, pause/resume, single-step and reading pace controls. Watching defaults to 15–30 seconds of reading time per move, adjusted to the commentary length; faster speeds are optional. Commentary explains observable tactical consequences of each chosen move; your original game is restored when you stop watching. The rules and opening are an experimental first edition; competitive balance is unproven.

## Develop

Requires Node 22.12+ and npm. All rendering assets are bundled or procedural; gameplay has no network dependency.

```sh
npm install
npx install-electron
npm start
```

```sh
npm test          # rules, invariants, AI and complete simulations
npm run test:app  # native Electron gameplay, save/undo, input and full game
npm run test:watch # spectator match, commentary, pause/step and saved-game isolation
npm run package  # Apple Silicon .app in release/mac-arm64/
```

The local bundle is not notarized for public distribution. `src/engine.js` owns immutable rules; `src/scene.js` renders and animates them; `src/main.js` coordinates the UI and saves. The computer runs in a worker. No backend or accounts.

Verification results and screenshots are in `test/artifacts/`. The Electron app uses a sandboxed renderer with no Node integration and a local-only custom protocol. Runtime security configuration follows the [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).
