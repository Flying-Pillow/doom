import { ASSET_MANIFEST } from "../../assets/manifest.js";
import { createGameState } from "../state.js";
import { LEVEL_01 } from "./level-01.js";
import { LEVEL_02 } from "./level-02.js";

export const LEVEL_REGISTRY = Object.freeze({
  [LEVEL_01.id]: LEVEL_01,
  [LEVEL_02.id]: LEVEL_02,
});

export const DEFAULT_LEVEL_ID = ASSET_MANIFEST.campaign.startLevelId;

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => cloneValue(entry));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, cloneValue(entry)]),
    );
  }

  return value;
}

function normalizeLevelId(levelId) {
  if (typeof levelId !== "string" || levelId.trim() === "") {
    throw new TypeError("Level IDs must be non-empty strings.");
  }

  return levelId;
}

function getLevelDefinitionOrThrow(levelId) {
  const normalizedLevelId = normalizeLevelId(levelId);
  const level = LEVEL_REGISTRY[normalizedLevelId];

  if (!level) {
    throw new Error(`Unknown level "${normalizedLevelId}".`);
  }

  return level;
}

function countLivingEnemies(state) {
  return state.enemies.filter((enemy) =>
    enemy
      && typeof enemy === "object"
      && (Number(enemy.health) || 0) > 0
      && enemy.aiState !== "dying"
      && enemy.aiState !== "dead"
      && enemy.deathState !== "dead").length;
}

function getDoorKind(door) {
  return typeof door?.kind === "string" ? door.kind : "key-door";
}

function isInteractionNearDoor(interaction, door) {
  const interactionPosition = interaction?.position ?? {};
  const doorPosition = door?.position ?? {};
  const allowedDistance = Math.max(0.5, Number(door?.radius) || 1.5);

  return Math.hypot(
    (Number(interactionPosition.x) || 0) - (Number(doorPosition.x) || 0),
    (Number(interactionPosition.y) || 0) - (Number(doorPosition.y) || 0),
    (Number(interactionPosition.z) || 0) - (Number(doorPosition.z) || 0),
  ) <= allowedDistance;
}

function getNotificationList(state) {
  state.events ??= {};
  state.events.notifications = Array.isArray(state.events.notifications) ? state.events.notifications : [];
  return state.events.notifications;
}

function pushNotification(state, notification) {
  getNotificationList(state).push({
    timestampMs: Math.max(0, Number(state.elapsedTimeMs) || 0),
    ...notification,
  });
}

function getPendingKeyDoors(state) {
  return state.doors.filter((door) => getDoorKind(door) === "key-door" && door.locked !== false);
}

function getExitDoor(state) {
  return state.doors.find((door) => getDoorKind(door) === "exit") ?? null;
}

function formatEnemyPressure(livingEnemyCount) {
  return livingEnemyCount === 1 ? "1 hostile remains." : `${livingEnemyCount} hostiles remain.`;
}

function syncObjectiveState(state, level) {
  const livingEnemyCount = countLivingEnemies(state);
  const pendingKeyDoors = getPendingKeyDoors(state);
  const exitDoor = getExitDoor(state);
  const objectiveState = state.objectiveState ?? {};

  objectiveState.title = level.objective.title;
  objectiveState.description = level.objective.description;
  objectiveState.completed = false;

  if (pendingKeyDoors.length > 0 && state.player.keys?.[pendingKeyDoors[0].requiredKey] !== true) {
    objectiveState.status = "active";
    objectiveState.progressText = `${level.objective.steps.findKey} ${formatEnemyPressure(livingEnemyCount)}`;
  } else if (pendingKeyDoors.length > 0) {
    objectiveState.status = "active";
    objectiveState.progressText = level.objective.steps.unlockDoor;
  } else if (exitDoor?.locked !== false) {
    objectiveState.status = "active";
    objectiveState.progressText = `${level.objective.steps.clearExit} ${formatEnemyPressure(livingEnemyCount)}`;
  } else {
    objectiveState.status = "complete";
    objectiveState.progressText = level.objective.steps.reachExit;
    objectiveState.completed = true;
  }

  state.objectiveState = objectiveState;
}

