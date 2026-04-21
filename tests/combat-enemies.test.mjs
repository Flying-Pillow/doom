import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workspaceRoot = new URL("../", import.meta.url);
const stateJsUrl = new URL("src/game/state.js", workspaceRoot);
const playerJsUrl = new URL("src/game/player.js", workspaceRoot);
const enemiesJsUrl = new URL("src/game/enemies.js", workspaceRoot);
const combatJsUrl = new URL("src/game/combat.js", workspaceRoot);

function createModuleUrl(source) {
  return `data:text/javascript;base64,${Buffer.from(`${source}\n// ${Date.now()}-${Math.random()}`).toString("base64")}`;
}

async function importGameModules() {
  const [stateSource, playerSource, enemiesSource, combatSource] = await Promise.all([
    readFile(stateJsUrl, "utf8"),
    readFile(playerJsUrl, "utf8"),
    readFile(enemiesJsUrl, "utf8"),
    readFile(combatJsUrl, "utf8"),
  ]);

  const stateUrl = createModuleUrl(stateSource);
  const playerUrl = createModuleUrl(
    playerSource.replace('"./state.js"', JSON.stringify(stateUrl)),
  );
  const enemiesUrl = createModuleUrl(enemiesSource);
  const combatUrl = createModuleUrl(
    combatSource.replace('"./state.js"', JSON.stringify(stateUrl)),
  );

  const [stateModule, playerModule, enemiesModule, combatModule] = await Promise.all([
    import(stateUrl),
    import(playerUrl),
    import(enemiesUrl),
    import(combatUrl),
  ]);

  return {
    ...stateModule,
    ...playerModule,
    ...enemiesModule,
    ...combatModule,
  };
}

test("updateEnemies drives alert pursuit attack cadence and death transitions", async () => {
  const { createGameState, updateEnemies } = await importGameModules();
  const state = createGameState({
    player: {
      position: { x: 0, y: 0, z: 0 },
    },
    enemies: [
      {
        id: "trooper-1",
        type: "trooper",
        position: { x: 0, y: 0, z: 18 },
      },
      {
        id: "demon-1",
        type: "demon",
        position: { x: 0, y: 0, z: 1.5 },
      },
      {
        id: "imp-dead",
        type: "imp",
        position: { x: 4, y: 0, z: 4 },
        health: 0,
      },
    ],
    elapsedTimeMs: 1000,
  });

  updateEnemies(state, 500);

  const [trooper, demon, deadImp] = state.enemies;
  assert.equal(trooper.alertState, "alerted");
  assert.equal(trooper.aiState, "pursuing");
  assert.ok(trooper.position.z < 18);
  assert.equal(demon.aiState, "attacking");
  assert.equal(state.events.enemyAttacks.length, 1);
  assert.deepEqual(state.events.enemyAttacks[0], {
    enemyId: "demon-1",
    attackKind: "melee",
    damage: 18,
    origin: demon.position,
    timestampMs: 1000,
  });
  assert.equal(demon.cooldowns.attackMs, 700);
  assert.equal(deadImp.aiState, "dying");
  assert.equal(deadImp.deathState, "dying");

  updateEnemies(state, 200);
  assert.equal(state.events.enemyAttacks.length, 0);
  assert.equal(demon.cooldowns.attackMs, 500);

  updateEnemies(state, 400);
  assert.equal(state.events.enemyAttacks.length, 0);
  assert.equal(deadImp.aiState, "dead");
  assert.equal(deadImp.deathState, "dead");
});

test("updateEnemies delays projectile attacks until cooldown expiry and spawns enemy projectiles", async () => {
  const { createGameState, updateEnemies } = await importGameModules();
  const state = createGameState({
    player: {
      position: { x: 0, y: 0, z: 0 },
    },
    enemies: [
      {
        id: "imp-1",
        type: "imp",
        position: { x: 0, y: 0, z: 10 },
      },
    ],
    elapsedTimeMs: 2000,
  });

  updateEnemies(state, 1100);

  const [imp] = state.enemies;
  assert.equal(imp.alertState, "alerted");
  assert.equal(imp.aiState, "attacking");
  assert.equal(imp.cooldowns.attackMs, 100);
  assert.equal(imp.lastAttackAtMs, undefined);
  assert.equal(state.events.enemyAttacks.length, 0);
  assert.equal(state.projectiles.length, 0);

  updateEnemies(state, 100);

  assert.equal(imp.aiState, "attacking");
  assert.equal(imp.cooldowns.attackMs, 1200);
  assert.equal(imp.lastAttackAtMs, 2000);
  assert.equal(state.events.enemyAttacks.length, 0);
  assert.equal(state.projectiles.length, 1);
  assert.deepEqual(state.projectiles[0], {
    id: "imp-1-projectile-2000-0",
    owner: "enemy",
    enemyId: "imp-1",
    type: "imp-projectile",
    position: { x: 0, y: 0, z: 10 },
    velocity: { x: 0, y: 0, z: -10 },
    damage: 14,
    radius: 0.9,
    maxDistance: 25.6,
    distanceTraveled: 0,
    active: true,
  });
});

