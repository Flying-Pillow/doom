const KEY_BINDINGS = new Map([
  ["KeyW", "moveForward"],
  ["ArrowUp", "moveForward"],
  ["KeyS", "moveBackward"],
  ["ArrowDown", "moveBackward"],
  ["KeyA", "moveLeft"],
  ["KeyD", "moveRight"],
  ["ArrowLeft", "turnLeft"],
  ["ArrowRight", "turnRight"],
  ["ShiftLeft", "run"],
  ["ShiftRight", "run"],
  ["KeyE", "interact"],
  ["Space", "interact"],
  ["Enter", "interact"],
  ["KeyP", "pause"],
  ["Escape", "pause"],
  ["Digit1", "weaponSlot1"],
  ["Digit2", "weaponSlot2"],
  ["Digit3", "weaponSlot3"],
  ["Digit4", "weaponSlot4"],
  ["Digit5", "weaponSlot5"],
  ["Digit6", "weaponSlot6"],
  ["Digit7", "weaponSlot7"],
]);

const MOUSE_BUTTON_BINDINGS = new Map([
  [0, "fire"],
  [2, "interact"],
]);

function copyActions(set) {
  return [...set].sort();
}

function clearInputState(heldActions, pressedActions, releasedActions) {
  heldActions.clear();
  pressedActions.clear();
  releasedActions.clear();
}

