import { WEAPON_DEFINITIONS } from "./state.js";

const WALK_SPEED = 4.5;
const RUN_MULTIPLIER = 1.65;
const TURN_SPEED_RADIANS_PER_MS = Math.PI / 1200;
const LOOK_SENSITIVITY = 0.0025;
const MAX_PITCH = Math.PI / 2.2;
const INTERACT_COOLDOWN_MS = 250;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeMovement(move = {}) {
  const x = Number(move.x) || 0;
  const y = Number(move.y) || 0;
  const magnitude = Math.hypot(x, y);

  if (magnitude <= 1) {
    return { x, y };
  }

  return {
    x: x / magnitude,
    y: y / magnitude,
  };
}

function getOwnedWeaponIds(player) {
  const availableWeaponIds = Array.isArray(player.availableWeaponIds) && player.availableWeaponIds.length > 0
    ? player.availableWeaponIds
    : [player.weaponId].filter(Boolean);

  return availableWeaponIds
    .filter((weaponId) => weaponId in WEAPON_DEFINITIONS)
    .sort((leftWeaponId, rightWeaponId) =>
      WEAPON_DEFINITIONS[leftWeaponId].slot - WEAPON_DEFINITIONS[rightWeaponId].slot);
}

function selectWeaponBySlot(player, slot) {
  if (!Number.isInteger(slot)) {
    return player.weaponId;
  }

  const ownedWeaponId = getOwnedWeaponIds(player).find((weaponId) => WEAPON_DEFINITIONS[weaponId].slot === slot);

  if (ownedWeaponId) {
    player.weaponId = ownedWeaponId;
  }

  return player.weaponId;
}

function cycleWeapon(player, direction) {
  const ownedWeaponIds = getOwnedWeaponIds(player);

  if (ownedWeaponIds.length === 0) {
    return player.weaponId;
  }

  const currentIndex = Math.max(0, ownedWeaponIds.indexOf(player.weaponId));
  const nextIndex = (currentIndex + direction + ownedWeaponIds.length) % ownedWeaponIds.length;
  player.weaponId = ownedWeaponIds[nextIndex];

  return player.weaponId;
}

function resetFrameEvents(state) {
  state.events ??= {};
  state.events.shotsFired = [];
  state.events.interactions = [];
  state.events.notifications = [];
}

function applyLook(player, input, deltaMs) {
  const lookX = Number(input?.look?.x) || 0;
  const lookY = Number(input?.look?.y) || 0;
  const turn = Number(input?.turn) || 0;

  player.rotation.yaw += (turn * TURN_SPEED_RADIANS_PER_MS * deltaMs) + (lookX * LOOK_SENSITIVITY);
  player.rotation.pitch = clamp(
    player.rotation.pitch - (lookY * LOOK_SENSITIVITY),
    -MAX_PITCH,
    MAX_PITCH,
  );
}

function applyMovement(player, input, deltaMs) {
  const move = normalizeMovement(input?.move);
  const speed = WALK_SPEED * (input?.actions?.run ? RUN_MULTIPLIER : 1);
  const forwardX = Math.sin(player.rotation.yaw);
  const forwardZ = Math.cos(player.rotation.yaw);
  const rightX = Math.cos(player.rotation.yaw);
  const rightZ = -Math.sin(player.rotation.yaw);
  const velocityX = (forwardX * move.y) + (rightX * move.x);
  const velocityZ = (forwardZ * move.y) + (rightZ * move.x);
  const deltaSeconds = deltaMs / 1000;

  player.velocity.x = velocityX * speed;
  player.velocity.y = 0;
  player.velocity.z = velocityZ * speed;
  player.position.x += player.velocity.x * deltaSeconds;
  player.position.z += player.velocity.z * deltaSeconds;
  player.isRunning = Boolean(input?.actions?.run);
}

function maybeSelectWeapon(player, input) {
  if (Number.isInteger(input?.weapon?.selectedSlot)) {
    selectWeaponBySlot(player, input.weapon.selectedSlot);
  } else if (input?.weapon?.next) {
    cycleWeapon(player, 1);
  } else if (input?.weapon?.previous) {
    cycleWeapon(player, -1);
  }
}

function buildShotEvent(state, weapon) {
  return {
    weaponId: weapon.id,
    ammoType: weapon.ammoType,
    origin: { ...state.player.position },
    rotation: { ...state.player.rotation },
    timestampMs: state.elapsedTimeMs,
  };
}

function maybeFireWeapon(state, input) {
  const player = state.player;
  const weapon = WEAPON_DEFINITIONS[player.weaponId] ?? WEAPON_DEFINITIONS.pistol;

  player.triggerHeld = Boolean(input?.actions?.fire);

  if (!input?.actions?.fire || player.cooldowns.fireMs > 0) {
    return;
  }

  const availableAmmo = weapon.ammoType === null
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Number(player.ammo?.[weapon.ammoType]) || 0);

  if (availableAmmo < weapon.ammoPerShot) {
    player.lastFireResult = "dry-fire";
    player.cooldowns.fireMs = Math.min(weapon.fireCooldownMs, 120);
    state.events.notifications.push({
      type: "dry-fire",
      weaponId: weapon.id,
      timestampMs: state.elapsedTimeMs,
    });
    return;
  }

  if (weapon.ammoType !== null) {
    player.ammo[weapon.ammoType] = availableAmmo - weapon.ammoPerShot;
  }

  player.cooldowns.fireMs = weapon.fireCooldownMs;
  player.lastAttackAtMs = state.elapsedTimeMs;
  player.lastFireResult = "fired";
  state.events.shotsFired.push(buildShotEvent(state, weapon));
}

function maybeInteract(state, input) {
  const player = state.player;
  const pressedActions = Array.isArray(input?.meta?.pressedActions) ? input.meta.pressedActions : [];

  if (!pressedActions.includes("interact") || player.cooldowns.interactMs > 0) {
    return;
  }

  const interaction = {
    type: "interact",
    position: { ...player.position },
    rotation: { ...player.rotation },
    timestampMs: state.elapsedTimeMs,
    keys: { ...player.keys },
  };

  player.lastInteraction = interaction;
  player.lastInteractionAtMs = state.elapsedTimeMs;
  player.cooldowns.interactMs = INTERACT_COOLDOWN_MS;
  state.events.interactions.push(interaction);
}

export function updatePlayer(state, input = {}, deltaMs = 0) {
  if (!state || typeof state !== "object" || !state.player || typeof state.player !== "object") {
    throw new TypeError("updatePlayer expected a state object with a player.");
  }

  const frameDeltaMs = Math.max(0, Number(deltaMs) || 0);
  const player = state.player;

  resetFrameEvents(state);
  state.elapsedTimeMs = Math.max(0, Number(state.elapsedTimeMs) || 0) + frameDeltaMs;
  player.cooldowns ??= { fireMs: 0, interactMs: 0 };
  player.cooldowns.fireMs = Math.max(0, Number(player.cooldowns.fireMs) - frameDeltaMs || 0);
  player.cooldowns.interactMs = Math.max(0, Number(player.cooldowns.interactMs) - frameDeltaMs || 0);

  maybeSelectWeapon(player, input);
  applyLook(player, input, frameDeltaMs);
  applyMovement(player, input, frameDeltaMs);
  maybeFireWeapon(state, input);
  maybeInteract(state, input);

  return state;
}
