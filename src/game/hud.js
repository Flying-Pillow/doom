import { KEY_ORDER, WEAPON_DEFINITIONS } from "./state.js";

const AMMO_LABELS = Object.freeze({
  bullets: "BUL",
  shells: "SHL",
  rockets: "RKT",
  cells: "CEL",
});

function formatNumber(value) {
  return String(Math.max(0, Math.round(Number(value) || 0)));
}

function formatAmmo(player) {
  const weapon = WEAPON_DEFINITIONS[player.weaponId] ?? null;

  if (!weapon || weapon.ammoType === null) {
    return "INF";
  }

  const ammoType = weapon.ammoType;
  const ammoCount = formatNumber(player.ammo?.[ammoType]);
  const ammoLabel = AMMO_LABELS[ammoType] ?? ammoType.toUpperCase();

  return `${ammoCount} ${ammoLabel}`;
}

function formatKeys(keys = {}) {
  const collectedKeys = KEY_ORDER.filter((keyColor) => keys[keyColor])
    .map((keyColor) => keyColor[0].toUpperCase() + keyColor.slice(1));

  return collectedKeys.length > 0 ? collectedKeys.join(" ") : "None";
}

function getObjectiveValue(objectiveState, propertyName, fallbackValue) {
  const value = objectiveState?.[propertyName];
  return typeof value === "string" && value.trim() !== "" ? value : fallbackValue;
}

export function createHudState(state) {
  if (!state || typeof state !== "object" || !state.player || typeof state.player !== "object") {
    throw new TypeError("createHudState expected a state object with a player.");
  }

  const objectiveState = state.objectiveState ?? {};
  const missionTitle = getObjectiveValue(objectiveState, "title", `Mission ${state.currentLevelId ?? ""}`.trim());
  const objectiveDescription = getObjectiveValue(
    objectiveState,
    "description",
    "Push forward through the facility.",
  );
  const objectiveProgress = getObjectiveValue(
    objectiveState,
    "progressText",
    objectiveDescription,
  );
  const objectiveStatus = getObjectiveValue(objectiveState, "status", "active");

  return {
    mission: {
      label: "Mission",
      value: missionTitle,
    },
    status: {
      label: "Status",
      value: objectiveProgress,
    },
    health: {
      label: "Health",
      value: formatNumber(state.player.health),
    },
    armor: {
      label: "Armor",
      value: formatNumber(state.player.armor),
    },
    ammo: {
      label: "Ammo",
      value: formatAmmo(state.player),
    },
    keys: {
      label: "Keys",
      value: formatKeys(state.player.keys),
    },
    objective: {
      title: missionTitle,
      description: objectiveDescription,
      status: objectiveStatus,
      progressText: objectiveProgress,
    },
  };
}

export function syncHudState(state) {
  state.hudState = createHudState(state);
  return state.hudState;
}

export function renderHudLayer(hudLayer, hudState) {
  if (!hudLayer || !Array.isArray(hudLayer.children)) {
    throw new TypeError("renderHudLayer expected a HUD layer with child rows.");
  }

  for (const row of hudLayer.children) {
    for (const slot of row.children ?? []) {
      const slotName = slot.dataset?.hudSlot;
      const hudEntry = slotName ? hudState?.[slotName] : null;

      if (!hudEntry) {
        continue;
      }

      const text = `${hudEntry.label}: ${hudEntry.value}`;
      slot.textContent = text;

      if (slot.dataset) {
        slot.dataset.hudLabel = hudEntry.label.toLowerCase();
        slot.dataset.hudValue = hudEntry.value;
      }

      if (typeof slot.setAttribute === "function") {
        slot.setAttribute("aria-label", text);
      }
    }
  }

  return hudState;
}
