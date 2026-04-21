import { WEAPON_DEFINITIONS } from "./state.js";

const WEAPON_COMBAT_PROFILES = Object.freeze({
  fists: Object.freeze({
    mode: "hitscan",
    damage: 15,
    range: 2.4,
    maxAngleRadians: Math.PI / 3,
  }),
  pistol: Object.freeze({
    mode: "hitscan",
    damage: 18,
    range: 32,
    maxAngleRadians: Math.PI / 18,
  }),
  shotgun: Object.freeze({
    mode: "hitscan",
    damage: 45,
    range: 24,
    maxAngleRadians: Math.PI / 10,
  }),
  chaingun: Object.freeze({
    mode: "hitscan",
    damage: 12,
    range: 32,
    maxAngleRadians: Math.PI / 16,
  }),
  rocketLauncher: Object.freeze({
    mode: "projectile",
    damage: 100,
    speed: 18,
    radius: 0.9,
    explosionRadius: 2.8,
    maxDistance: 36,
  }),
  plasma: Object.freeze({
    mode: "projectile",
    damage: 20,
    speed: 24,
    radius: 0.75,
    maxDistance: 32,
  }),
  bfg: Object.freeze({
    mode: "projectile",
    damage: 120,
    speed: 15,
    radius: 1.2,
    explosionRadius: 4,
    maxDistance: 30,
  }),
});