function maybeUnlockKeyDoors(state) {
  const interactions = Array.isArray(state.events?.interactions) ? state.events.interactions : [];

  for (const door of state.doors) {
    if (getDoorKind(door) !== "key-door" || door.locked === false) {
      continue;
    }

    for (const interaction of interactions) {
      if (!isInteractionNearDoor(interaction, door)) {
        continue;
      }

      if (state.player.keys?.[door.requiredKey] === true) {
        door.locked = false;
        door.unlockedAtMs = Math.max(0, Number(state.elapsedTimeMs) || 0);
        pushNotification(state, {
          type: "door-unlocked",
          doorId: door.id ?? null,
          requiredKey: door.requiredKey ?? null,
          soundId: "doorUnlock",
        });
      }

      break;
    }
  }
}

function maybeUnlockExitDoor(state) {
  const exitDoor = getExitDoor(state);

  if (!exitDoor || exitDoor.locked === false) {
    return;
  }

  if (getPendingKeyDoors(state).length > 0 || countLivingEnemies(state) > 0) {
    return;
  }

  exitDoor.locked = false;
  exitDoor.unlockedAtMs = Math.max(0, Number(state.elapsedTimeMs) || 0);
  pushNotification(state, {
    type: "exit-unlocked",
    doorId: exitDoor.id ?? null,
    soundId: "doorUnlock",
  });
}

function maybeTransitionToNextLevel(state, level) {
  const exitDoor = getExitDoor(state);
  const interactions = Array.isArray(state.events?.interactions) ? state.events.interactions : [];

  if (!exitDoor || exitDoor.locked !== false) {
    return state;
  }

  const usedExit = interactions.some((interaction) => isInteractionNearDoor(interaction, exitDoor));

  if (!usedExit || !level.nextLevelId) {
    return state;
  }

  pushNotification(state, {
    type: "level-complete",
    levelId: level.id,
    nextLevelId: level.nextLevelId,
    soundId: "levelExit",
  });

  return createLevelState(level.nextLevelId, { playerState: state.player });
}

export function getLevelDefinition(levelId) {
  return getLevelDefinitionOrThrow(levelId);
}

export function getLevelLoaderPath(levelId) {
  return ASSET_MANIFEST.levels[normalizeLevelId(levelId)]?.modulePath ?? null;
}

export function createLevelState(levelId, options = {}) {
  const level = getLevelDefinitionOrThrow(levelId);
  const carryOverPlayer = options.playerState && typeof options.playerState === "object"
    ? cloneValue(options.playerState)
    : null;
  const player = carryOverPlayer
    ? {
        ...carryOverPlayer,
        position: cloneValue(level.spawn.position),
        rotation: cloneValue(level.spawn.rotation),
        velocity: { x: 0, y: 0, z: 0 },
        cooldowns: { fireMs: 0, interactMs: 0 },
        keys: {},
        lastInteraction: null,
        lastInteractionAtMs: null,
        triggerHeld: false,
        isRunning: false,
      }
    : {
        ...cloneValue(level.player),
        position: cloneValue(level.spawn.position),
        rotation: cloneValue(level.spawn.rotation),
      };
  const state = createGameState({
    currentLevelId: level.id,
    player,
    enemies: cloneValue(level.enemies),
    pickups: cloneValue(level.pickups),
    doors: cloneValue(level.doors),
    objectiveState: {
      title: level.objective.title,
      description: level.objective.description,
      status: "active",
      progressText: level.objective.steps.findKey,
      completed: false,
    },
  });

  syncObjectiveState(state, level);
  return state;
}

export function updateLevelProgression(state) {
  if (!state || typeof state !== "object" || !state.player || typeof state.player !== "object") {
    throw new TypeError("updateLevelProgression expected a state object with a player.");
  }

  const level = getLevelDefinitionOrThrow(state.currentLevelId);

  maybeUnlockKeyDoors(state);
  maybeUnlockExitDoor(state);
  syncObjectiveState(state, level);

  return maybeTransitionToNextLevel(state, level);
}
