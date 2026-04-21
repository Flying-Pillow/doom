const ENEMY_ARCHETYPES = Object.freeze({
  trooper: Object.freeze({
    maxHealth: 20,
    speed: 2.8,
    detectionRange: 22,
    attackRange: 14,
    attackCooldownMs: 900,
    attackDamage: 8,
    attackKind: "hitscan",
    deathDurationMs: 450,
  }),
  imp: Object.freeze({
    maxHealth: 30,
    speed: 2.4,
    detectionRange: 24,
    attackRange: 16,
    attackCooldownMs: 1200,
    attackDamage: 14,
    attackKind: "projectile",
    projectileSpeed: 10,
    deathDurationMs: 550,
  }),
  demon: Object.freeze({
    maxHealth: 60,
    speed: 3.4,
    detectionRange: 20,
    attackRange: 2.1,
    attackCooldownMs: 700,
    attackDamage: 18,
    attackKind: "melee",
    deathDurationMs: 500,
  }),
});

const DEFAULT_ARCHETYPE = Object.freeze({
  maxHealth: 20,
  speed: 2.5,
  detectionRange: 18,
  attackRange: 3,
  attackCooldownMs: 1000,
  attackDamage: 6,
  attackKind: "melee",
  deathDurationMs: 500,
});

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getArchetype(enemy) {
  return ENEMY_ARCHETYPES[enemy?.type] ?? DEFAULT_ARCHETYPE;
}

function ensureVector3(vector = {}) {
  return {
    x: Number(vector.x) || 0,
    y: Number(vector.y) || 0,
    z: Number(vector.z) || 0,
  };
}

function ensureEnemyState(enemy) {
  const archetype = getArchetype(enemy);
  const maxHealth = Math.max(1, Number(enemy.maxHealth ?? archetype.maxHealth) || archetype.maxHealth);
  const hasAttackCooldown = Number.isFinite(enemy?.cooldowns?.attackMs);
  const initialAttackCooldownMs = archetype.attackKind === "melee" ? 0 : archetype.attackCooldownMs;

  enemy.position = ensureVector3(enemy.position);
  enemy.velocity = ensureVector3(enemy.velocity);
  enemy.health = clamp(Number(enemy.health ?? maxHealth) || 0, 0, maxHealth);
  enemy.maxHealth = maxHealth;
  enemy.aiState = typeof enemy.aiState === "string" && enemy.aiState.trim() !== "" ? enemy.aiState : "idle";
  enemy.alertState = typeof enemy.alertState === "string" && enemy.alertState.trim() !== "" ? enemy.alertState : "idle";
  enemy.cooldowns ??= {};
  enemy.cooldowns.attackMs = hasAttackCooldown
    ? Math.max(0, Number(enemy.cooldowns.attackMs) || 0)
    : initialAttackCooldownMs;
  enemy.rotation ??= {};
  enemy.rotation.yaw = Number(enemy.rotation.yaw) || 0;
  enemy.rotation.pitch = Number(enemy.rotation.pitch) || 0;
  enemy.rotation.roll = Number(enemy.rotation.roll) || 0;
  enemy.deathState = typeof enemy.deathState === "string" && enemy.deathState.trim() !== "" ? enemy.deathState : null;
  enemy.deathElapsedMs = Math.max(0, Number(enemy.deathElapsedMs) || 0);

  return archetype;
}

function faceTarget(enemy, direction) {
  enemy.rotation.yaw = Math.atan2(direction.x, direction.z);
}

function stopEnemy(enemy) {
  enemy.velocity.x = 0;
  enemy.velocity.y = 0;
  enemy.velocity.z = 0;
}

function transitionToDeath(enemy) {
  enemy.aiState = "dying";
  enemy.alertState = "dead";
  enemy.deathState = "dying";
  enemy.deathElapsedMs = 0;
  enemy.cooldowns.attackMs = 0;
  stopEnemy(enemy);
}

function advanceDeath(enemy, archetype, deltaMs) {
  if (enemy.deathState === "dead" || enemy.aiState === "dead") {
    enemy.aiState = "dead";
    enemy.deathState = "dead";
    stopEnemy(enemy);
    return;
  }

  if (enemy.deathState !== "dying") {
    transitionToDeath(enemy);
  }

  enemy.deathElapsedMs += deltaMs;

  if (enemy.deathElapsedMs >= archetype.deathDurationMs) {
    enemy.aiState = "dead";
    enemy.deathState = "dead";
    stopEnemy(enemy);
  }
}