const DEFAULT_WEAPON_PROFILE = Object.freeze({
  mode: "hitscan",
  damage: 10,
  range: 20,
  maxAngleRadians: Math.PI / 12,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function ensureVector3(vector = {}) {
  return {
    x: Number(vector.x) || 0,
    y: Number(vector.y) || 0,
    z: Number(vector.z) || 0,
  };
}

function ensureCombatState(state) {
  state.events ??= {};
  state.events.notifications ??= [];
  state.events.damage = [];
  state.events.pickupsCollected = [];
  state.events.enemyDefeated = [];
  state.events.enemyAttacks = Array.isArray(state.events.enemyAttacks) ? state.events.enemyAttacks : [];
  state.events.shotsFired = Array.isArray(state.events.shotsFired) ? state.events.shotsFired : [];
  state.projectiles = Array.isArray(state.projectiles) ? state.projectiles : [];
  state.pickups = Array.isArray(state.pickups) ? state.pickups : [];
  state.enemies = Array.isArray(state.enemies) ? state.enemies : [];
}

function getWeaponProfile(weaponId) {
  return WEAPON_COMBAT_PROFILES[weaponId] ?? DEFAULT_WEAPON_PROFILE;
}

function isEnemyAlive(enemy) {
  return enemy
    && typeof enemy === "object"
    && (Number(enemy.health) || 0) > 0
    && enemy.aiState !== "dying"
    && enemy.aiState !== "dead"
    && enemy.deathState !== "dead";
}

function getForwardVector(rotation = {}) {
  const yaw = Number(rotation.yaw) || 0;
  const pitch = Number(rotation.pitch) || 0;
  const planarMagnitude = Math.cos(pitch);

  return {
    x: Math.sin(yaw) * planarMagnitude,
    y: -Math.sin(pitch),
    z: Math.cos(yaw) * planarMagnitude,
  };
}

function normalize(vector) {
  const magnitude = Math.hypot(vector.x, vector.y, vector.z);

  if (magnitude <= 1e-6) {
    return {
      x: 0,
      y: 0,
      z: 1,
    };
  }

  return {
    x: vector.x / magnitude,
    y: vector.y / magnitude,
    z: vector.z / magnitude,
  };
}

function getDistance(left, right) {
  return Math.hypot(
    (Number(right.x) || 0) - (Number(left.x) || 0),
    (Number(right.y) || 0) - (Number(left.y) || 0),
    (Number(right.z) || 0) - (Number(left.z) || 0),
  );
}

function pushNotification(state, notification) {
  state.events.notifications.push({
    timestampMs: Math.max(0, Number(state.elapsedTimeMs) || 0),
    ...notification,
  });
}

function applyDamageToEnemy(state, enemy, amount, source = {}) {
  if (!isEnemyAlive(enemy)) {
    return 0;
  }

  const previousHealth = Math.max(0, Number(enemy.health) || 0);
  const appliedDamage = clamp(Number(amount) || 0, 0, previousHealth);

  if (appliedDamage <= 0) {
    return 0;
  }

  enemy.health = previousHealth - appliedDamage;
  enemy.alertState = "alerted";
  enemy.lastDamageSource = source;
  enemy.lastDamagedAtMs = Math.max(0, Number(state.elapsedTimeMs) || 0);

  state.events.damage.push({
    target: "enemy",
    enemyId: enemy.id ?? null,
    amount: appliedDamage,
    source,
  });

  if (enemy.health <= 0) {
    enemy.health = 0;
    enemy.aiState = "dying";
    enemy.deathState = "dying";
    enemy.deathElapsedMs = 0;
    enemy.cooldowns ??= {};
    enemy.cooldowns.attackMs = 0;
    enemy.velocity = ensureVector3();
    state.events.enemyDefeated.push({
      enemyId: enemy.id ?? null,
      enemyType: enemy.type ?? null,
      source,
    });
    pushNotification(state, {
      type: "enemy-defeated",
      enemyId: enemy.id ?? null,
      enemyType: enemy.type ?? null,
    });
  }

  return appliedDamage;
}

function applyDamageToPlayer(state, amount, source = {}) {
  const player = state.player;
  const previousHealth = Math.max(0, Number(player.health) || 0);

  if (previousHealth <= 0) {
    return 0;
  }

  const rawDamage = Math.max(0, Number(amount) || 0);

  if (rawDamage <= 0) {
    return 0;
  }

  const armor = Math.max(0, Number(player.armor) || 0);
  const absorbedByArmor = source.armorBypass ? 0 : Math.min(armor, Math.floor(rawDamage / 3));
  const healthDamage = Math.min(previousHealth, rawDamage - absorbedByArmor);

  player.armor = armor - absorbedByArmor;
  player.health = previousHealth - healthDamage;
  player.lastDamageAtMs = Math.max(0, Number(state.elapsedTimeMs) || 0);
  player.lastDamageSource = source;

  state.events.damage.push({
    target: "player",
    amount: healthDamage + absorbedByArmor,
    healthDamage,
    armorDamage: absorbedByArmor,
    source,
  });

  if (player.health <= 0) {
    player.health = 0;
    pushNotification(state, {
      type: "player-defeated",
      source,
    });
  }

  return healthDamage + absorbedByArmor;
}

function findShotTarget(enemies, origin, forward, profile) {
  const minimumDot = Math.cos(profile.maxAngleRadians);
  let bestTarget = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const enemy of enemies) {
    if (!isEnemyAlive(enemy)) {
      continue;
    }

    const offset = {
      x: enemy.position.x - origin.x,
      y: enemy.position.y - origin.y,
      z: enemy.position.z - origin.z,
    };
    const distance = Math.hypot(offset.x, offset.y, offset.z);

    if (distance > profile.range || distance <= 1e-6) {
      continue;
    }

    const direction = {
      x: offset.x / distance,
      y: offset.y / distance,
      z: offset.z / distance,
    };
    const dot = (direction.x * forward.x) + (direction.y * forward.y) + (direction.z * forward.z);

    if (dot < minimumDot || distance >= bestDistance) {
      continue;
    }

    bestTarget = enemy;
    bestDistance = distance;
  }

  return bestTarget;
}

function spawnPlayerProjectile(state, shot, profile) {
  const forward = normalize(getForwardVector(shot.rotation));

  state.projectiles.push({
    id: `${shot.weaponId ?? "weapon"}-projectile-${Math.max(0, Number(state.elapsedTimeMs) || 0)}-${state.projectiles.length}`,
    owner: "player",
    weaponId: shot.weaponId,
    position: ensureVector3(shot.origin),
    velocity: {
      x: forward.x * profile.speed,
      y: forward.y * profile.speed,
      z: forward.z * profile.speed,
    },
    damage: profile.damage,
    radius: profile.radius ?? 0.75,
    explosionRadius: profile.explosionRadius ?? null,
    maxDistance: profile.maxDistance ?? 32,
    distanceTraveled: 0,
    active: true,
  });
}

function resolveShotEvents(state) {
  const shots = [...state.events.shotsFired];

  for (const shot of shots) {
    const weaponId = typeof shot.weaponId === "string" ? shot.weaponId : state.player.weaponId;
    const profile = getWeaponProfile(weaponId);

    if (profile.mode === "projectile") {
      spawnPlayerProjectile(state, shot, profile);
      continue;
    }

    const origin = ensureVector3(shot.origin ?? state.player.position);
    const forward = normalize(getForwardVector(shot.rotation ?? state.player.rotation));
    const target = findShotTarget(state.enemies, origin, forward, profile);

    if (!target) {
      continue;
    }

    applyDamageToEnemy(state, target, profile.damage, {
      type: "player-shot",
      weaponId,
      ammoType: WEAPON_DEFINITIONS[weaponId]?.ammoType ?? null,
    });
  }

  state.events.shotsFired = [];
}

function resolveEnemyAttackEvents(state) {
  const attacks = [...state.events.enemyAttacks];

  for (const attack of attacks) {
    applyDamageToPlayer(state, attack.damage, {
      type: "enemy-attack",
      enemyId: attack.enemyId ?? null,
      attackKind: attack.attackKind ?? "melee",
    });
  }

  state.events.enemyAttacks = [];
}

function applyProjectileImpact(state, projectile, target) {
  const damage = Math.max(0, Number(projectile.damage) || 0);

  if (projectile.owner === "enemy") {
    applyDamageToPlayer(state, damage, {
      type: "projectile",
      owner: "enemy",
      enemyId: projectile.enemyId ?? null,
      projectileType: projectile.type ?? null,
    });
  } else {
    if (target) {
      applyDamageToEnemy(state, target, damage, {
        type: "projectile",
        owner: projectile.owner ?? "player",
        weaponId: projectile.weaponId ?? null,
      });
    }
  }

  if (Number(projectile.explosionRadius) > 0) {
    const explosionRadius = Number(projectile.explosionRadius);

    if (projectile.owner === "enemy") {
      if (getDistance(projectile.position, state.player.position) <= explosionRadius) {
        applyDamageToPlayer(state, Math.ceil(damage / 2), {
          type: "explosion",
          owner: "enemy",
          enemyId: projectile.enemyId ?? null,
        });
      }
    } else {
      for (const enemy of state.enemies) {
        if (!isEnemyAlive(enemy) || getDistance(projectile.position, enemy.position) > explosionRadius) {
          continue;
        }

        applyDamageToEnemy(state, enemy, Math.ceil(damage / 2), {
          type: "explosion",
          owner: projectile.owner ?? "player",
          weaponId: projectile.weaponId ?? null,
        });
      }
    }
  }

  projectile.active = false;
  projectile.consumed = true;
}

function advanceProjectiles(state, deltaMs) {
  const deltaSeconds = Math.max(0, Number(deltaMs) || 0) / 1000;

  for (const projectile of state.projectiles) {
    if (!projectile || projectile.active === false || projectile.consumed) {
      continue;
    }

    projectile.position = ensureVector3(projectile.position);
    projectile.velocity = ensureVector3(projectile.velocity);
    projectile.radius = Math.max(0.1, Number(projectile.radius) || 0.75);
    projectile.maxDistance = Math.max(projectile.radius, Number(projectile.maxDistance) || 32);
    projectile.distanceTraveled = Math.max(0, Number(projectile.distanceTraveled) || 0);

    const step = {
      x: projectile.velocity.x * deltaSeconds,
      y: projectile.velocity.y * deltaSeconds,
      z: projectile.velocity.z * deltaSeconds,
    };

    projectile.position.x += step.x;
    projectile.position.y += step.y;
    projectile.position.z += step.z;
    projectile.distanceTraveled += Math.hypot(step.x, step.y, step.z);

    if (projectile.owner === "enemy") {
      if (getDistance(projectile.position, state.player.position) <= projectile.radius) {
        applyProjectileImpact(state, projectile, state.player);
        continue;
      }
    } else {
      const target = state.enemies.find((enemy) =>
        isEnemyAlive(enemy) && getDistance(projectile.position, enemy.position) <= projectile.radius);

      if (target) {
        applyProjectileImpact(state, projectile, target);
        continue;
      }
    }

    if (projectile.distanceTraveled >= projectile.maxDistance) {
      projectile.active = false;
      projectile.consumed = true;
    }
  }

  state.projectiles = state.projectiles.filter((projectile) => projectile && !projectile.consumed);
}

function pickupWouldApply(player, pickup) {
  const kind = String(pickup.kind ?? pickup.type ?? "").toLowerCase();

  if (kind === "health" || kind === "medkit" || kind === "stimpack") {
    return (Number(player.health) || 0) < Math.max(0, Number(pickup.maxHealth ?? 100) || 100);
  }

  if (kind === "armor") {
    return (Number(player.armor) || 0) < Math.max(0, Number(pickup.maxArmor ?? 200) || 200);
  }

  if (kind === "ammo") {
    const ammoType = pickup.ammoType;
    return typeof ammoType === "string" && Math.max(0, Number(pickup.amount) || 0) > 0;
  }

  if (kind === "key" || kind === "keycard") {
    return !player.keys?.[pickup.color];
  }

  if (kind === "weapon") {
    const ammoType = pickup.ammoType;
    const ammoGrant = Math.max(0, Number(pickup.amount) || 0);

    return !player.availableWeaponIds?.includes(pickup.weaponId)
      || (typeof ammoType === "string" && ammoGrant > 0);
  }

  return false;
}

function applyPickupToPlayer(state, pickup) {
  const player = state.player;
  const kind = String(pickup.kind ?? pickup.type ?? "").toLowerCase();
  let applied = false;

  if (kind === "health" || kind === "medkit" || kind === "stimpack") {
    const maxHealth = Math.max(0, Number(pickup.maxHealth ?? 100) || 100);
    const amount = Math.max(0, Number(pickup.amount) || 0);
    const nextHealth = Math.min(maxHealth, (Number(player.health) || 0) + amount);
    applied = nextHealth !== player.health;
    player.health = nextHealth;
  } else if (kind === "armor") {
    const maxArmor = Math.max(0, Number(pickup.maxArmor ?? 200) || 200);
    const amount = Math.max(0, Number(pickup.amount) || 0);
    const nextArmor = Math.min(maxArmor, (Number(player.armor) || 0) + amount);
    applied = nextArmor !== player.armor;
    player.armor = nextArmor;
  } else if (kind === "ammo") {
    const ammoType = pickup.ammoType;
    const amount = Math.max(0, Number(pickup.amount) || 0);

    if (typeof ammoType === "string" && ammoType in player.ammo && amount > 0) {
      player.ammo[ammoType] += amount;
      applied = true;
    }
  } else if (kind === "key" || kind === "keycard") {
    const color = typeof pickup.color === "string" ? pickup.color : null;

    if (color && color in player.keys && !player.keys[color]) {
      player.keys[color] = true;
      applied = true;
    }
  } else if (kind === "weapon") {
    const weaponId = typeof pickup.weaponId === "string" ? pickup.weaponId : null;

    if (weaponId && !player.availableWeaponIds.includes(weaponId)) {
      player.availableWeaponIds = [...player.availableWeaponIds, weaponId];
      player.availableWeaponIds.sort((leftId, rightId) =>
        (WEAPON_DEFINITIONS[leftId]?.slot ?? Number.MAX_SAFE_INTEGER)
        - (WEAPON_DEFINITIONS[rightId]?.slot ?? Number.MAX_SAFE_INTEGER));

      if (pickup.autoEquip !== false) {
        player.weaponId = weaponId;
      }

      applied = true;
    }

    if (typeof pickup.ammoType === "string" && pickup.ammoType in player.ammo) {
      const amount = Math.max(0, Number(pickup.amount) || 0);

      if (amount > 0) {
        player.ammo[pickup.ammoType] += amount;
        applied = true;
      }
    }
  }

  if (!applied) {
    return false;
  }

  pickup.collected = true;
  pickup.active = false;
  pickup.collectedAtMs = Math.max(0, Number(state.elapsedTimeMs) || 0);
  state.events.pickupsCollected.push({
    pickupId: pickup.id ?? null,
    kind: pickup.kind ?? pickup.type ?? null,
  });
  pushNotification(state, {
    type: "pickup-collected",
    pickupId: pickup.id ?? null,
    kind: pickup.kind ?? pickup.type ?? null,
  });

  return true;
}

function resolvePickups(state) {
  for (const pickup of state.pickups) {
    if (!pickup || pickup.collected || pickup.active === false) {
      continue;
    }

    pickup.position = ensureVector3(pickup.position);
    pickup.radius = Math.max(0.5, Number(pickup.radius) || 1);

    if (getDistance(state.player.position, pickup.position) > pickup.radius) {
      continue;
    }

    if (!pickupWouldApply(state.player, pickup)) {
      continue;
    }

    applyPickupToPlayer(state, pickup);
  }
}

export function resolveCombat(state, deltaMs = 0) {
  if (!state || typeof state !== "object" || !state.player || typeof state.player !== "object") {
    throw new TypeError("resolveCombat expected a state object with a player.");
  }

  ensureCombatState(state);
  resolveShotEvents(state);
  resolveEnemyAttackEvents(state);
  advanceProjectiles(state, deltaMs);
  resolvePickups(state);

  return state;
}
