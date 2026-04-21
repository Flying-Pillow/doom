export const KEY_ORDER = Object.freeze(["blue", "yellow", "red"]);

export const WEAPON_DEFINITIONS = Object.freeze({
  fists: Object.freeze({
    id: "fists",
    slot: 1,
    ammoType: null,
    ammoPerShot: 0,
    fireCooldownMs: 450,
    displayName: "Fists",
  }),
  pistol: Object.freeze({
    id: "pistol",
    slot: 2,
    ammoType: "bullets",
    ammoPerShot: 1,
    fireCooldownMs: 250,
    displayName: "Pistol",
  }),
  shotgun: Object.freeze({
    id: "shotgun",
    slot: 3,
    ammoType: "shells",
    ammoPerShot: 1,
    fireCooldownMs: 700,
    displayName: "Shotgun",
  }),
  chaingun: Object.freeze({
    id: "chaingun",
    slot: 4,
    ammoType: "bullets",
    ammoPerShot: 1,
    fireCooldownMs: 100,
    displayName: "Chaingun",
  }),
  rocketLauncher: Object.freeze({
    id: "rocketLauncher",
    slot: 5,
    ammoType: "rockets",
    ammoPerShot: 1,
    fireCooldownMs: 850,
    displayName: "Rocket Launcher",
  }),
  plasma: Object.freeze({
    id: "plasma",
    slot: 6,
    ammoType: "cells",
    ammoPerShot: 1,
    fireCooldownMs: 120,
    displayName: "Plasma Rifle",
  }),
  bfg: Object.freeze({
    id: "bfg",
    slot: 7,
    ammoType: "cells",
    ammoPerShot: 40,
    fireCooldownMs: 1200,
    displayName: "BFG",
  }),
});

const DEFAULT_AMMO = Object.freeze({
  bullets: 50,
  shells: 0,
  rockets: 0,
  cells: 0,
});

const DEFAULT_KEYS = Object.freeze({
  blue: false,
  yellow: false,
  red: false,
});

const DEFAULT_OBJECTIVE = Object.freeze({
  title: "Reach the exit",
  description: "Explore the facility and find the way forward.",
  status: "active",
  progressText: "Move deeper into the facility.",
  completed: false,
});

function cloneVector3(vector = {}) {
  return {
    x: Number(vector.x) || 0,
    y: Number(vector.y) || 0,
    z: Number(vector.z) || 0,
  };
}

function cloneRotation(rotation = {}) {
  return {
    yaw: Number(rotation.yaw) || 0,
    pitch: Number(rotation.pitch) || 0,
    roll: Number(rotation.roll) || 0,
  };
}

function cloneAmmo(ammo = {}) {
  return {
    bullets: Math.max(0, Number(ammo.bullets ?? DEFAULT_AMMO.bullets) || 0),
    shells: Math.max(0, Number(ammo.shells ?? DEFAULT_AMMO.shells) || 0),
    rockets: Math.max(0, Number(ammo.rockets ?? DEFAULT_AMMO.rockets) || 0),
    cells: Math.max(0, Number(ammo.cells ?? DEFAULT_AMMO.cells) || 0),
  };
}

function cloneKeys(keys = {}) {
  return {
    blue: Boolean(keys.blue),
    yellow: Boolean(keys.yellow),
    red: Boolean(keys.red),
  };
}

function cloneHudEntry(entry, fallbackLabel, fallbackValue) {
  return {
    label: typeof entry?.label === "string" && entry.label.trim() !== "" ? entry.label : fallbackLabel,
    value: typeof entry?.value === "string" && entry.value.trim() !== "" ? entry.value : fallbackValue,
  };
}

export function createDefaultPlayerState(overrides = {}) {
  const availableWeaponIds = Array.isArray(overrides.availableWeaponIds) && overrides.availableWeaponIds.length > 0
    ? [...new Set(overrides.availableWeaponIds.filter((weaponId) => weaponId in WEAPON_DEFINITIONS))]
    : ["fists", "pistol"];
  const weaponId = typeof overrides.weaponId === "string" && availableWeaponIds.includes(overrides.weaponId)
    ? overrides.weaponId
    : availableWeaponIds.includes("pistol")
      ? "pistol"
      : availableWeaponIds[0];

  return {
    position: cloneVector3(overrides.position),
    rotation: cloneRotation(overrides.rotation),
    velocity: cloneVector3(overrides.velocity),
    health: Math.max(0, Number(overrides.health ?? 100) || 0),
    armor: Math.max(0, Number(overrides.armor ?? 0) || 0),
    ammo: cloneAmmo(overrides.ammo),
    weaponId,
    keys: cloneKeys({ ...DEFAULT_KEYS, ...(overrides.keys ?? {}) }),
    availableWeaponIds,
    cooldowns: {
      fireMs: Math.max(0, Number(overrides.cooldowns?.fireMs) || 0),
      interactMs: Math.max(0, Number(overrides.cooldowns?.interactMs) || 0),
    },
    lastAttackAtMs: Number.isFinite(overrides.lastAttackAtMs) ? overrides.lastAttackAtMs : null,
    lastInteractionAtMs: Number.isFinite(overrides.lastInteractionAtMs) ? overrides.lastInteractionAtMs : null,
    lastFireResult: overrides.lastFireResult ?? null,
    lastInteraction: overrides.lastInteraction ? { ...overrides.lastInteraction } : null,
    isRunning: Boolean(overrides.isRunning),
    triggerHeld: Boolean(overrides.triggerHeld),
  };
}

