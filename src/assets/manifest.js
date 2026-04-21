export const ASSET_MANIFEST = Object.freeze({
  campaign: Object.freeze({
    startLevelId: "level-01",
  }),
  levels: Object.freeze({
    "level-01": Object.freeze({
      id: "level-01",
      title: "Hangar Breach",
      modulePath: "../game/levels/level-01.js",
      musicTrackId: "level-01",
    }),
    "level-02": Object.freeze({
      id: "level-02",
      title: "Foundry Lockdown",
      modulePath: "../game/levels/level-02.js",
      musicTrackId: "level-02",
    }),
  }),
  sounds: Object.freeze({
    pickupKeycard: Object.freeze({
      src: "/audio/sfx/pickup-keycard.wav",
      volume: 0.8,
    }),
    doorUnlock: Object.freeze({
      src: "/audio/sfx/door-unlock.wav",
      volume: 0.7,
    }),
    levelExit: Object.freeze({
      src: "/audio/sfx/level-exit.wav",
      volume: 0.75,
    }),
  }),
  music: Object.freeze({
    "level-01": Object.freeze({
      src: "/audio/music/hangar-breach.ogg",
      volume: 0.55,
    }),
    "level-02": Object.freeze({
      src: "/audio/music/foundry-lockdown.ogg",
      volume: 0.55,
    }),
  }),
});