export function createInputController(target, options = {}) {
  if (!target || typeof target.addEventListener !== "function" || typeof target.removeEventListener !== "function") {
    throw new TypeError("createInputController expected an EventTarget-compatible input source.");
  }

  const pointerTarget = options.pointerTarget ?? target;
  const documentRef = options.documentRef ?? globalThis.document;

  if (!pointerTarget || typeof pointerTarget.addEventListener !== "function" || typeof pointerTarget.removeEventListener !== "function") {
    throw new TypeError("createInputController expected a pointerTarget with addEventListener().");
  }

  const heldActions = new Set();
  const pressedActions = new Set();
  const releasedActions = new Set();
  const mouseButtons = {
    primary: false,
    secondary: false,
    middle: false,
  };

  let running = false;
  let lookDeltaX = 0;
  let lookDeltaY = 0;
  let wheelStep = 0;
  let selectedWeaponSlot = null;
  let pointerLocked = false;

  const eventHandlers = {
    keydown(event) {
      const action = KEY_BINDINGS.get(event.code);

      if (!action) {
        return;
      }

      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }

      if (!event.repeat && !heldActions.has(action)) {
        pressedActions.add(action);
      }

      heldActions.add(action);

      if (action.startsWith("weaponSlot")) {
        selectedWeaponSlot = Number(action.slice("weaponSlot".length));
      }
    },
    keyup(event) {
      const action = KEY_BINDINGS.get(event.code);

      if (!action) {
        return;
      }

      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }

      heldActions.delete(action);
      releasedActions.add(action);
    },
    mousedown(event) {
      const action = MOUSE_BUTTON_BINDINGS.get(event.button);

      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }

      if (!action) {
        return;
      }

      if (!heldActions.has(action)) {
        pressedActions.add(action);
      }

      heldActions.add(action);
      mouseButtons.primary = event.button === 0 ? true : mouseButtons.primary;
      mouseButtons.middle = event.button === 1 ? true : mouseButtons.middle;
      mouseButtons.secondary = event.button === 2 ? true : mouseButtons.secondary;
    },
    mouseup(event) {
      const action = MOUSE_BUTTON_BINDINGS.get(event.button);

      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }

      if (!action) {
        return;
      }

      heldActions.delete(action);
      releasedActions.add(action);
      mouseButtons.primary = event.button === 0 ? false : mouseButtons.primary;
      mouseButtons.middle = event.button === 1 ? false : mouseButtons.middle;
      mouseButtons.secondary = event.button === 2 ? false : mouseButtons.secondary;
    },
    mousemove(event) {
      lookDeltaX += Number(event.movementX) || 0;
      lookDeltaY += Number(event.movementY) || 0;
    },
    wheel(event) {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }

      const direction = Math.sign(Number(event.deltaY) || 0);

      if (direction === 0) {
        return;
      }

      wheelStep = direction;
      pressedActions.add(direction > 0 ? "weaponNext" : "weaponPrevious");
    },
    blur() {
      clearInputState(heldActions, pressedActions, releasedActions);
      mouseButtons.primary = false;
      mouseButtons.middle = false;
      mouseButtons.secondary = false;
      lookDeltaX = 0;
      lookDeltaY = 0;
      wheelStep = 0;
      selectedWeaponSlot = null;
    },
    contextmenu(event) {
      if (typeof event.preventDefault === "function") {
        event.preventDefault();
      }
    },
    pointerlockchange() {
      pointerLocked = documentRef.pointerLockElement === pointerTarget;
    },
  };

  function buildSnapshot() {
    return {
      move: {
        x: (heldActions.has("moveRight") ? 1 : 0) - (heldActions.has("moveLeft") ? 1 : 0),
        y: (heldActions.has("moveForward") ? 1 : 0) - (heldActions.has("moveBackward") ? 1 : 0),
      },
      look: {
        x: lookDeltaX,
        y: lookDeltaY,
      },
      turn: (heldActions.has("turnRight") ? 1 : 0) - (heldActions.has("turnLeft") ? 1 : 0),
      actions: {
        fire: heldActions.has("fire"),
        interact: heldActions.has("interact"),
        run: heldActions.has("run"),
        pause: heldActions.has("pause"),
      },
      weapon: {
        next: pressedActions.has("weaponNext"),
        previous: pressedActions.has("weaponPrevious"),
        selectedSlot: selectedWeaponSlot,
        wheelStep,
      },
      meta: {
        pointerLocked,
        pressedActions: copyActions(pressedActions),
        releasedActions: copyActions(releasedActions),
        mouseButtons: { ...mouseButtons },
      },
    };
  }

  function resetFrameDeltas() {
    lookDeltaX = 0;
    lookDeltaY = 0;
    wheelStep = 0;
    selectedWeaponSlot = null;
    pressedActions.clear();
    releasedActions.clear();
  }

  function start() {
    if (running) {
      return controller;
    }

    running = true;
    target.addEventListener("keydown", eventHandlers.keydown);
    target.addEventListener("keyup", eventHandlers.keyup);
    target.addEventListener("blur", eventHandlers.blur);
    pointerTarget.addEventListener("mousedown", eventHandlers.mousedown);
    pointerTarget.addEventListener("mouseup", eventHandlers.mouseup);
    pointerTarget.addEventListener("mousemove", eventHandlers.mousemove);
    pointerTarget.addEventListener("wheel", eventHandlers.wheel);
    pointerTarget.addEventListener("contextmenu", eventHandlers.contextmenu);
    documentRef.addEventListener("pointerlockchange", eventHandlers.pointerlockchange);

    return controller;
  }

  function stop() {
    if (!running) {
      return controller;
    }

    running = false;
    target.removeEventListener("keydown", eventHandlers.keydown);
    target.removeEventListener("keyup", eventHandlers.keyup);
    target.removeEventListener("blur", eventHandlers.blur);
    pointerTarget.removeEventListener("mousedown", eventHandlers.mousedown);
    pointerTarget.removeEventListener("mouseup", eventHandlers.mouseup);
    pointerTarget.removeEventListener("mousemove", eventHandlers.mousemove);
    pointerTarget.removeEventListener("wheel", eventHandlers.wheel);
    pointerTarget.removeEventListener("contextmenu", eventHandlers.contextmenu);
    documentRef.removeEventListener("pointerlockchange", eventHandlers.pointerlockchange);
    eventHandlers.blur();

    return controller;
  }

  function getSnapshot() {
    return buildSnapshot();
  }

  function consumeFrameInput() {
    const snapshot = buildSnapshot();
    resetFrameDeltas();
    return snapshot;
  }

  function isActionActive(actionName) {
    return heldActions.has(actionName);
  }

  function requestPointerLock() {
    if (typeof pointerTarget.requestPointerLock === "function") {
      pointerTarget.requestPointerLock();
    }
  }

  function releasePointerLock() {
    if (typeof documentRef.exitPointerLock === "function") {
      documentRef.exitPointerLock();
    }
  }

  const controller = {
    start,
    stop,
    getSnapshot,
    consumeFrameInput,
    isActionActive,
    requestPointerLock,
    releasePointerLock,
  };

  return controller;
}