test("resolveCombat applies player fire defeats enemies and consumes nearby pickups", async () => {
  const { createGameState, updatePlayer, resolveCombat } = await importGameModules();
  const state = createGameState({
    player: {
      position: { x: 0, y: 0, z: 0 },
      rotation: { yaw: 0, pitch: 0, roll: 0 },
      health: 70,
      ammo: {
        bullets: 12,
        shells: 1,
        rockets: 0,
        cells: 0,
      },
    },
    enemies: [
      {
        id: "trooper-1",
        type: "trooper",
        position: { x: 0, y: 0, z: 6 },
        health: 18,
      },
    ],
    pickups: [
      {
        id: "medkit-1",
        kind: "health",
        amount: 25,
        position: { x: 0, y: 0, z: 0.5 },
      },
      {
        id: "shells-1",
        kind: "ammo",
        ammoType: "shells",
        amount: 4,
        position: { x: 0.25, y: 0, z: 0.2 },
      },
      {
        id: "blue-key",
        kind: "key",
        color: "blue",
        position: { x: 0.3, y: 0, z: 0.3 },
      },
      {
        id: "shotgun-pickup",
        kind: "weapon",
        weaponId: "shotgun",
        ammoType: "shells",
        amount: 2,
        position: { x: 0.4, y: 0, z: 0.4 },
      },
    ],
    elapsedTimeMs: 1500,
  });

  updatePlayer(state, {
    move: { x: 0, y: 0 },
    look: { x: 0, y: 0 },
    turn: 0,
    actions: {
      fire: true,
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
        primary: true,
        secondary: false,
        middle: false,
      },
    },
  }, 100);

  resolveCombat(state, 0);

  const enemy = state.enemies[0];
  assert.equal(enemy.health, 0);
  assert.equal(enemy.aiState, "dying");
  assert.equal(state.player.health, 95);
  assert.equal(state.player.keys.blue, true);
  assert.equal(state.player.weaponId, "shotgun");
  assert.deepEqual(state.player.availableWeaponIds, ["fists", "pistol", "shotgun"]);
  assert.equal(state.player.ammo.bullets, 11);
  assert.equal(state.player.ammo.shells, 7);
  assert.equal(state.events.shotsFired.length, 0);
  assert.equal(state.events.damage.length, 1);
  assert.equal(state.events.damage[0].target, "enemy");
  assert.equal(state.events.enemyDefeated.length, 1);
  assert.equal(state.events.pickupsCollected.length, 4);
  assert.equal(state.events.notifications.some((entry) => entry.type === "enemy-defeated"), true);
  assert.equal(state.events.notifications.filter((entry) => entry.type === "pickup-collected").length, 4);
  assert.equal(state.pickups.every((pickup) => pickup.collected), true);
});

test("resolveCombat applies enemy attacks and projectile impacts with armor mitigation", async () => {
  const { createGameState, updateEnemies, resolveCombat } = await importGameModules();
  const state = createGameState({
    player: {
      position: { x: 0, y: 0, z: 0 },
      health: 50,
      armor: 12,
    },
    enemies: [
      {
        id: "imp-1",
        type: "imp",
        position: { x: 0, y: 0, z: 10 },
      },
      {
        id: "demon-1",
        type: "demon",
        position: { x: 0, y: 0, z: 1.5 },
      },
    ],
    elapsedTimeMs: 2000,
  });

  updateEnemies(state, 100);
  assert.equal(state.events.enemyAttacks.length, 1);
  assert.equal(state.projectiles.length, 0);

  resolveCombat(state, 0);
  assert.equal(state.player.health, 38);
  assert.equal(state.player.armor, 6);

  updateEnemies(state, 1200);
  assert.equal(state.projectiles.length, 1);

  resolveCombat(state, 1000);
  assert.equal(state.projectiles.length, 0);
  assert.equal(state.player.health, 28);
  assert.equal(state.player.armor, 2);
  assert.equal(state.events.damage.filter((entry) => entry.target === "player").length, 1);
});

test("resolveCombat reports player defeat on lethal enemy attacks", async () => {
  const { createGameState, resolveCombat } = await importGameModules();
  const state = createGameState({
    player: {
      position: { x: 0, y: 0, z: 0 },
      health: 8,
      armor: 0,
    },
    elapsedTimeMs: 2400,
  });
  state.events.enemyAttacks = [
    {
      enemyId: "demon-1",
      attackKind: "melee",
      damage: 18,
      origin: { x: 0, y: 0, z: 1.5 },
      timestampMs: 2400,
    },
  ];

  resolveCombat(state, 0);

  assert.equal(state.player.health, 0);
  assert.equal(state.player.armor, 0);
  assert.equal(state.events.enemyAttacks.length, 0);
  assert.equal(state.events.damage.length, 1);
  assert.deepEqual(state.events.damage[0], {
    target: "player",
    amount: 8,
    healthDamage: 8,
    armorDamage: 0,
    source: {
      type: "enemy-attack",
      enemyId: "demon-1",
      attackKind: "melee",
    },
  });
  assert.deepEqual(state.events.notifications, [
    {
      timestampMs: 2400,
      type: "player-defeated",
      source: {
        type: "enemy-attack",
        enemyId: "demon-1",
        attackKind: "melee",
      },
    },
  ]);
});
