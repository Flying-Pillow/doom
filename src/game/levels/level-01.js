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

export const LEVEL_01 = deepFreeze({
  id: "level-01",
  index: 1,
  title: "Hangar Breach",
  nextLevelId: "level-02",
  musicTrackId: "level-01",
  spawn: {
    position: { x: 0, y: 0, z: 0 },
    rotation: { yaw: 0, pitch: 0, roll: 0 },
  },
  player: {
    health: 100,
    armor: 0,
    ammo: {
      bullets: 50,
      shells: 0,
      rockets: 0,
      cells: 0,
    },
    availableWeaponIds: ["fists", "pistol"],
    weaponId: "pistol",
  },
  objective: {
    title: "Secure the hangar lift",
    description: "Break through the guard detail, recover the blue keycard, and reactivate the exit lift.",
    steps: {
      findKey: "Recover the blue keycard from the hangar floor.",
      unlockDoor: "Return to the blue security door.",
      clearExit: "Clear the hangar lift approach.",
      reachExit: "Ride the lift to the foundry.",
    },
  },
  enemies: [
    {
      id: "hangar-trooper-1",
      type: "trooper",
      health: 18,
      position: { x: 0, y: 0, z: 6 },
    },
    {
      id: "hangar-imp-1",
      type: "imp",
      health: 30,
      position: { x: 4, y: 0, z: 14 },
    },
    {
      id: "hangar-demon-1",
      type: "demon",
      health: 60,
      position: { x: -3, y: 0, z: 18 },
    },
  ],
  pickups: [
    {
      id: "hangar-medkit-1",
      kind: "health",
      amount: 25,
      position: { x: -1.5, y: 0, z: 3 },
    },
    {
      id: "hangar-shells-1",
      kind: "ammo",
      ammoType: "shells",
      amount: 4,
      position: { x: 7.4, y: 0, z: 19.6 },
    },
    {
      id: "hangar-shotgun-1",
      kind: "weapon",
      weaponId: "shotgun",
      ammoType: "shells",
      amount: 2,
      position: { x: 7.8, y: 0, z: 20.2 },
    },
    {
      id: "hangar-blue-key",
      kind: "key",
      color: "blue",
      position: { x: 8, y: 0, z: 20 },
    },
  ],
  doors: [
    {
      id: "hangar-blue-door",
      kind: "key-door",
      requiredKey: "blue",
      color: "blue",
      locked: true,
      radius: 1.75,
      position: { x: 0, y: 0, z: 24 },
    },
    {
      id: "hangar-exit",
      kind: "exit",
      locked: true,
      radius: 2,
      position: { x: 0, y: 0, z: 30 },
    },
  ],
});
