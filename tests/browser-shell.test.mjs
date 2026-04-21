import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspaceRoot = new URL("../", import.meta.url);
const indexHtmlUrl = new URL("index.html", workspaceRoot);
const mainJsUrl = new URL("src/main.js", workspaceRoot);
const rendererJsUrl = new URL("src/engine/renderer.js", workspaceRoot);
const inputJsUrl = new URL("src/engine/input.js", workspaceRoot);
const audioJsUrl = new URL("src/engine/audio.js", workspaceRoot);
const manifestJsUrl = new URL("src/assets/manifest.js", workspaceRoot);
const combatJsUrl = new URL("src/game/combat.js", workspaceRoot);
const enemiesJsUrl = new URL("src/game/enemies.js", workspaceRoot);
const levelsIndexJsUrl = new URL("src/game/levels/index.js", workspaceRoot);
const level01JsUrl = new URL("src/game/levels/level-01.js", workspaceRoot);
const level02JsUrl = new URL("src/game/levels/level-02.js", workspaceRoot);
const stateJsUrl = new URL("src/game/state.js", workspaceRoot);
const playerJsUrl = new URL("src/game/player.js", workspaceRoot);
const hudJsUrl = new URL("src/game/hud.js", workspaceRoot);
const gameCssUrl = new URL("src/styles/game.css", workspaceRoot);

class FakeEventTarget {
  #listeners = new Map();

