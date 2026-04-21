---
dependsOn: ["spec/02-plan"]
agent: "copilot-cli"
---

# Build Browser Shell

Implement the browser entry shell for the game slice. Create and wire `index.html`, `src/main.js`, and `src/styles/game.css` so the project boots from the browser, mounts a full-viewport canvas, and establishes the base page and HUD layering structure needed by the runtime. Keep this task focused on shell and bootstrap concerns; do not implement renderer internals, gameplay systems, or level content here.
