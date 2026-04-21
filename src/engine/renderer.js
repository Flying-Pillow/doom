const DEFAULT_CONTEXT_ATTRIBUTES = {
  alpha: false,
  antialias: false,
  depth: true,
  desynchronized: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: false,
};

const DEFAULT_CLEAR_COLOR = [0.02, 0.02, 0.04, 1];
const FIELD_OF_VIEW_RADIANS = Math.PI / 2.8;
const NEAR_CLIP_DISTANCE = 0.35;
const SKY_COLOR = [0.09, 0.13, 0.19, 1];
const FLOOR_COLOR = [0.08, 0.05, 0.04, 1];
const CORRIDOR_COLOR = [0.2, 0.23, 0.28, 1];
const CORRIDOR_STRIPE_COLOR = [0.35, 0.18, 0.12, 1];
const CROSSHAIR_COLOR = [0.96, 0.82, 0.48, 1];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function resolveDevicePixelRatio(getDevicePixelRatio) {
  const value = typeof getDevicePixelRatio === "function"
    ? getDevicePixelRatio()
    : globalThis.window?.devicePixelRatio;

  return Number.isFinite(value) && value > 0 ? value : 1;
}

function normalizeColor(color) {
  if (!Array.isArray(color) || color.length !== 4) {
    throw new TypeError("Renderer clearColor must be a four-component array.");
  }

  return color.map((value) => {
    const channel = Number(value);

    if (!Number.isFinite(channel)) {
      throw new TypeError("Renderer clearColor components must be finite numbers.");
    }

    return Math.max(0, Math.min(1, channel));
  });
}

function shadeColor(color, multiplier) {
  return [
    clamp(color[0] * multiplier, 0, 1),
    clamp(color[1] * multiplier, 0, 1),
    clamp(color[2] * multiplier, 0, 1),
    color[3],
  ];
}

function getCanvasMetrics(canvas, getDevicePixelRatio) {
  const rect = canvas.getBoundingClientRect();
  const devicePixelRatio = resolveDevicePixelRatio(getDevicePixelRatio);
  const width = Math.max(1, Math.round(rect.width * devicePixelRatio));
  const height = Math.max(1, Math.round(rect.height * devicePixelRatio));

  return { width, height };
}

function getHorizonY(viewport, pitch = 0) {
  return clamp(
    Math.round(viewport.height * (0.44 + (Number(pitch) || 0) * 0.12)),
    Math.round(viewport.height * 0.2),
    Math.round(viewport.height * 0.75),
  );
}

function projectWorldPoint(position = {}, player = {}, viewport) {
  const playerPosition = player.position ?? {};
  const playerRotation = player.rotation ?? {};
  const dx = (Number(position.x) || 0) - (Number(playerPosition.x) || 0);
  const dz = (Number(position.z) || 0) - (Number(playerPosition.z) || 0);
  const yaw = Number(playerRotation.yaw) || 0;
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);
  const localX = (dx * cosYaw) - (dz * sinYaw);
  const localZ = (dx * sinYaw) + (dz * cosYaw);

  if (localZ <= NEAR_CLIP_DISTANCE) {
    return null;
  }

  const halfFovTangent = Math.tan(FIELD_OF_VIEW_RADIANS / 2);
  const normalizedX = localX / (localZ * halfFovTangent);

  if (Math.abs(normalizedX) > 1.4) {
    return null;
  }

  return {
    distance: Math.hypot(dx, dz),
    localX,
    localZ,
    normalizedX,
    screenX: Math.round((normalizedX * 0.5 + 0.5) * viewport.width),
  };
}

function getEnemyColor(enemy = {}) {
  if (enemy.deathState === "dead" || enemy.aiState === "dead") {
    return [0.2, 0.18, 0.18, 1];
  }

  if (enemy.aiState === "dying") {
    return [0.56, 0.16, 0.12, 1];
  }

  if (enemy.type === "imp") {
    return [0.9, 0.38, 0.18, 1];
  }

  if (enemy.type === "demon") {
    return [0.74, 0.14, 0.16, 1];
  }

  return [0.74, 0.74, 0.7, 1];
}

