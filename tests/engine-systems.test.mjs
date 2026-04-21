import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspaceRoot = new URL("../", import.meta.url);
const rendererJsUrl = new URL("src/engine/renderer.js", workspaceRoot);
const inputJsUrl = new URL("src/engine/input.js", workspaceRoot);
const audioJsUrl = new URL("src/engine/audio.js", workspaceRoot);

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

class FakeAudio {
  constructor() {
    this.src = "";
    this.preload = "";
    this.loop = false;
    this.volume = 1;
    this.currentTime = 0;
    this.paused = true;
    this.listeners = new Map();
  }

  addEventListener(type, listener, options = {}) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ listener, once: Boolean(options?.once) });
    this.listeners.set(type, listeners);
  }

  dispatch(type) {
    const listeners = [...(this.listeners.get(type) ?? [])];

    for (const entry of listeners) {
      entry.listener();

      if (entry.once) {
        this.listeners.set(
          type,
          (this.listeners.get(type) ?? []).filter((item) => item.listener !== entry.listener),
        );
      }
    }
  }

  play() {
    this.paused = false;
    return Promise.resolve();
  }

  pause() {
    this.paused = true;
  }
}

async function importModule(url) {
  const source = await readFile(url, "utf8");
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(`${source}\n// ${Date.now()}-${Math.random()}`).toString("base64")}`;
  return import(moduleUrl);
}

test("createRenderer initializes WebGL, resizes the canvas, and tracks frame state", async () => {
  const { createRenderer } = await importModule(rendererJsUrl);
  const gl = new FakeWebGLContext();
  const canvas = {
    width: 320,
    height: 200,
    getBoundingClientRect() {
      return { width: 1280, height: 720 };
    },
    getContext(type) {
      return type === "webgl" ? gl : null;
    },
  };

  const renderer = createRenderer(canvas, {
    getDevicePixelRatio: () => 2,
  });

  assert.equal(canvas.width, 2560);
  assert.equal(canvas.height, 1440);
  assert.deepEqual(renderer.getViewport(), {
    width: 2560,
    height: 1440,
    aspectRatio: 2560 / 1440,
  });

  const firstFrame = renderer.beginFrame({ timestamp: 16 });
  const worldSummary = renderer.drawWorld({
    currentLevelId: "level-01",
    player: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { yaw: 0, pitch: 0, roll: 0 },
      weaponId: "pistol",
    },
    enemies: [
      {
        id: "trooper-1",
        type: "trooper",
        health: 20,
        position: { x: 0, y: 0, z: 8 },
      },
    ],
    pickups: [
      {
        id: "blue-key",
        kind: "key",
        color: "blue",
        position: { x: 2, y: 0, z: 12 },
      },
    ],
    doors: [
      {
        id: "exit-door",
        kind: "exit",
        locked: true,
        position: { x: 0, y: 0, z: 16 },
      },
    ],
  });
  renderer.drawHud({ health: 100 });
  const finishedFrame = renderer.endFrame();

  assert.equal(firstFrame.deltaMs, 0);
  assert.deepEqual(finishedFrame, {
    frame: 0,
    world: {
      currentLevelId: "level-01",
      player: {
        position: { x: 0, y: 0, z: 0 },
        rotation: { yaw: 0, pitch: 0, roll: 0 },
        weaponId: "pistol",
      },
      enemies: [
        {
          id: "trooper-1",
          type: "trooper",
          health: 20,
          position: { x: 0, y: 0, z: 8 },
        },
      ],
      pickups: [
        {
          id: "blue-key",
          kind: "key",
          color: "blue",
          position: { x: 2, y: 0, z: 12 },
        },
      ],
      doors: [
        {
          id: "exit-door",
          kind: "exit",
          locked: true,
          position: { x: 0, y: 0, z: 16 },
        },
      ],
    },
    hud: { health: 100 },
  });
  assert.equal(worldSummary.levelId, "level-01");
  assert.ok(worldSummary.visibleSpriteCount >= 3);
  assert.ok(gl.calls.some(([name]) => name === "viewport"));
  assert.ok(gl.calls.some(([name]) => name === "clear"));
  assert.ok(gl.calls.some(([name]) => name === "scissor"));

  canvas.getBoundingClientRect = () => ({ width: 640, height: 360 });
  renderer.resize();

  assert.deepEqual(renderer.getViewport(), {
    width: 1280,
    height: 720,
    aspectRatio: 1280 / 720,
  });
});

test("createRenderer falls back to experimental WebGL and keeps default context attributes explicit", async () => {
  const { createRenderer } = await importModule(rendererJsUrl);
  const requestedContexts = [];
  const gl = new FakeWebGLContext();
  const canvas = {
    width: 320,
    height: 200,
    getBoundingClientRect() {
      return { width: 320, height: 200 };
    },
    getContext(type, attributes) {
      requestedContexts.push({ type, attributes });
      return type === "experimental-webgl" ? gl : null;
    },
  };

  const renderer = createRenderer(canvas);

  assert.equal(renderer.gl, gl);
  assert.deepEqual(
    requestedContexts.map(({ type }) => type),
    ["webgl", "experimental-webgl"],
  );
  assert.deepEqual(requestedContexts[0].attributes, {
    alpha: false,
    antialias: false,
    depth: true,
    desynchronized: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });
});

test("createInputController normalizes keyboard and mouse state into gameplay actions", async () => {
  const { createInputController } = await importModule(inputJsUrl);
  const keyboardTarget = new FakeEventTarget();
  const pointerTarget = new FakeEventTarget();
  const documentRef = new FakeEventTarget();
  documentRef.pointerLockElement = null;
  documentRef.exitPointerLock = () => {
    documentRef.pointerLockElement = null;
    documentRef.dispatchEvent({ type: "pointerlockchange" });
  };

  const controller = createInputController(keyboardTarget, {
    pointerTarget,
    documentRef,
  });

  controller.start();
  keyboardTarget.dispatchEvent({ type: "keydown", code: "KeyW", repeat: false, preventDefault() {} });
  keyboardTarget.dispatchEvent({ type: "keydown", code: "ShiftLeft", repeat: false, preventDefault() {} });
  keyboardTarget.dispatchEvent({ type: "keydown", code: "Digit2", repeat: false, preventDefault() {} });
  pointerTarget.dispatchEvent({ type: "mousemove", movementX: 12, movementY: -6 });
  pointerTarget.dispatchEvent({ type: "mousedown", button: 0, preventDefault() {} });
  pointerTarget.dispatchEvent({ type: "wheel", deltaY: 1, preventDefault() {} });
  documentRef.pointerLockElement = pointerTarget;
  documentRef.dispatchEvent({ type: "pointerlockchange" });

  const snapshot = controller.consumeFrameInput();

  assert.deepEqual(snapshot.move, { x: 0, y: 1 });
  assert.deepEqual(snapshot.look, { x: 12, y: -6 });
  assert.equal(snapshot.actions.fire, true);
  assert.equal(snapshot.actions.run, true);
  assert.equal(snapshot.weapon.next, true);
  assert.equal(snapshot.weapon.selectedSlot, 2);
  assert.equal(snapshot.meta.pointerLocked, true);
  assert.ok(snapshot.meta.pressedActions.includes("fire"));
  assert.ok(snapshot.meta.pressedActions.includes("moveForward"));
  assert.ok(snapshot.meta.pressedActions.includes("run"));

  pointerTarget.dispatchEvent({ type: "mouseup", button: 0, preventDefault() {} });
  keyboardTarget.dispatchEvent({ type: "keyup", code: "KeyW", preventDefault() {} });

  const releaseSnapshot = controller.consumeFrameInput();
  assert.equal(releaseSnapshot.actions.fire, false);
  assert.deepEqual(releaseSnapshot.look, { x: 0, y: 0 });
  assert.ok(releaseSnapshot.meta.releasedActions.includes("fire"));
  assert.ok(releaseSnapshot.meta.releasedActions.includes("moveForward"));

  controller.stop();
});

test("createInputController exposes pointer lock helpers and clears transient state on blur", async () => {
  const { createInputController } = await importModule(inputJsUrl);
  const keyboardTarget = new FakeEventTarget();
  const pointerTarget = new FakeEventTarget();
  const documentRef = new FakeEventTarget();
  documentRef.pointerLockElement = null;
  documentRef.exitPointerLock = () => {
    documentRef.pointerLockElement = null;
    documentRef.dispatchEvent({ type: "pointerlockchange" });
  };
  pointerTarget.requestPointerLock = () => {
    documentRef.pointerLockElement = pointerTarget;
    documentRef.dispatchEvent({ type: "pointerlockchange" });
  };

  const controller = createInputController(keyboardTarget, {
    pointerTarget,
    documentRef,
  });

  controller.start();
  assert.equal(keyboardTarget.listenerCount("blur"), 1);
  assert.equal(documentRef.listenerCount("pointerlockchange"), 1);

  controller.requestPointerLock();
  assert.equal(controller.getSnapshot().meta.pointerLocked, true);

  keyboardTarget.dispatchEvent({ type: "keydown", code: "ArrowRight", repeat: false, preventDefault() {} });
  pointerTarget.dispatchEvent({ type: "mousedown", button: 2, preventDefault() {} });
  pointerTarget.dispatchEvent({ type: "mousemove", movementX: 4, movementY: 3 });
  keyboardTarget.dispatchEvent({ type: "blur" });

  assert.deepEqual(controller.getSnapshot(), {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    turn: 0,
    actions: {
      fire: false,
      interact: false,
      run: false,
      pause: false,
    },
    weapon: {
      next: false,
      previous: false,
      selectedSlot: null,
      wheelStep: 0,
    },
    meta: {
      pointerLocked: true,
      pressedActions: [],
      releasedActions: [],
      mouseButtons: {
        primary: false,
        secondary: false,
        middle: false,
      },
    },
  });

  controller.releasePointerLock();
  assert.equal(controller.getSnapshot().meta.pointerLocked, false);

  controller.stop();
  assert.equal(keyboardTarget.listenerCount("blur"), 0);
  assert.equal(documentRef.listenerCount("pointerlockchange"), 0);
});

test("createAudioSystem exposes explicit sound and music playback controls", async () => {
  const { createAudioSystem } = await importModule(audioJsUrl);
  const createdPlayers = [];
  const audio = createAudioSystem({
    audioFactory: () => {
      const player = new FakeAudio();
      createdPlayers.push(player);
      return player;
    },
    masterVolume: 0.5,
    soundVolume: 0.8,
    musicVolume: 0.6,
  });

  audio.registerSound("shotgun", { src: "/audio/shotgun.wav", volume: 0.5 });
  audio.registerMusic("e1m1", { src: "/audio/e1m1.ogg", volume: 0.75 });

  const soundPlayer = audio.playSound("shotgun");
  const musicPlayer = audio.playMusic("e1m1");

  assert.equal(soundPlayer.src, "/audio/shotgun.wav");
  assert.equal(soundPlayer.loop, false);
  assert.equal(soundPlayer.volume, 0.2);
  assert.equal(musicPlayer.src, "/audio/e1m1.ogg");
  assert.equal(musicPlayer.loop, true);
  assert.ok(Math.abs(musicPlayer.volume - 0.225) < 1e-12);
  assert.deepEqual(audio.getPlaybackState(), {
    backendAvailable: true,
    activeSoundCount: 1,
    currentMusicTrackId: "e1m1",
    masterVolume: 0.5,
    soundVolume: 0.8,
    musicVolume: 0.6,
  });

  soundPlayer.dispatch("ended");
  assert.equal(audio.getPlaybackState().activeSoundCount, 0);

  audio.stopAll();
  assert.equal(musicPlayer.paused, true);
  assert.equal(audio.getPlaybackState().currentMusicTrackId, null);
});

test("createAudioSystem keeps explicit playback APIs stable across volume and restart controls", async () => {
  const { createAudioSystem } = await importModule(audioJsUrl);
  const createdPlayers = [];
  const audio = createAudioSystem({
    manifest: {
      sounds: {
        door: { src: "/audio/door.wav", volume: 0.25 },
      },
      music: {
        intro: { src: "/audio/intro.ogg", volume: 0.5 },
      },
    },
    audioFactory: () => {
      const player = new FakeAudio();
      createdPlayers.push(player);
      return player;
    },
  });

  assert.equal(typeof audio.registerSound, "function");
  assert.equal(typeof audio.registerMusic, "function");
  assert.equal(typeof audio.loadManifest, "function");
  assert.equal(typeof audio.playSound, "function");
  assert.equal(typeof audio.playMusic, "function");
  assert.equal(typeof audio.stopSound, "function");
  assert.equal(typeof audio.stopMusic, "function");
  assert.equal(typeof audio.stopAll, "function");
  assert.equal(typeof audio.setMasterVolume, "function");
  assert.equal(typeof audio.setSoundVolume, "function");
  assert.equal(typeof audio.setMusicVolume, "function");
  assert.equal(typeof audio.getPlaybackState, "function");

  assert.equal(audio.setMasterVolume(0.4), 0.4);
  assert.equal(audio.setSoundVolume(0.5), 0.5);
  assert.equal(audio.setMusicVolume(0.25), 0.25);

  const soundPlayer = audio.playSound("door", { volume: 0.5 });
  const musicPlayer = audio.playMusic("intro");
  const sameMusicPlayer = audio.playMusic("intro");
  const restartedMusicPlayer = audio.playMusic("intro", { restart: true });

  assert.equal(soundPlayer.volume, 0.025);
  assert.equal(musicPlayer.volume, 0.05);
  assert.equal(sameMusicPlayer, musicPlayer);
  assert.notEqual(restartedMusicPlayer, musicPlayer);

  soundPlayer.currentTime = 12;
  audio.stopSound(soundPlayer);
  assert.equal(soundPlayer.paused, true);
  assert.equal(soundPlayer.currentTime, 0);
  assert.equal(audio.getPlaybackState().activeSoundCount, 0);
});