  addEventListener(type, listener, options = {}) {
    const listeners = this.#listeners.get(type) ?? [];
    listeners.push({ listener, once: Boolean(options?.once) });
    this.#listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.#listeners.get(type) ?? [];
    this.#listeners.set(
      type,
      listeners.filter((entry) => entry.listener !== listener),
    );
  }

  dispatchEvent(event) {
    const listeners = [...(this.#listeners.get(event.type) ?? [])];

    for (const entry of listeners) {
      entry.listener.call(this, event);
      if (entry.once) {
        this.removeEventListener(event.type, entry.listener);
      }
    }
  }

  listenerCount(type) {
    return (this.#listeners.get(type) ?? []).length;
  }
}

class FakeWebGLContext {
  constructor() {
    this.COLOR_BUFFER_BIT = 0x4000;
    this.DEPTH_BUFFER_BIT = 0x0100;
    this.DEPTH_TEST = 0x0b71;
    this.LEQUAL = 0x0203;
    this.SCISSOR_TEST = 0x0c11;
    this.calls = [];
  }

  clearColor(...value) {
    this.calls.push(["clearColor", value]);
  }

  clearDepth(value) {
    this.calls.push(["clearDepth", value]);
  }

  enable(value) {
    this.calls.push(["enable", value]);
  }

  depthFunc(value) {
    this.calls.push(["depthFunc", value]);
  }

  viewport(...value) {
    this.calls.push(["viewport", value]);
  }

  scissor(...value) {
    this.calls.push(["scissor", value]);
  }

  clear(value) {
    this.calls.push(["clear", value]);
  }

  disable(value) {
    this.calls.push(["disable", value]);
  }
}

class FakeElement extends FakeEventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.parentElement = null;
    this.className = "";
    this.dataset = {};
    this.attributes = new Map();
    this.width = 300;
    this.height = 150;
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    this.append(...nodes);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "id") {
      this.id = String(value);
      this.ownerDocument.registerElement(this);
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  getBoundingClientRect() {
    const { width, height } = this.ownerDocument.viewport;
    return { width, height };
  }

  getContext(type) {
    if (this.tagName === "CANVAS" && (type === "webgl" || type === "experimental-webgl")) {
      return this.ownerDocument.webglContext;
    }

    return null;
  }

  requestPointerLock() {
    this.ownerDocument.pointerLockElement = this;
    this.ownerDocument.dispatchEvent({ type: "pointerlockchange" });
  }
}

class FakeDocument extends FakeEventTarget {
  constructor({ readyState = "complete", viewport = { width: 1280, height: 720 } } = {}) {
    super();
    this.readyState = readyState;
    this.viewport = viewport;
    this.elementsById = new Map();
    this.pointerLockElement = null;
    this.webglContext = new FakeWebGLContext();
    this.body = new FakeElement("body", this);
    this.body.setAttribute("id", "body");
  }

  createElement(tagName) {
    return new FakeElement(tagName, this);
  }

  getElementById(id) {
    return this.elementsById.get(id) ?? null;
  }

  registerElement(element) {
    if (element.id) {
      this.elementsById.set(element.id, element);
    }
  }

  exitPointerLock() {
    this.pointerLockElement = null;
    this.dispatchEvent({ type: "pointerlockchange" });
  }
}

class FakeWindow extends FakeEventTarget {
  constructor({ devicePixelRatio = 2 } = {}) {
    super();
    this.devicePixelRatio = devicePixelRatio;
    this.__DOOM_RUNTIME__ = undefined;
    this.animationFrameCallbacks = new Map();
    this.nextAnimationFrameId = 1;
  }

  requestAnimationFrame(callback) {
    const id = this.nextAnimationFrameId++;
    this.animationFrameCallbacks.set(id, callback);
    return id;
  }

  cancelAnimationFrame(id) {
    this.animationFrameCallbacks.delete(id);
  }

  runAnimationFrame(timestamp = 16) {
    const callbacks = [...this.animationFrameCallbacks.entries()];
    this.animationFrameCallbacks.clear();

    for (const [, callback] of callbacks) {
      callback(timestamp);
    }
  }
}

function createEnvironment({ readyState = "complete" } = {}) {
  const document = new FakeDocument({ readyState });
  const window = new FakeWindow();
  const app = document.createElement("div");
  app.setAttribute("id", "app");
  document.body.append(app);

  return { app, document, window };
}

async function importMainModule() {
  const [
    source,
    rendererSource,
    inputSource,
    audioSource,
    manifestSource,
    combatSource,
    enemiesSource,
    levelsIndexSource,
    level01Source,
    level02Source,
    stateSource,
    playerSource,
    hudSource,
  ] = await Promise.all([
    readFile(mainJsUrl, "utf8"),
    readFile(rendererJsUrl, "utf8"),
    readFile(inputJsUrl, "utf8"),
    readFile(audioJsUrl, "utf8"),
    readFile(manifestJsUrl, "utf8"),
    readFile(combatJsUrl, "utf8"),
    readFile(enemiesJsUrl, "utf8"),
    readFile(levelsIndexJsUrl, "utf8"),
    readFile(level01JsUrl, "utf8"),
    readFile(level02JsUrl, "utf8"),
    readFile(stateJsUrl, "utf8"),
    readFile(playerJsUrl, "utf8"),
    readFile(hudJsUrl, "utf8"),
  ]);
  const rendererUrl = createModuleUrl(rendererSource);
  const inputUrl = createModuleUrl(inputSource);
  const audioUrl = createModuleUrl(audioSource);
  const manifestUrl = createModuleUrl(manifestSource);
  const stateUrl = createModuleUrl(stateSource);
  const enemiesUrl = createModuleUrl(enemiesSource);
  const level01Url = createModuleUrl(level01Source);
  const level02Url = createModuleUrl(level02Source);
  const resolvedCombatUrl = createModuleUrl(
    combatSource.replace('"./state.js"', JSON.stringify(stateUrl)),
  );
  const playerUrl = createModuleUrl(playerSource.replace('"./state.js"', JSON.stringify(stateUrl)));
  const hudUrl = createModuleUrl(hudSource.replace('"./state.js"', JSON.stringify(stateUrl)));
  const levelsIndexUrl = createModuleUrl(
    levelsIndexSource
      .replace('"../../assets/manifest.js"', JSON.stringify(manifestUrl))
      .replace('"../state.js"', JSON.stringify(stateUrl))
      .replace('"./level-01.js"', JSON.stringify(level01Url))
      .replace('"./level-02.js"', JSON.stringify(level02Url)),
  );
  const rewrittenSource = source
    .replace('"./assets/manifest.js"', JSON.stringify(manifestUrl))
    .replace('"./game/combat.js"', JSON.stringify(resolvedCombatUrl))
    .replace('"./game/enemies.js"', JSON.stringify(enemiesUrl))
    .replace('"./engine/renderer.js"', JSON.stringify(rendererUrl))
    .replace('"./engine/input.js"', JSON.stringify(inputUrl))
    .replace('"./engine/audio.js"', JSON.stringify(audioUrl))
    .replace('"./game/hud.js"', JSON.stringify(hudUrl))
    .replace('"./game/levels/index.js"', JSON.stringify(levelsIndexUrl))
    .replace('"./game/player.js"', JSON.stringify(playerUrl))
    .replace('"./game/state.js"', JSON.stringify(stateUrl));
  const moduleUrl = createModuleUrl(rewrittenSource);
  return import(moduleUrl);
}

function createModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(`${source}\n// ${Date.now()}-${Math.random()}`).toString("base64")}`;
}

function withDomGlobals(environment, callback) {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousHTMLElement = globalThis.HTMLElement;

  globalThis.window = environment.window;
  globalThis.document = environment.document;
  globalThis.HTMLElement = FakeElement;

  return Promise.resolve()
    .then(callback)
    .finally(() => {
      globalThis.window = previousWindow;
      globalThis.document = previousDocument;
      globalThis.HTMLElement = previousHTMLElement;
    });
}

function getHudSlotNames(hudLayer) {
  return hudLayer.children.flatMap((row) =>
    row.children.map((slot) => slot.dataset.hudSlot),
  );
}

test("index.html wires the stylesheet and module bootstrap entrypoint", async () => {
  const html = await readFile(indexHtmlUrl, "utf8");

  assert.match(
    html,
    /<link\s+rel="stylesheet"\s+href="\.\/src\/styles\/game\.css">/i,
  );
  assert.match(
    html,
    /<script\s+type="module"\s+src="\.\/src\/main\.js"><\/script>/i,
  );
  assert.match(html, /<div\s+id="app"><\/div>/i);
});

test("game.css defines a full-viewport stage with an absolute HUD overlay", async () => {
  const css = await readFile(gameCssUrl, "utf8");

  assert.match(css, /\.game-stage\s*\{[\s\S]*position:\s*relative;[\s\S]*width:\s*100vw;[\s\S]*height:\s*100vh;/);
  assert.match(css, /\.game-canvas\s*\{[\s\S]*width:\s*100%;[\s\S]*height:\s*100%;/);
  assert.match(css, /\.hud-layer\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*0;[\s\S]*z-index:\s*1;[\s\S]*pointer-events:\s*none;/);
});

test("bootFromDocument mounts the shell immediately when the document is ready", async () => {
  const environment = createEnvironment({ readyState: "complete" });

  await withDomGlobals(environment, async () => {
    const module = await importMainModule();
    const runtime = environment.window.__DOOM_RUNTIME__;

    assert.equal(typeof module.startGame, "function");
    assert.equal(typeof module.bootFromDocument, "function");
    assert.ok(runtime);
    assert.equal(runtime.canvas.className, "game-canvas");
    assert.equal(typeof runtime.renderer.beginFrame, "function");
    assert.equal(typeof runtime.input.consumeFrameInput, "function");
    assert.equal(typeof runtime.audio.playSound, "function");
    assert.equal(runtime.state.currentLevelId, "level-01");
    assert.equal(runtime.state.player.weaponId, "pistol");
    assert.equal(runtime.hudLayer.className, "hud-layer");
    assert.equal(runtime.canvas.width, 2560);
    assert.equal(runtime.canvas.height, 1440);
    assert.equal(environment.window.listenerCount("resize"), 1);

    environment.window.runAnimationFrame(16);
    assert.equal(runtime.renderer.getFrameState().frame, 1);
    assert.equal(runtime.renderer.getFrameState().hud.health.value, "100");
    assert.equal(runtime.renderer.getFrameState().worldRenderSummary.levelId, "level-01");
    assert.ok(runtime.renderer.getFrameState().worldRenderSummary.visibleSpriteCount >= 1);
    assert.equal(runtime.canvas.dataset.renderStatus, "scene-ready");

    const shell = environment.app.children[0];
    const stage = shell.children[0];
    const [canvas, hudLayer] = stage.children;

    assert.equal(shell.className, "game-shell");
    assert.equal(stage.className, "game-stage");
    assert.equal(canvas.className, "game-canvas");
    assert.equal(hudLayer.className, "hud-layer");
      assert.deepEqual(getHudSlotNames(hudLayer), [
        "mission",
        "status",
        "health",
        "armor",
        "ammo",
        "keys",
      ]);
      assert.equal(hudLayer.children[0].children[0].textContent, "Mission: Secure the hangar lift");
      assert.equal(hudLayer.children[1].children[2].textContent, "Ammo: 50 BUL");

      environment.document.viewport = { width: 960, height: 540 };
      environment.window.dispatchEvent({ type: "resize" });
     assert.equal(runtime.canvas.width, 1920);
     assert.equal(runtime.canvas.height, 1080);

     runtime.stop();
     assert.equal(environment.window.listenerCount("resize"), 0);
     assert.equal(environment.document.listenerCount("pointerlockchange"), 0);
     assert.equal(runtime.canvas.listenerCount("mousemove"), 0);
   });
 });

test("module bootstrap waits for DOMContentLoaded when the document is still loading", async () => {
  const environment = createEnvironment({ readyState: "loading" });

  await withDomGlobals(environment, async () => {
    await importMainModule();

    assert.equal(environment.window.__DOOM_RUNTIME__, undefined);
    assert.equal(environment.document.getElementById("app").children.length, 0);

    environment.document.readyState = "complete";
    environment.document.dispatchEvent({ type: "DOMContentLoaded" });

    const runtime = environment.window.__DOOM_RUNTIME__;
    assert.ok(runtime);
    assert.equal(runtime.canvas.width, 2560);
    assert.equal(runtime.canvas.height, 1440);
    assert.equal(typeof runtime.renderer.resize, "function");
    assert.equal(typeof runtime.input.start, "function");
    assert.equal(typeof runtime.audio.playMusic, "function");
    assert.equal(runtime.state.currentLevelId, "level-01");
    assert.equal(runtime.state.player.health, 100);
    assert.deepEqual(getHudSlotNames(runtime.hudLayer), [
      "mission",
      "status",
      "health",
      "armor",
      "ammo",
      "keys",
    ]);

    runtime.stop();
  });
});