function getPickupColor(pickup = {}) {
  if (pickup.kind === "key") {
    if (pickup.color === "blue") {
      return [0.24, 0.56, 0.98, 1];
    }

    if (pickup.color === "yellow") {
      return [0.92, 0.8, 0.24, 1];
    }

    if (pickup.color === "red") {
      return [0.86, 0.2, 0.2, 1];
    }
  }

  if (pickup.kind === "weapon") {
    return [0.68, 0.68, 0.76, 1];
  }

  if (pickup.kind === "ammo") {
    return [0.76, 0.46, 0.18, 1];
  }

  if (pickup.kind === "armor") {
    return [0.18, 0.7, 0.78, 1];
  }

  return [0.32, 0.92, 0.42, 1];
}

function getDoorColor(door = {}) {
  if (door.kind === "exit") {
    return door.locked === false ? [0.4, 0.86, 0.48, 1] : [0.48, 0.52, 0.6, 1];
  }

  if (door.color === "blue") {
    return [0.16, 0.42, 0.84, 1];
  }

  if (door.color === "yellow") {
    return [0.84, 0.7, 0.16, 1];
  }

  if (door.color === "red") {
    return [0.72, 0.18, 0.18, 1];
  }

  return [0.52, 0.54, 0.6, 1];
}

function getProjectileColor(projectile = {}) {
  if (projectile.owner === "enemy") {
    return [0.98, 0.42, 0.2, 1];
  }

  return [0.34, 0.92, 0.98, 1];
}

function createSpritePrimitives(worldState, viewport, horizonY) {
  const player = worldState?.player ?? {};
  const sprites = [];

  for (const enemy of worldState?.enemies ?? []) {
    if (!enemy || !enemy.position) {
      continue;
    }

    const projected = projectWorldPoint(enemy.position, player, viewport);

    if (!projected) {
      continue;
    }

    const height = clamp(Math.round(viewport.height * (2.35 / projected.localZ)), 14, Math.round(viewport.height * 0.7));
    const width = clamp(Math.round(height * 0.52), 10, Math.round(viewport.width * 0.22));
    const groundOffset = Math.min(viewport.height * 0.34, viewport.height * (1.15 / (projected.localZ + 1.4)));
    const y = clamp(Math.round(horizonY + groundOffset - height), 0, viewport.height - height);
    const x = clamp(Math.round(projected.screenX - (width / 2)), 0, viewport.width - width);
    const brightness = clamp(1.22 - (projected.distance * 0.035), 0.42, 1.15);

    sprites.push({
      type: "enemy",
      x,
      y,
      width,
      height,
      distance: projected.distance,
      color: shadeColor(getEnemyColor(enemy), brightness),
    });
  }

  for (const pickup of worldState?.pickups ?? []) {
    if (!pickup || pickup.collected || pickup.active === false || !pickup.position) {
      continue;
    }

    const projected = projectWorldPoint(pickup.position, player, viewport);

    if (!projected) {
      continue;
    }

    const height = clamp(Math.round(viewport.height * (1.05 / projected.localZ)), 10, Math.round(viewport.height * 0.18));
    const width = clamp(Math.round(height * 0.85), 8, Math.round(viewport.width * 0.12));
    const groundOffset = Math.min(viewport.height * 0.36, viewport.height * (0.98 / (projected.localZ + 1.2)));
    const y = clamp(Math.round(horizonY + groundOffset - height), 0, viewport.height - height);
    const x = clamp(Math.round(projected.screenX - (width / 2)), 0, viewport.width - width);
    const brightness = clamp(1.18 - (projected.distance * 0.03), 0.45, 1.18);

    sprites.push({
      type: "pickup",
      x,
      y,
      width,
      height,
      distance: projected.distance,
      color: shadeColor(getPickupColor(pickup), brightness),
    });
  }

  for (const door of worldState?.doors ?? []) {
    if (!door || !door.position) {
      continue;
    }

    const projected = projectWorldPoint(door.position, player, viewport);

    if (!projected) {
      continue;
    }

    const height = clamp(Math.round(viewport.height * (3.2 / projected.localZ)), 18, Math.round(viewport.height * 0.85));
    const width = clamp(Math.round(viewport.width * (1.45 / projected.localZ)), 18, Math.round(viewport.width * 0.3));
    const groundOffset = Math.min(viewport.height * 0.36, viewport.height * (1.24 / (projected.localZ + 1.8)));
    const y = clamp(Math.round(horizonY + groundOffset - height), 0, viewport.height - height);
    const x = clamp(Math.round(projected.screenX - (width / 2)), 0, viewport.width - width);
    const brightness = clamp(1.08 - (projected.distance * 0.022), 0.46, 1.05);

    sprites.push({
      type: "door",
      x,
      y,
      width,
      height,
      distance: projected.distance,
      color: shadeColor(getDoorColor(door), brightness),
    });
  }

  for (const projectile of worldState?.projectiles ?? []) {
    if (!projectile || projectile.active === false || !projectile.position) {
      continue;
    }

    const projected = projectWorldPoint(projectile.position, player, viewport);

    if (!projected) {
      continue;
    }

    const size = clamp(Math.round(viewport.height * (0.5 / projected.localZ)), 6, Math.round(viewport.height * 0.08));
    const y = clamp(Math.round(horizonY + Math.min(viewport.height * 0.24, viewport.height * (0.62 / (projected.localZ + 1))) - size), 0, viewport.height - size);
    const x = clamp(Math.round(projected.screenX - (size / 2)), 0, viewport.width - size);
    const brightness = clamp(1.3 - (projected.distance * 0.05), 0.56, 1.24);

    sprites.push({
      type: "projectile",
      x,
      y,
      width: size,
      height: size,
      distance: projected.distance,
      color: shadeColor(getProjectileColor(projectile), brightness),
    });
  }

  sprites.sort((left, right) => right.distance - left.distance);
  return sprites;
}

