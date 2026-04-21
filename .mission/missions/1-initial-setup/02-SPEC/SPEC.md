---
title: "SPEC: #1 - Initial setup"
artifact: "spec"
createdAt: "2026-04-21T18:43:15.479Z"
updatedAt: "2026-04-21T19:00:10.566Z"
stage: "spec"
---

Branch: mission/1-initial-setup

## Architecture

- Build a browser-first single-page game shell with a full-viewport `<canvas>` mounted from `index.html` and driven by JavaScript modules. The first implementation target is a playable retro-FPS slice rather than a full content-complete game.
- Use a WebGL-backed renderer as the core rendering path so the project can target smooth 1920x1080 presentation in the browser. Any helper library chosen later must still preserve direct access to high-performance rendering and browser input/audio APIs.
- Organize runtime code into a small set of gameplay systems: bootstrapping, render loop, input, player movement, weapon firing, enemy updates, collision/damage resolution, level state, HUD, and audio playback.
- Build the runtime around a reusable level pipeline from the start: each level should be loaded from structured data, and the first implementation pass should prove the full loop of spawn, movement, shooting, enemy pressure, keycard collection, gate unlock, level exit, and transition into the next stage. That keeps the design aligned with the PRD's multi-level requirement instead of locking the project into a one-off demo.
- Represent world content as explicit game data modules so levels, enemy placements, pickups, and exit conditions can expand without rewriting the engine shell.
- Keep assets and content boundaries separate from engine code: rendering/input/update orchestration lives in engine modules, while Doom-inspired content definitions, encounter tuning, audio selections, and level layouts live in game modules or asset folders.
- Defer advanced polish work such as a full weapon roster, complex AI variants, save systems, multiplayer, and final asset production. The design target is the minimum architecture that can grow into the PRD scope without locking the project into a throwaway prototype.
- The implementation target is desktop browser play with keyboard and mouse as the primary control scheme. Mobile-specific controls, touch UX, and controller support are not required in this initial specification.

## Signatures

- `startGame(rootElement: HTMLElement): GameRuntime` — boots the canvas, renderer, systems, and main loop from the browser entrypoint.
- `createRenderer(canvas: HTMLCanvasElement): Renderer` — owns WebGL setup, resize behavior, frame begin/end, world draw calls, and HUD compositing hooks.
- `createInputController(target: EventTarget): InputController` — normalizes keyboard and mouse input into movement, aim, fire, and interact actions.
- `createGameState(): GameState` — stores player state, active level, enemies, pickups, doors, projectiles, HUD values, and mission progress.
- `loadLevel(levelId: string): LevelDefinition` — returns static level data including geometry/layout references, spawn points, keys, exits, and encounter placements.
- `updatePlayer(state: GameState, input: InputSnapshot, deltaMs: number): void` — applies movement, aiming, weapon usage, and interactions.
- `updateEnemies(state: GameState, deltaMs: number): void` — advances enemy behavior, pursuit, attacks, and death state transitions.
- `resolveCombat(state: GameState, deltaMs: number): void` — handles hitscan/projectile resolution, health changes, pickups, and door/key progression.
- `renderFrame(renderer: Renderer, state: GameState, alpha: number): void` — renders the current world and HUD state each frame.
- `playSound(effectId: string): void` and `playMusic(trackId: string): void` — provide explicit audio triggers for combat, pickups, doors, ambience, and background music.

Core data shapes:

- `GameRuntime` — `{ canvas, renderer, input, state, start(), stop() }`
- `GameState` — `{ player, currentLevelId, enemies, pickups, doors, projectiles, objectiveState, hudState }`
- `LevelDefinition` — `{ id, playerSpawn, enemySpawns, pickups, doors, exit, keyRequirements }`
- `PlayerState` — `{ position, rotation, velocity, health, armor, ammo, weaponId, keys }`
- `EnemyState` — `{ id, type, position, health, aiState, alertState }`

## File Matrix

- `index.html` — browser entry shell that hosts the canvas and loads the JavaScript game entrypoint.
- `src/main.js` — application bootstrap that creates the runtime and starts the game loop.
- `src/engine/renderer.js` — WebGL initialization, frame lifecycle, camera/view handling, and draw orchestration.
- `src/engine/input.js` — keyboard/mouse capture and action-state normalization.
- `src/engine/audio.js` — sound effect and music playback interface for gameplay events.
- `src/game/state.js` — central game-state creation and shared runtime data structures.
- `src/game/player.js` — player movement, aiming, firing, health, and interaction logic.
- `src/game/enemies.js` — enemy update logic, attacks, and death handling.
- `src/game/combat.js` — damage resolution, projectile or hitscan rules, and pickup effects.
- `src/game/levels/level-01.js` — first playable level definition covering traversal, combat, keycard, and exit flow.
- `src/game/levels/level-02.js` — second level definition used to prove that progression is data-driven rather than hard-coded to a single map.
- `src/game/levels/index.js` — level registry used by the runtime to load levels by ID.
- `src/game/hud.js` — ammo, health, armor, keycard, and objective display logic.
- `src/styles/game.css` — minimal page styling for full-screen presentation and HUD layering.
- `src/assets/manifest.js` — explicit asset manifest that maps texture, sprite, weapon, sound, and music identifiers to browser-loadable files.

Boundaries:

- This spec targets browser HTML + JavaScript only; no native wrapper, backend service, or non-web runtime is part of the design.
- Rendering must remain WebGL-class and performance-oriented; a DOM-only or CSS-only rendering approach is out of scope.
- The implementation target is a reusable gameplay foundation that can support multiple levels, not a fake mockup, menu-only prototype, or single-map dead end.
- Final content scale, advanced enemy variety, and full production asset coverage are intentionally deferred beyond this specification stage.
