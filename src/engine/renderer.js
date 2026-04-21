const DEFAULT_CONTEXT_ATTRIBUTES = {
  alpha: false,
  antialias: false,
  depth: true,
  desynchronized: true,
  powerPreference: "high-performance",
  preserveDrawingBuffer: false,
};

const DEFAULT_CLEAR_COLOR = [0.02, 0.02, 0.04, 1];

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

function getCanvasMetrics(canvas, getDevicePixelRatio) {
  const rect = canvas.getBoundingClientRect();
  const devicePixelRatio = resolveDevicePixelRatio(getDevicePixelRatio);
  const width = Math.max(1, Math.round(rect.width * devicePixelRatio));
  const height = Math.max(1, Math.round(rect.height * devicePixelRatio));

  return { width, height };
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

  let clearColor = normalizeColor(options.clearColor ?? DEFAULT_CLEAR_COLOR);
  let frameNumber = 0;
  let lastTimestamp = null;
  let lastWorldState = null;
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

  function beginFrame({ timestamp = 0, clearColor: nextColor } = {}) {
    if (nextColor !== undefined) {
      setClearColor(nextColor);
    }

    if (viewport.width !== canvas.width || viewport.height !== canvas.height) {
      applyViewport(canvas.width, canvas.height);
    }

    const deltaMs = lastTimestamp === null ? 0 : Math.max(0, timestamp - lastTimestamp);
    lastTimestamp = timestamp;

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
    return lastWorldState;
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