function createEnemyProjectile(state, enemy, archetype, direction) {
  state.projectiles ??= [];

  state.projectiles.push({
    id: `${enemy.id ?? enemy.type ?? "enemy"}-projectile-${Math.max(0, Number(state.elapsedTimeMs) || 0)}-${state.projectiles.length}`,
    owner: "enemy",
    enemyId: enemy.id ?? null,
    type: `${enemy.type ?? "enemy"}-projectile`,
    position: { ...enemy.position },
    velocity: {
      x: direction.x * archetype.projectileSpeed,
      y: direction.y * archetype.projectileSpeed,
      z: direction.z * archetype.projectileSpeed,
    },
    damage: archetype.attackDamage,
    radius: 0.9,
    maxDistance: archetype.attackRange * 1.6,
    distanceTraveled: 0,
    active: true,
  });
}

function queueEnemyAttack(state, enemy, archetype, distanceToPlayer) {
  state.events ??= {};
  state.events.enemyAttacks = Array.isArray(state.events.enemyAttacks) ? state.events.enemyAttacks : [];

  if (archetype.attackKind === "projectile") {
    const magnitude = Math.max(distanceToPlayer, 1e-6);
    createEnemyProjectile(state, enemy, archetype, {
      x: (state.player.position.x - enemy.position.x) / magnitude,
      y: (state.player.position.y - enemy.position.y) / magnitude,
      z: (state.player.position.z - enemy.position.z) / magnitude,
    });
    return;
  }

  state.events.enemyAttacks.push({
    enemyId: enemy.id ?? null,
    attackKind: archetype.attackKind,
    damage: archetype.attackDamage,
    origin: { ...enemy.position },
    timestampMs: Math.max(0, Number(state.elapsedTimeMs) || 0),
  });
}

export function updateEnemies(state, deltaMs = 0) {
  if (!state || typeof state !== "object" || !Array.isArray(state.enemies) || !state.player || typeof state.player !== "object") {
    throw new TypeError("updateEnemies expected a state object with player and enemies.");
  }

  const frameDeltaMs = Math.max(0, Number(deltaMs) || 0);
  state.events ??= {};
  state.events.enemyAttacks = [];
  state.projectiles ??= [];

  for (const enemy of state.enemies) {
    if (!enemy || typeof enemy !== "object") {
      continue;
    }

    const archetype = ensureEnemyState(enemy);
    const attackWasCoolingDown = enemy.cooldowns.attackMs > 0;

    if (enemy.cooldowns.attackMs > 0) {
      enemy.cooldowns.attackMs = Math.max(0, enemy.cooldowns.attackMs - frameDeltaMs);
    }

    if (enemy.health <= 0 || enemy.aiState === "dying" || enemy.aiState === "dead") {
      advanceDeath(enemy, archetype, frameDeltaMs);
      continue;
    }

    const directionToPlayer = {
      x: state.player.position.x - enemy.position.x,
      y: state.player.position.y - enemy.position.y,
      z: state.player.position.z - enemy.position.z,
    };
    const distanceToPlayer = Math.hypot(
      directionToPlayer.x,
      directionToPlayer.y,
      directionToPlayer.z,
    );

    if (distanceToPlayer <= archetype.detectionRange || enemy.alertState === "alerted") {
      enemy.alertState = "alerted";
    }

    if (enemy.alertState !== "alerted") {
      enemy.aiState = "idle";
      stopEnemy(enemy);
      continue;
    }

    if (distanceToPlayer > 1e-6) {
      faceTarget(enemy, directionToPlayer);
    }

    if (distanceToPlayer > archetype.attackRange) {
      const step = (archetype.speed * frameDeltaMs) / 1000;
      const scale = step / Math.max(distanceToPlayer, 1e-6);

      enemy.aiState = "pursuing";
      enemy.velocity.x = directionToPlayer.x * (archetype.speed / Math.max(distanceToPlayer, 1e-6));
      enemy.velocity.y = directionToPlayer.y * (archetype.speed / Math.max(distanceToPlayer, 1e-6));
      enemy.velocity.z = directionToPlayer.z * (archetype.speed / Math.max(distanceToPlayer, 1e-6));
      enemy.position.x += directionToPlayer.x * scale;
      enemy.position.y += directionToPlayer.y * scale;
      enemy.position.z += directionToPlayer.z * scale;
      continue;
    }

    enemy.aiState = "attacking";
    stopEnemy(enemy);

    if (enemy.cooldowns.attackMs > 0 || (archetype.attackKind === "melee" && attackWasCoolingDown)) {
      continue;
    }

    queueEnemyAttack(state, enemy, archetype, distanceToPlayer);
    enemy.cooldowns.attackMs = archetype.attackCooldownMs;
    enemy.lastAttackAtMs = Math.max(0, Number(state.elapsedTimeMs) || 0);
  }

  return state;
}
