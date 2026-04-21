---
dependsOn: ["implementation/02-engine-systems-verify"]
agent: "copilot-cli"
---

# Build Player State And HUD

Implement the core runtime state and player-facing loop in `src/game/state.js`, `src/game/player.js`, and `src/game/hud.js`. Define the shared game-state structures from the spec, add player movement/aim/fire/interact handling against that state, and provide HUD logic for health, armor, ammo, keys, and objective display. Keep this task focused on state ownership and player/HUD behavior, not enemy AI or level progression content.
