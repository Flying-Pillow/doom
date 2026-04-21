function clampVolume(volume) {
  const numericVolume = Number(volume);

  if (!Number.isFinite(numericVolume)) {
    throw new TypeError("Audio volume values must be finite numbers.");
  }

  return Math.max(0, Math.min(1, numericVolume));
}

function normalizeTrackDescriptor(descriptor, defaultLoop) {
  if (!descriptor || typeof descriptor !== "object") {
    throw new TypeError("Audio track descriptors must be objects.");
  }

  if (typeof descriptor.src !== "string" || descriptor.src.trim() === "") {
    throw new TypeError("Audio track descriptors require a non-empty src value.");
  }

  return {
    src: descriptor.src,
    loop: descriptor.loop ?? defaultLoop,
    volume: clampVolume(descriptor.volume ?? 1),
  };
}

function resolveAudioFactory(audioFactory) {
  if (typeof audioFactory === "function") {
    return audioFactory;
  }

  if (typeof globalThis.Audio === "function") {
    return () => new globalThis.Audio();
  }

  return null;
}

function createChannelPlayer(audioFactory, descriptor, channelVolume, masterVolume, playbackOptions = {}) {
  if (!audioFactory) {
    throw new Error("Audio playback is not available in this environment.");
  }

  const player = audioFactory();

  player.src = descriptor.src;
  player.preload = "auto";
  player.loop = playbackOptions.loop ?? descriptor.loop;
  player.volume = clampVolume(
    descriptor.volume
      * channelVolume.value
      * masterVolume.value
      * clampVolume(playbackOptions.volume ?? 1),
  );

  return player;
}

export function createAudioSystem(options = {}) {
  const audioFactory = resolveAudioFactory(options.audioFactory);
  const soundRegistry = new Map();
  const musicRegistry = new Map();
  const activeSounds = new Set();
  const masterVolume = { value: clampVolume(options.masterVolume ?? 1) };
  const soundVolume = { value: clampVolume(options.soundVolume ?? 1) };
  const musicVolume = { value: clampVolume(options.musicVolume ?? 1) };

  let currentMusic = null;

  function registerSound(effectId, descriptor) {
    if (typeof effectId !== "string" || effectId.trim() === "") {
      throw new TypeError("registerSound expected a non-empty effectId.");
    }

    soundRegistry.set(effectId, normalizeTrackDescriptor(descriptor, false));
    return audio;
  }

  function registerMusic(trackId, descriptor) {
    if (typeof trackId !== "string" || trackId.trim() === "") {
      throw new TypeError("registerMusic expected a non-empty trackId.");
    }

    musicRegistry.set(trackId, normalizeTrackDescriptor(descriptor, true));
    return audio;
  }

  function loadManifest(manifest = {}) {
    const sounds = manifest.sounds ?? {};
    const music = manifest.music ?? {};

    for (const [effectId, descriptor] of Object.entries(sounds)) {
      registerSound(effectId, descriptor);
    }

    for (const [trackId, descriptor] of Object.entries(music)) {
      registerMusic(trackId, descriptor);
    }

    return audio;
  }

  function playSound(effectId, playbackOptions = {}) {
    const descriptor = soundRegistry.get(effectId);

    if (!descriptor) {
      throw new Error(`Unknown sound effect "${effectId}".`);
    }

    const player = createChannelPlayer(audioFactory, descriptor, soundVolume, masterVolume, playbackOptions);
    activeSounds.add(player);

    const finishPlayback = () => {
      activeSounds.delete(player);
    };

    if (typeof player.addEventListener === "function") {
      player.addEventListener("ended", finishPlayback, { once: true });
    }

    if (typeof player.play === "function") {
      void player.play();
    }

    return player;
  }

  function stopSound(player) {
    if (!player) {
      return;
    }

    if (typeof player.pause === "function") {
      player.pause();
    }

    if ("currentTime" in player) {
      player.currentTime = 0;
    }

    activeSounds.delete(player);
  }

  function playMusic(trackId, playbackOptions = {}) {
    const descriptor = musicRegistry.get(trackId);

    if (!descriptor) {
      throw new Error(`Unknown music track "${trackId}".`);
    }

    if (currentMusic?.trackId === trackId && playbackOptions.restart !== true) {
      return currentMusic.player;
    }

    stopMusic();

    const player = createChannelPlayer(audioFactory, descriptor, musicVolume, masterVolume, playbackOptions);
    currentMusic = { trackId, player };

    if (typeof player.play === "function") {
      void player.play();
    }

    return player;
  }

  function stopMusic() {
    if (!currentMusic) {
      return;
    }

    if (typeof currentMusic.player.pause === "function") {
      currentMusic.player.pause();
    }

    if ("currentTime" in currentMusic.player) {
      currentMusic.player.currentTime = 0;
    }

    currentMusic = null;
  }

  function stopAll() {
    for (const player of activeSounds) {
      stopSound(player);
    }

    stopMusic();
  }

  function setMasterVolume(volume) {
    masterVolume.value = clampVolume(volume);
    return masterVolume.value;
  }

  function setSoundVolume(volume) {
    soundVolume.value = clampVolume(volume);
    return soundVolume.value;
  }

  function setMusicVolume(volume) {
    musicVolume.value = clampVolume(volume);
    return musicVolume.value;
  }

  function getPlaybackState() {
    return {
      backendAvailable: audioFactory !== null,
      activeSoundCount: activeSounds.size,
      currentMusicTrackId: currentMusic?.trackId ?? null,
      masterVolume: masterVolume.value,
      soundVolume: soundVolume.value,
      musicVolume: musicVolume.value,
    };
  }

  const audio = {
    registerSound,
    registerMusic,
    loadManifest,
    playSound,
    playMusic,
    stopSound,
    stopMusic,
    stopAll,
    setMasterVolume,
    setSoundVolume,
    setMusicVolume,
    getPlaybackState,
  };

  if (options.manifest) {
    loadManifest(options.manifest);
  }

  return audio;
}
