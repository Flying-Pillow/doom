function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }

  Object.freeze(value);

  if (Array.isArray(value)) {
    for (const entry of value) {
      deepFreeze(entry);
    }
  } else {
    for (const entry of Object.values(value)) {
      deepFreeze(entry);
    }
  }

  return value;
}

export const LEVEL_02 = deepFreeze({
  id: "level-02",
  index: 2,
  title: "Foundry Lockdown",
  nextLevelId: null,
  musicTrackId: "level-02",
  spawn: {
    position: { x: -6, y: 0, z: -2 },
    rotation: { yaw: Math.PI / 2, pitch: 0, roll: 0 },
  },
  player: {
    health: 100,
    armor: 25,
    ammo: {
      bullets: 24,
      shells: 8,
      rockets: 0,
      cells: 0,
    },
    availableWeaponIds: ["fists", "pistol", "shotgun"],
    weaponId: "shotgun",
  },
  objective: {
    title: "Stabilize the foundry",
    description: "Push through the lockdown, capture the yellow keycard, and unlock the furnace elevator.",
    steps: {
      findKey: "Recover the yellow keycard from the processing floor.",
      unlockDoor: "Unlock the yellow blast door.",
      clearExit: "Eliminate resistance around the furnace elevator.",
      reachExit: "Enter the furnace elevator.",
    },
  },
  enemies: [
    {
      id: "foundry-trooper-1",
      type: "trooper",
      health: 20,
      position: { x: -2, y: 0, z: 8 },
    },
    {
      id: "foundry-imp-1",
      type: "imp",
      health: 30,
      position: { x: 5, y: 0, z: 16 },
    },
    {
      id: "foundry-imp-2",
      type: "imp",
      health: 30,
      position: { x: -8, y: 0, z: 18 },
    },
    {
      id: "foundry-demon-1",
      type: "demon",
      health: 60,
      position: { x: 0, y: 0, z: 22 },
    },
  ],
  pickups: [
    {
      id: "foundry-armor-1",
      kind: "armor",
      amount: 25,
      position: { x: -5, y: 0, z: 4 },
    },
    {
      id: "foundry-shells-1",
      kind: "ammo",
      ammoType: "shells",
      amount: 4,
      position: { x: 9.2, y: 0, z: 24.5 },
    },
    {
      id: "foundry-yellow-key",
      kind: "key",
      color: "yellow",
      position: { x: 9, y: 0, z: 24 },
    },
  ],
  doors: [
    {
      id: "foundry-yellow-door",
      kind: "key-door",
      requiredKey: "yellow",
      color: "yellow",
      locked: true,
      radius: 1.75,
      position: { x: 0, y: 0, z: 28 },
    },
    {
      id: "foundry-exit",
      kind: "exit",
      locked: true,
      radius: 2,
      position: { x: 0, y: 0, z: 35 },
    },
  ],
});
