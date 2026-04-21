import { ASSET_MANIFEST } from "./assets/manifest.js";
import { resolveCombat } from "./game/combat.js";
import { updateEnemies } from "./game/enemies.js";
import { createAudioSystem } from "./engine/audio.js";
import { createInputController } from "./engine/input.js";
import { createRenderer } from "./engine/renderer.js";
import { syncHudState, renderHudLayer } from "./game/hud.js";
import { createLevelState, DEFAULT_LEVEL_ID, updateLevelProgression } from "./game/levels/index.js";
import { updatePlayer } from "./game/player.js";

const HUD_ROWS = [
  ["mission", "status"],
  ["health", "armor", "ammo", "keys"],
];

function createHudLayer(documentRef) {
  const hudLayer = documentRef.createElement("div");
  hudLayer.className = "hud-layer";
  hudLayer.setAttribute("aria-label", "Game heads-up display");

  for (const rowSlots of HUD_ROWS) {
    const row = documentRef.createElement("div");
    row.className = "hud-row";

    for (const slotName of rowSlots) {
      const slot = documentRef.createElement("div");
      slot.className = "hud-slot";
      slot.dataset.hudSlot = slotName;
      slot.dataset.hudLabel = slotName;
      row.append(slot);
    }

    hudLayer.append(row);
  }

  return hudLayer;
}

function createStartupErrorLayer(documentRef, message) {
  const errorLayer = documentRef.createElement("div");
  errorLayer.className = "startup-error";
  errorLayer.setAttribute("role", "alert");
  errorLayer.textContent = `Renderer failed to start: ${message}`;
  return errorLayer;
}

function resolveAnimationClock(windowRef) {
  if (typeof windowRef.requestAnimationFrame === "function" && typeof windowRef.cancelAnimationFrame === "function") {
    return {
      requestFrame: windowRef.requestAnimationFrame.bind(windowRef),
      cancelFrame: windowRef.cancelAnimationFrame.bind(windowRef),
    };
  }

  return {
    requestFrame: null,
    cancelFrame: null,
  };
}

function syncRuntimeHud(runtime) {
  syncHudState(runtime.state);
  renderHudLayer(runtime.hudLayer, runtime.state.hudState);
}

function playLevelMusic(runtime, levelId, playbackOptions = {}) {
  if (runtime.audio.getPlaybackState().backendAvailable !== true) {
    return;
  }

  const trackId = ASSET_MANIFEST.levels[levelId]?.musicTrackId;

  if (typeof trackId === "string" && trackId in ASSET_MANIFEST.music) {
    runtime.audio.playMusic(trackId, playbackOptions);
  }
}

function renderRuntimeFrame(runtime, timestamp = 0) {
  const frameState = runtime.renderer.beginFrame({ timestamp });
  const previousLevelId = runtime.state.currentLevelId;
  const inputSnapshot = runtime.input.consumeFrameInput();

  updatePlayer(runtime.state, inputSnapshot, frameState.deltaMs);
  updateEnemies(runtime.state, frameState.deltaMs);
  resolveCombat(runtime.state, frameState.deltaMs);
  runtime.state = updateLevelProgression(runtime.state);
  syncRuntimeHud(runtime);

  if (runtime.state.currentLevelId !== previousLevelId) {
    playLevelMusic(runtime, runtime.state.currentLevelId, { restart: true });
  }

  runtime.renderer.drawWorld(runtime.state);
  runtime.renderer.drawHud(runtime.state.hudState);
  runtime.renderer.endFrame();
}

export function startGame(rootElement) {
  if (!(rootElement instanceof HTMLElement)) {
    throw new TypeError("startGame expected a root HTMLElement.");
  }

  const documentRef = rootElement.ownerDocument;
  const shell = documentRef.createElement("div");
  shell.className = "game-shell";

  const stage = documentRef.createElement("div");
  stage.className = "game-stage";

  const canvas = documentRef.createElement("canvas");
  canvas.className = "game-canvas";
  canvas.setAttribute("aria-label", "Game viewport");

  const hudLayer = createHudLayer(documentRef);

  stage.append(canvas, hudLayer);
  shell.append(stage);
  rootElement.replaceChildren(shell);

  let renderer;
  try {
    renderer = createRenderer(canvas, { preferredBackend: "2d" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    canvas.dataset.renderStatus = "startup-error";
    canvas.dataset.renderError = message;
    stage.append(createStartupErrorLayer(documentRef, message));
    throw error;
  }

  const input = createInputController(window, {
    pointerTarget: canvas,
    documentRef,
  });
  const audio = createAudioSystem({ manifest: ASSET_MANIFEST });
  const { requestFrame, cancelFrame } = resolveAnimationClock(window);

  let running = false;
  let animationFrameId = null;

  const handleResize = () => {
    renderer.resize();
  };

  const frame = (timestamp) => {
    if (!running) {
      return;
    }

    renderRuntimeFrame(runtime, timestamp);

    if (requestFrame) {
      animationFrameId = requestFrame(frame);
    }
  };

  const runtime = {
    canvas,
    renderer,
    input,
    audio,
    state: createLevelState(DEFAULT_LEVEL_ID),
    hudLayer,
    start() {
      if (running) {
        return runtime;
      }

      running = true;
      input.start();
      handleResize();
      renderRuntimeFrame(runtime, 0);
      playLevelMusic(runtime, runtime.state.currentLevelId);
      window.addEventListener("resize", handleResize);

      if (requestFrame) {
        animationFrameId = requestFrame(frame);
      }

      return runtime;
    },
    stop() {
      if (!running) {
        return runtime;
      }

      running = false;
      window.removeEventListener("resize", handleResize);
      input.stop();

      if (animationFrameId !== null && cancelFrame) {
        cancelFrame(animationFrameId);
        animationFrameId = null;
      }

      return runtime;
    },
  };

  return runtime.start();
}

export function bootFromDocument() {
  const rootElement = document.getElementById("app");

  if (!(rootElement instanceof HTMLElement)) {
    throw new Error("Expected #app to exist before bootstrapping the game.");
  }

  return startGame(rootElement);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      window.__DOOM_RUNTIME__ = bootFromDocument();
    }, { once: true });
  } else {
    window.__DOOM_RUNTIME__ = bootFromDocument();
  }
}
