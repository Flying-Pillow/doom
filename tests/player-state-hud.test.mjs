import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspaceRoot = new URL("../", import.meta.url);
const stateJsUrl = new URL("src/game/state.js", workspaceRoot);
const playerJsUrl = new URL("src/game/player.js", workspaceRoot);
const hudJsUrl = new URL("src/game/hud.js", workspaceRoot);

function createModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(`${source}\n// ${Date.now()}-${Math.random()}`).toString("base64")}`;
}

async function importGameModules() {
  const [stateSource, playerSource, hudSource] = await Promise.all([
    readFile(stateJsUrl, "utf8"),
    readFile(playerJsUrl, "utf8"),
    readFile(hudJsUrl, "utf8"),
  ]);
  const stateUrl = createModuleUrl(stateSource);
  const playerUrl = createModuleUrl(
    playerSource.replace('"./state.js"', JSON.stringify(stateUrl)),
  );
  const hudUrl = createModuleUrl(
    hudSource.replace('"./state.js"', JSON.stringify(stateUrl)),
  );
  const [stateModule, playerModule, hudModule] = await Promise.all([
    import(stateUrl),
    import(playerUrl),
    import(hudUrl),
  ]);

  return {
    ...stateModule,
    ...playerModule,
    ...hudModule,
  };
}

function createHudLayer() {
  const createSlot = (slotName) => ({
    dataset: { hudSlot: slotName, hudLabel: slotName },
    setAttribute(name, value) {
      this[name] = value;
    },
  });

  return {
    children: [
      {
        children: [
          createSlot("mission"),
          createSlot("status"),
        ],
      },
      {
        children: [
          createSlot("health"),
          createSlot("armor"),
          createSlot("ammo"),
          createSlot("keys"),
        ],
      },
    ],
  };
}

test("createGameState exposes the shared runtime structures for player and HUD systems", async () => {
  const { createGameState } = await importGameModules();
  const state = createGameState();

  assert.equal(state.currentLevelId, "level-01");
  assert.deepEqual(Object.keys(state).sort(), [
    "currentLevelId",
    "doors",
    "elapsedTimeMs",
    "enemies",
    "events",
    "hudState",
    "objectiveState",
    "pickups",
    "player",
    "projectiles",
  ]);
  assert.deepEqual(Object.keys(state.player).sort(), [
    "ammo",
    "armor",
    "availableWeaponIds",
    "cooldowns",
    "health",
    "isRunning",
    "keys",
    "lastAttackAtMs",
    "lastFireResult",
    "lastInteraction",
    "lastInteractionAtMs",
    "position",
    "rotation",
    "triggerHeld",
    "velocity",
    "weaponId",
  ]);
  for (const requiredKey of ["player", "currentLevelId", "enemies", "pickups", "doors", "projectiles", "objectiveState", "hudState"]) {
    assert.ok(requiredKey in state);
  }
  for (const requiredKey of ["position", "rotation", "velocity", "health", "armor", "ammo", "weaponId", "keys"]) {
    assert.ok(requiredKey in state.player);
  }
  assert.deepEqual(state.player.position, { x: 0, y: 0, z: 0 });
  assert.deepEqual(state.player.rotation, { yaw: 0, pitch: 0, roll: 0 });
  assert.deepEqual(state.player.ammo, {
    bullets: 50,
    shells: 0,
    rockets: 0,
    cells: 0,
  });
  assert.deepEqual(state.player.keys, {
    blue: false,
    yellow: false,
    red: false,
  });
  assert.deepEqual(state.objectiveState, {
    title: "Reach the exit",
    description: "Explore the facility and find the way forward.",
    status: "active",
    progressText: "Move deeper into the facility.",
    completed: false,
  });
  assert.deepEqual(Object.keys(state.hudState), [
    "mission",
    "status",
    "health",
    "armor",
    "ammo",
    "keys",
    "objective",
  ]);
  assert.deepEqual(state.events, {
    shotsFired: [],
    interactions: [],
    notifications: [],
  });
});

test("updatePlayer applies movement aim fire and interact actions against the game state", async () => {
  const { createGameState, updatePlayer } = await importGameModules();
  const state = createGameState({
    player: {
      availableWeaponIds: ["fists", "pistol", "shotgun"],
      ammo: {
        bullets: 50,
        shells: 3,
      },
      keys: {
        blue: true,
      },
    },
  });

  updatePlayer(state, {
    move: { x: 1, y: 1 },
    look: { x: 12, y: -6 },
    turn: 1,
    actions: {
      fire: true,
      interact: true,
      run: true,
      pause: false,
    },
    weapon: {
      next: false,
      previous: false,
      selectedSlot: 3,
      wheelStep: 0,
    },
    meta: {
      pointerLocked: true,
      pressedActions: ["interact"],
      releasedActions: [],
      mouseButtons: {
        primary: true,
        secondary: false,
        middle: false,
      },
    },
  }, 1000);

  assert.notDeepEqual(state.player.position, { x: 0, y: 0, z: 0 });
  assert.ok(Math.hypot(state.player.velocity.x, state.player.velocity.z) > 0);
  assert.ok(state.player.rotation.yaw > 0);
  assert.ok(state.player.rotation.pitch > 0);
  assert.equal(state.player.isRunning, true);
  assert.equal(state.player.weaponId, "shotgun");
  assert.equal(state.player.ammo.shells, 2);
  assert.equal(state.player.lastFireResult, "fired");
  assert.equal(state.player.lastAttackAtMs, 1000);
  assert.equal(state.player.lastInteractionAtMs, 1000);
  assert.equal(state.elapsedTimeMs, 1000);
  assert.equal(state.events.shotsFired.length, 1);
  assert.equal(state.events.shotsFired[0].weaponId, "shotgun");
  assert.deepEqual(state.events.shotsFired[0].origin, state.player.position);
  assert.equal(state.events.interactions.length, 1);
  assert.equal(state.events.interactions[0].type, "interact");
  assert.deepEqual(state.events.interactions[0].keys, {
    blue: true,
    yellow: false,
    red: false,
  });
  assert.deepEqual(state.player.lastInteraction, state.events.interactions[0]);
});

test("syncHudState and renderHudLayer keep objective and inventory values aligned", async () => {
  const { createGameState, syncHudState, renderHudLayer } = await importGameModules();
  const state = createGameState({
    player: {
      health: 72,
      armor: 25,
      ammo: {
        bullets: 13,
      },
      keys: {
        blue: true,
        red: true,
      },
    },
    objectiveState: {
      title: "Find the blue key",
      description: "Open the security door.",
      status: "active",
      progressText: "Blue key required.",
    },
  });
  const hudLayer = createHudLayer();
  const hudState = syncHudState(state);

  renderHudLayer(hudLayer, hudState);

  assert.deepEqual(hudState, {
    mission: {
      label: "Mission",
      value: "Find the blue key",
    },
    status: {
      label: "Status",
      value: "Blue key required.",
    },
    health: {
      label: "Health",
      value: "72",
    },
    armor: {
      label: "Armor",
      value: "25",
    },
    ammo: {
      label: "Ammo",
      value: "13 BUL",
    },
    keys: {
      label: "Keys",
      value: "Blue Red",
    },
    objective: {
      title: "Find the blue key",
      description: "Open the security door.",
      status: "active",
      progressText: "Blue key required.",
    },
  });
  assert.equal(hudLayer.children[0].children[0].textContent, "Mission: Find the blue key");
  assert.equal(hudLayer.children[1].children[0].textContent, "Health: 72");
  assert.equal(hudLayer.children[1].children[2].textContent, "Ammo: 13 BUL");
  assert.equal(hudLayer.children[1].children[3].textContent, "Keys: Blue Red");

  state.player.health = 8;
  state.player.armor = 0;
  state.player.weaponId = "shotgun";
  state.player.ammo.shells = 4;
  state.player.keys = {
    blue: false,
    yellow: true,
    red: false,
  };
  state.objectiveState = {
    title: "Reach the elevator",
    description: "Head for extraction.",
    status: "complete",
    progressText: "Exit unlocked.",
    completed: true,
  };

  const updatedHudState = syncHudState(state);
  renderHudLayer(hudLayer, updatedHudState);

  assert.deepEqual(updatedHudState, {
    mission: {
      label: "Mission",
      value: "Reach the elevator",
    },
    status: {
      label: "Status",
      value: "Exit unlocked.",
    },
    health: {
      label: "Health",
      value: "8",
    },
    armor: {
      label: "Armor",
      value: "0",
    },
    ammo: {
      label: "Ammo",
      value: "4 SHL",
    },
    keys: {
      label: "Keys",
      value: "Yellow",
    },
    objective: {
      title: "Reach the elevator",
      description: "Head for extraction.",
      status: "complete",
      progressText: "Exit unlocked.",
    },
  });
  assert.equal(hudLayer.children[0].children[0].textContent, "Mission: Reach the elevator");
  assert.equal(hudLayer.children[0].children[1].textContent, "Status: Exit unlocked.");
  assert.equal(hudLayer.children[1].children[0].textContent, "Health: 8");
  assert.equal(hudLayer.children[1].children[1].textContent, "Armor: 0");
  assert.equal(hudLayer.children[1].children[2].textContent, "Ammo: 4 SHL");
  assert.equal(hudLayer.children[1].children[3].textContent, "Keys: Yellow");
});