function updateCanvasMetadata(canvas, summary) {
  if (canvas?.dataset) {
    canvas.dataset.renderStatus = summary.visibleSpriteCount > 0 ? "scene-ready" : "backdrop-ready";
    canvas.dataset.renderSummary = JSON.stringify({
      levelId: summary.levelId,
      visibleSpriteCount: summary.visibleSpriteCount,
      enemyCount: summary.enemyCount,
      pickupCount: summary.pickupCount,
      doorCount: summary.doorCount,
    });
  }

  if (canvas?.style) {
    canvas.style.background = summary.visibleSpriteCount > 0
      ? "linear-gradient(180deg, #192434 0%, #10151d 44%, #080506 100%)"
      : "linear-gradient(180deg, #1d2733 0%, #090d12 42%, #020304 100%)";
  }
}

export function createRenderer(canvas, options = {}) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new TypeError("createRenderer expected a canvas-like object with getContext().");
  }

  const contextAttributes = {
    ...DEFAULT_CONTEXT_ATTRIBUTES,
    ...(options.contextAttributes ?? {}),
  };
  const gl = canvas.getContext("webgl", contextAttributes)
    ?? canvas.getContext("experimental-webgl", contextAttributes);

  if (!gl) {
    throw new Error("Unable to initialize WebGL. A WebGL-capable browser is required.");
  }

  const canFillRects = typeof gl.scissor === "function"
    && typeof gl.clearColor === "function"
    && typeof gl.clear === "function";
  let clearColor = normalizeColor(options.clearColor ?? DEFAULT_CLEAR_COLOR);
  let frameNumber = 0;
  let lastTimestamp = null;
  let lastWorldState = null;
  let lastWorldRenderSummary = null;
  let lastHudState = null;
  let viewport = {
    width: canvas.width || 0,
    height: canvas.height || 0,
    aspectRatio: canvas.height > 0 ? canvas.width / canvas.height : 1,
  };

  if (typeof gl.clearColor === "function") {
    gl.clearColor(...clearColor);
  }

  if (typeof gl.clearDepth === "function") {
    gl.clearDepth(1);
  }

  if (typeof gl.enable === "function" && gl.DEPTH_TEST !== undefined) {
    gl.enable(gl.DEPTH_TEST);
  }

  if (typeof gl.depthFunc === "function" && gl.LEQUAL !== undefined) {
    gl.depthFunc(gl.LEQUAL);
  }

  function applyViewport(width, height) {
    viewport = {
      width,
      height,
      aspectRatio: height > 0 ? width / height : 1,
    };

    if (typeof gl.viewport === "function") {
      gl.viewport(0, 0, width, height);
    }

    return { ...viewport };
  }

  function resize() {
    const { width, height } = getCanvasMetrics(canvas, options.getDevicePixelRatio);

    if (canvas.width !== width) {
      canvas.width = width;
    }

    if (canvas.height !== height) {
      canvas.height = height;
    }

    return applyViewport(canvas.width, canvas.height);
  }

  function setClearColor(nextColor) {
    clearColor = normalizeColor(nextColor);

    if (typeof gl.clearColor === "function") {
      gl.clearColor(...clearColor);
    }

    return [...clearColor];
  }

  function fillRect(x, y, width, height, color) {
    if (!canFillRects) {
      return false;
    }

    const clampedWidth = clamp(Math.round(width), 0, viewport.width);
    const clampedHeight = clamp(Math.round(height), 0, viewport.height);
    const clampedX = clamp(Math.round(x), 0, viewport.width - clampedWidth);
    const clampedY = clamp(Math.round(y), 0, viewport.height - clampedHeight);

    if (clampedWidth <= 0 || clampedHeight <= 0) {
      return false;
    }

    if (typeof gl.enable === "function" && gl.SCISSOR_TEST !== undefined) {
      gl.enable(gl.SCISSOR_TEST);
    }

    gl.scissor(
      clampedX,
      viewport.height - clampedY - clampedHeight,
      clampedWidth,
      clampedHeight,
    );
    gl.clearColor(...normalizeColor(color));
    gl.clear(gl.COLOR_BUFFER_BIT);

    return true;
  }

  function drawBackdrop(worldState) {
    const horizonY = getHorizonY(viewport, worldState?.player?.rotation?.pitch);
    fillRect(0, 0, viewport.width, horizonY, SKY_COLOR);
    fillRect(0, horizonY, viewport.width, viewport.height - horizonY, FLOOR_COLOR);

    const corridorHeight = Math.round(viewport.height * 0.12);
    for (let index = 0; index < 7; index += 1) {
      const depth = index + 1;
      const width = viewport.width * (0.84 - depth * 0.09);
      const x = (viewport.width - width) / 2;
      const y = horizonY + depth * viewport.height * 0.055;
      fillRect(x, y, width, corridorHeight, shadeColor(CORRIDOR_COLOR, 1 - depth * 0.07));
    }

    const stripeCount = 6;
    for (let index = 0; index < stripeCount; index += 1) {
      const depth = index + 1;
      const stripeWidth = viewport.width * (0.3 / depth);
      const stripeHeight = Math.max(3, viewport.height * (0.016 / depth));
      const x = (viewport.width - stripeWidth) / 2;
      const y = horizonY + viewport.height * (0.09 * depth);
      fillRect(x, y, stripeWidth, stripeHeight, shadeColor(CORRIDOR_STRIPE_COLOR, 1.2 - depth * 0.08));
    }

    return horizonY;
  }

  function drawWeaponOverlay(worldState) {
    const weaponId = worldState?.player?.weaponId ?? "pistol";
    const color = weaponId === "shotgun"
      ? [0.34, 0.34, 0.36, 1]
      : weaponId === "chaingun"
        ? [0.42, 0.42, 0.46, 1]
        : weaponId === "rocketLauncher"
          ? [0.48, 0.32, 0.18, 1]
          : [0.28, 0.28, 0.3, 1];
    const width = viewport.width * 0.16;
    const height = viewport.height * 0.2;
    const x = (viewport.width - width) / 2;
    const y = viewport.height - height;

    fillRect(x, y, width, height, color);
    fillRect(x + width * 0.22, y + height * 0.08, width * 0.56, height * 0.22, shadeColor(color, 1.32));
    fillRect((viewport.width / 2) - 1, (viewport.height / 2) - 10, 2, 20, CROSSHAIR_COLOR);
    fillRect((viewport.width / 2) - 10, (viewport.height / 2) - 1, 20, 2, CROSSHAIR_COLOR);
  }

  function beginFrame({ timestamp = 0, clearColor: nextColor } = {}) {
    if (nextColor !== undefined) {
      setClearColor(nextColor);
    }

    if (viewport.width !== canvas.width || viewport.height !== canvas.height) {
      applyViewport(canvas.width, canvas.height);
    }

    const deltaMs = lastTimestamp === null ? 0 : Math.max(0, timestamp - lastTimestamp);
    lastTimestamp = timestamp;

    if (typeof gl.clearColor === "function") {
      gl.clearColor(...clearColor);
    }

    if (typeof gl.clear === "function") {
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    }

    return {
      frame: frameNumber,
      deltaMs,
      viewport: { ...viewport },
    };
  }

  function drawWorld(worldState = null) {
    lastWorldState = worldState;

    const horizonY = drawBackdrop(worldState);
    const sprites = createSpritePrimitives(worldState, viewport, horizonY);

    for (const sprite of sprites) {
      fillRect(sprite.x, sprite.y, sprite.width, sprite.height, sprite.color);
    }

    drawWeaponOverlay(worldState);

    if (canFillRects && typeof gl.clearColor === "function") {
      gl.clearColor(...clearColor);
    }

    if (canFillRects && typeof gl.disable === "function" && gl.SCISSOR_TEST !== undefined) {
      gl.disable(gl.SCISSOR_TEST);
    }

    lastWorldRenderSummary = {
      levelId: worldState?.currentLevelId ?? null,
      visibleSpriteCount: sprites.length,
      enemyCount: Array.isArray(worldState?.enemies) ? worldState.enemies.length : 0,
      pickupCount: Array.isArray(worldState?.pickups)
        ? worldState.pickups.filter((pickup) => pickup && pickup.collected !== true && pickup.active !== false).length
        : 0,
      doorCount: Array.isArray(worldState?.doors) ? worldState.doors.length : 0,
      playerWeaponId: worldState?.player?.weaponId ?? null,
      horizonY,
    };
    updateCanvasMetadata(canvas, lastWorldRenderSummary);

    return lastWorldRenderSummary;
  }

  function drawHud(hudState = null) {
    lastHudState = hudState;
    return lastHudState;
  }

  function endFrame() {
    const frameState = {
      frame: frameNumber,
      world: lastWorldState,
      hud: lastHudState,
    };

    frameNumber += 1;
    return frameState;
  }

  function getViewport() {
    return { ...viewport };
  }

  function getFrameState() {
    return {
      frame: frameNumber,
      lastTimestamp,
      clearColor: [...clearColor],
      viewport: getViewport(),
      world: lastWorldState,
      worldRenderSummary: lastWorldRenderSummary ? { ...lastWorldRenderSummary } : null,
      hud: lastHudState,
    };
  }

  resize();

  return {
    canvas,
    gl,
    resize,
    beginFrame,
    drawWorld,
    drawHud,
    endFrame,
    setClearColor,
    getViewport,
    getFrameState,
  };
}
