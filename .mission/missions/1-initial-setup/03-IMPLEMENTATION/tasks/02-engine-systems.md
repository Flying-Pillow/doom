---
dependsOn: ["implementation/01-browser-shell-verify"]
agent: "copilot-cli"
---

# Build Engine Systems

Implement the platform-facing engine systems in `src/engine/renderer.js`, `src/engine/input.js`, and `src/engine/audio.js`. Establish the WebGL-backed renderer setup and frame lifecycle, normalize keyboard and mouse input into gameplay actions, and expose explicit sound and music playback interfaces that gameplay code can call later. Keep this task centered on engine capabilities and interfaces rather than game-state rules or content authoring.