export function createDefaultObjectiveState(overrides = {}) {
  return {
    title: typeof overrides.title === "string" && overrides.title.trim() !== ""
      ? overrides.title
      : DEFAULT_OBJECTIVE.title,
    description: typeof overrides.description === "string" && overrides.description.trim() !== ""
      ? overrides.description
      : DEFAULT_OBJECTIVE.description,
    status: typeof overrides.status === "string" && overrides.status.trim() !== ""
      ? overrides.status
      : DEFAULT_OBJECTIVE.status,
    progressText: typeof overrides.progressText === "string" && overrides.progressText.trim() !== ""
      ? overrides.progressText
      : DEFAULT_OBJECTIVE.progressText,
    completed: overrides.completed ?? DEFAULT_OBJECTIVE.completed,
  };
}

export function createDefaultHudState(overrides = {}) {
  const objective = overrides.objective ?? {};

  return {
    mission: cloneHudEntry(overrides.mission, "Mission", DEFAULT_OBJECTIVE.title),
    status: cloneHudEntry(overrides.status, "Status", DEFAULT_OBJECTIVE.progressText),
    health: cloneHudEntry(overrides.health, "Health", "100"),
    armor: cloneHudEntry(overrides.armor, "Armor", "0"),
    ammo: cloneHudEntry(overrides.ammo, "Ammo", String(DEFAULT_AMMO.bullets)),
    keys: cloneHudEntry(overrides.keys, "Keys", "None"),
    objective: {
      title: typeof objective.title === "string" && objective.title.trim() !== ""
        ? objective.title
        : DEFAULT_OBJECTIVE.title,
      description: typeof objective.description === "string" && objective.description.trim() !== ""
        ? objective.description
        : DEFAULT_OBJECTIVE.description,
      status: typeof objective.status === "string" && objective.status.trim() !== ""
        ? objective.status
        : DEFAULT_OBJECTIVE.status,
      progressText: typeof objective.progressText === "string" && objective.progressText.trim() !== ""
        ? objective.progressText
        : DEFAULT_OBJECTIVE.progressText,
    },
  };
}

export function createGameState(options = {}) {
  const player = createDefaultPlayerState(options.player);
  const objectiveState = createDefaultObjectiveState(options.objectiveState);

  return {
    player,
    currentLevelId: typeof options.currentLevelId === "string" && options.currentLevelId.trim() !== ""
      ? options.currentLevelId
      : "level-01",
    enemies: Array.isArray(options.enemies) ? [...options.enemies] : [],
    pickups: Array.isArray(options.pickups) ? [...options.pickups] : [],
    doors: Array.isArray(options.doors) ? [...options.doors] : [],
    projectiles: Array.isArray(options.projectiles) ? [...options.projectiles] : [],
    objectiveState,
    hudState: createDefaultHudState({
      mission: { value: objectiveState.title },
      status: { value: objectiveState.progressText },
      health: { value: String(player.health) },
      armor: { value: String(player.armor) },
      ammo: {
        value: player.weaponId === "pistol"
          ? String(player.ammo.bullets)
          : "INF",
      },
      keys: {
        value: KEY_ORDER.some((color) => player.keys[color]) ? KEY_ORDER.filter((color) => player.keys[color]).join(" ") : "None",
      },
      objective: objectiveState,
      ...(options.hudState ?? {}),
    }),
    events: {
      shotsFired: Array.isArray(options.events?.shotsFired) ? [...options.events.shotsFired] : [],
      interactions: Array.isArray(options.events?.interactions) ? [...options.events.interactions] : [],
      notifications: Array.isArray(options.events?.notifications) ? [...options.events.notifications] : [],
    },
    elapsedTimeMs: Math.max(0, Number(options.elapsedTimeMs) || 0),
  };
}
