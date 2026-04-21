import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspaceRoot = new URL("../", import.meta.url);
const manifestJsUrl = new URL("src/assets/manifest.js", workspaceRoot);
const stateJsUrl = new URL("src/game/state.js", workspaceRoot);
const playerJsUrl = new URL("src/game/player.js", workspaceRoot);
const combatJsUrl = new URL("src/game/combat.js", workspaceRoot);
const levelsIndexJsUrl = new URL("src/game/levels/index.js", workspaceRoot);
const level01JsUrl = new URL("src/game/levels/level-01.js", workspaceRoot);
const level02JsUrl = new URL("src/game/levels/level-02.js", workspaceRoot);

function createModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(`${source}\n// ${Date.now()}-${Math.random()}`).toString("base64")}`;
}

async function importLevelModules() {
  const [
    manifestSource,
    stateSource,
    playerSource,
    combatSource,
    levelsIndexSource,
    level01Source,
    level02Source,
  ] = await Promise.all([
    readFile(manifestJsUrl, "utf8"),
    readFile(stateJsUrl, "utf8"),
    readFile(playerJsUrl, "utf8"),
    readFile(combatJsUrl, "utf8"),
    readFile(levelsIndexJsUrl, "utf8"),
    readFile(level01JsUrl, "utf8"),
    readFile(level02JsUrl, "utf8"),
  ]);

  const manifestUrl = createModuleUrl(manifestSource);
  const stateUrl = createModuleUrl(stateSource);
  const level01Url = createModuleUrl(level01Source);
  const level02Url = createModuleUrl(level02Source);
  const playerUrl = createModuleUrl(
    playerSource.replace('"./state.js"', JSON.stringify(stateUrl)),
  );
  const combatUrl = createModuleUrl(
    combatSource.replace('"./state.js"', JSON.stringify(stateUrl)),
  );
  const levelsIndexUrl = createModuleUrl(
    levelsIndexSource
      .replace('"../../assets/manifest.js"', JSON.stringify(manifestUrl))
      .replace('"../state.js"', JSON.stringify(stateUrl))
      .replace('"./level-01.js"', JSON.stringify(level01Url))
      .replace('"./level-02.js"', JSON.stringify(level02Url)),
  );

  const [manifestModule, stateModule, playerModule, combatModule, levelsModule] = await Promise.all([
    import(manifestUrl),
    import(stateUrl),
    import(playerUrl),
    import(combatUrl),
    import(levelsIndexUrl),
  ]);

  return {
    ...manifestModule,
    ...stateModule,
    ...playerModule,
    ...combatModule,
    ...levelsModule,
  };
}

function createIdleInput() {
  return {
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
  };
}

function createInteractInput() {
  return {
    ...createIdleInput(),
    actions: {
      fire: false,
      interact: true,
      run: false,
      pause: false,
    },
    meta: {
      ...createIdleInput().meta,
      pressedActions: ["interact"],
    },
  };
}

function defeatAllEnemies(state) {
  for (const enemy of state.enemies) {
    enemy.health = 0;
    enemy.aiState = "dead";
    enemy.deathState = "dead";
  }
}

test("level registry exposes the first two data-driven levels and their loader metadata", async () => {
  const {
    ASSET_MANIFEST,
    DEFAULT_LEVEL_ID,
    LEVEL_REGISTRY,
    createLevelState,
    getLevelDefinition,
    getLevelLoaderPath,
  } = await importLevelModules();

  assert.equal(DEFAULT_LEVEL_ID, "level-01");
  assert.deepEqual(Object.keys(LEVEL_REGISTRY), ["level-01", "level-02"]);
  assert.equal(getLevelLoaderPath("level-01"), "../game/levels/level-01.js");
  assert.equal(ASSET_MANIFEST.levels["level-02"].musicTrackId, "level-02");
  assert.equal(getLevelDefinition("level-02").title, "Foundry Lockdown");

  const state = createLevelState("level-01");
  state.enemies[0].position.z = 999;

  assert.equal(getLevelDefinition("level-01").enemies[0].position.z, 6);
});

test("asset manifest stays internally consistent with the registered level slice", async () => {
  const { ASSET_MANIFEST, LEVEL_REGISTRY, getLevelDefinition, getLevelLoaderPath } = await importLevelModules();
  const levelIds = Object.keys(LEVEL_REGISTRY);

  assert.deepEqual(Object.keys(ASSET_MANIFEST.levels), levelIds);

  for (const levelId of levelIds) {
    const manifestEntry = ASSET_MANIFEST.levels[levelId];
    const level = getLevelDefinition(levelId);

    assert.equal(manifestEntry.id, level.id);
    assert.equal(manifestEntry.title, level.title);
    assert.equal(manifestEntry.modulePath, getLevelLoaderPath(levelId));
    assert.equal(manifestEntry.musicTrackId, level.musicTrackId);
    assert.match(ASSET_MANIFEST.music[manifestEntry.musicTrackId]?.src ?? "", /^\/audio\/music\//);
  }

  assert.match(ASSET_MANIFEST.sounds.pickupKeycard?.src ?? "", /^\/audio\/sfx\//);
  assert.match(ASSET_MANIFEST.sounds.doorUnlock?.src ?? "", /^\/audio\/sfx\//);
  assert.match(ASSET_MANIFEST.sounds.levelExit?.src ?? "", /^\/audio\/sfx\//);
});

test("level progression carries level 01 from spawn through keycard unlock and into level 02", async () => {
  const {
    createLevelState,
    getLevelDefinition,
    resolveCombat,
    updateLevelProgression,
    updatePlayer,
  } = await importLevelModules();
  const state = createLevelState("level-01");

  assert.equal(state.currentLevelId, "level-01");
  assert.deepEqual(state.player.position, getLevelDefinition("level-01").spawn.position);
  assert.equal(state.objectiveState.progressText, "Recover the blue keycard from the hangar floor. 3 hostiles remain.");

  updatePlayer(state, {
    ...createIdleInput(),
    actions: {
      fire: true,
      interact: false,
      run: false,
      pause: false,
    },
    meta: {
      ...createIdleInput().meta,
      mouseButtons: {
        primary: true,
        secondary: false,
        middle: false,
      },
    },
  }, 100);
  resolveCombat(state, 0);
  updateLevelProgression(state);

  assert.equal(state.enemies[0].health, 0);
  assert.equal(state.objectiveState.progressText, "Recover the blue keycard from the hangar floor. 2 hostiles remain.");

  state.player.position = { x: 8, y: 0, z: 20 };
  resolveCombat(state, 0);
  updateLevelProgression(state);

  assert.equal(state.player.keys.blue, true);
  assert.equal(state.player.weaponId, "shotgun");
  assert.equal(state.player.ammo.shells, 6);
  assert.equal(state.objectiveState.progressText, "Return to the blue security door.");

  state.player.position = { x: 0, y: 0, z: 24 };
  updatePlayer(state, createInteractInput(), 16);
  updateLevelProgression(state);

  assert.equal(state.doors[0].locked, false);
  assert.equal(state.objectiveState.progressText, "Clear the hangar lift approach. 2 hostiles remain.");

  defeatAllEnemies(state);

  updatePlayer(state, createIdleInput(), 300);
  updateLevelProgression(state);

  assert.equal(state.doors[1].locked, false);
  assert.equal(state.objectiveState.progressText, "Ride the lift to the foundry.");

  state.player.position = { x: 0, y: 0, z: 30 };
  updatePlayer(state, createInteractInput(), 16);
  const nextState = updateLevelProgression(state);

  assert.equal(nextState.currentLevelId, "level-02");
  assert.equal(nextState.objectiveState.title, "Stabilize the foundry");
  assert.equal(nextState.player.weaponId, "shotgun");
  assert.equal(nextState.player.ammo.bullets, 49);
  assert.equal(nextState.player.ammo.shells, 6);
  assert.deepEqual(nextState.player.keys, {
    blue: false,
    yellow: false,
    red: false,
  });
  assert.deepEqual(nextState.player.position, getLevelDefinition("level-02").spawn.position);
  assert.equal(nextState.objectiveState.progressText, "Recover the yellow keycard from the processing floor. 4 hostiles remain.");
});

test("level 02 progression validates yellow key pickup, door unlock, exit unlock, and terminal exit behavior", async () => {
  const {
    createLevelState,
    resolveCombat,
    updateLevelProgression,
    updatePlayer,
  } = await importLevelModules();
  const state = createLevelState("level-02");

  assert.equal(state.currentLevelId, "level-02");
  assert.equal(state.objectiveState.progressText, "Recover the yellow keycard from the processing floor. 4 hostiles remain.");

  state.player.position = { x: 9, y: 0, z: 24 };
  resolveCombat(state, 0);
  updateLevelProgression(state);

  assert.equal(state.player.keys.yellow, true);
  assert.equal(state.objectiveState.progressText, "Unlock the yellow blast door.");
  assert.equal(state.events.notifications.some((entry) =>
    entry.type === "pickup-collected" && entry.pickupId === "foundry-yellow-key"), true);

  state.player.position = { x: 0, y: 0, z: 28 };
  updatePlayer(state, createInteractInput(), 16);
  updateLevelProgression(state);

  assert.equal(state.doors[0].locked, false);
  assert.equal(state.objectiveState.progressText, "Eliminate resistance around the furnace elevator. 4 hostiles remain.");
  assert.equal(state.events.notifications.some((entry) =>
    entry.type === "door-unlocked" && entry.doorId === "foundry-yellow-door" && entry.requiredKey === "yellow"), true);

  defeatAllEnemies(state);
  updatePlayer(state, createIdleInput(), 300);
  updateLevelProgression(state);

  assert.equal(state.doors[1].locked, false);
  assert.equal(state.objectiveState.progressText, "Enter the furnace elevator.");
  assert.equal(state.events.notifications.some((entry) =>
    entry.type === "exit-unlocked" && entry.doorId === "foundry-exit"), true);

  state.player.position = { x: 0, y: 0, z: 35 };
  updatePlayer(state, createInteractInput(), 16);
  const terminalState = updateLevelProgression(state);

  assert.equal(terminalState, state);
  assert.equal(terminalState.currentLevelId, "level-02");
  assert.equal(terminalState.objectiveState.completed, true);
  assert.equal(terminalState.events.notifications.some((entry) => entry.type === "level-complete"), false);
});
