# Afterlight — playable Mac prototype

Authorized by Chris: turn the proposed Afterlight game into an incredible-looking, playable 3D Electron Mac app.

Success: packaged local Afterlight.app launches offline; true perspective 3D board can orbit/zoom; legal moves preview and animate; all eight sparks update simultaneously; human can play an AI or local opponent; scores, draw/win, new game, undo, help and sound controls work. Verify rules with deterministic tests and the actual native window visually and interactively.

Scope: the previously proposed 6×6 two-state routing game, eight neutral sparks, amber west goal and blue east goal, first five wins (4–4 draw). Every turn flips one unoccupied tile or passes, then all sparks route, visited switches flip by visit parity, north/south reflect. Fixed symmetric opening; threefold repetition draws. AI is local search, not an online service. Gameplay balance is experimental.

Design: sculptural dark ceramic board floating above a muted midnight-blue studio floor. Frosted pale channels, luminous white sparks with tails, amber and glacial-blue collectors. Quiet interface with oversized restrained Avenir Next typography, numbered coordinates, compact turn/score rail. Palette: ink #09111c, slate #172638, ivory #eef3ed, amber #f0b769, ice #8dd4ed. Signature: light physically flowing through curved, self-turning channels. Board occupies most of window; left identity/score and right turn controls remain secondary. No marketing landing page.

Build: pure JS deterministic engine + tests; Three.js scene; vanilla renderer UI; isolated Electron shell; local macOS app bundle. Parent owns shell/UI/package, engine specialist owns engine/test, scene specialist owns scene. No unrelated repo changes. Validate build, rules, AI complete games, UI with Electron Playwright, native screenshot by window id. Stop only on destructive external changes, which are out of scope.

## Module contract
State: { tiles: number[36] (0 or 1), sparks: {id:number,row:number,col:number,entry:number}[], scores:[number,number], turn:0|1, ply:number, winner:null|0|1|'draw', repetitions: object }.
Directions 0=N,1=E,2=S,3=W. Index row*6+col. Side 0=amber/west,1=blue/east.
engine.js exports createGame(), legalMoves(state) => (number|null)[], applyMove(state, indexOrNull) => {state,events}, chooseMove(state,{depth?,difficulty?}={}) => number|null, exitFor(tile,entry), positionKey(state).
Events {id, from:{row,col,entry}, exit:number, to:{row,col,entry}|null, score:0|1|null, reflected:boolean} for every original spark. State is immutable. Invalid moves throw.
scene.js exports createScene(container,{onTile,onHover}): {setState(state), setSelection(index|null), setPreview(result|null), animateMove(before,result,selected,{duration?}={})=>Promise, resetCamera(), setTopView(boolean), setReducedMotion(boolean), dispose(), getTileScreenPosition(index)=>{x,y}}. Coordinates returned relative to viewport. UI owns commit and state; scene only renders. onTile(index), onHover(index|null).

## Authorized spectator addition

Chris requested Watch AI: two computer players, live strategic explanations in a modal while they play. Implemented as a nonblocking commentary dialog beside the 3D field so camera interaction stays available. Commentary comes from actual routing and counterfactual next-advance results. Pause/resume, single-step, reading pace, replay and return-to-original-game are required; watcher moves must never replace the saved human game.

Spectator pacing correction: Chris explicitly requested slow, followable playback. Default is now Read along (automatic): 150 words/minute plus two seconds, clamped to 15–30 seconds before each move. Tests use explicit fast mode or single-stepping; those timings do not alter the normal default.
