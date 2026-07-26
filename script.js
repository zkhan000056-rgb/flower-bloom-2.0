// ============================================================
// FLOWER BLOOM — hand-gesture controlled flower field
// Left hand pinch  -> bloom (petal opening)
// Right hand pinch -> growth (stem height)
// Hand sway        -> wind sway across the whole field
// Falls back to mouse control if the camera is unavailable.
// ============================================================

const canvas = document.getElementById('scene');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const videoEl = document.getElementById('video');
const previewCanvas = document.getElementById('preview');
const previewCtx = previewCanvas.getContext('2d');

let W, H;
let flowers = [];

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  flowers = generateFlowers();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------
// Flower field generation — many flowers, varied depth/size/timing
// ---------------------------------------------------------
const BASE_PETAL_COUNT = 12;
const MAX_STEM_HEIGHT_RATIO = 0.55; // relative to canvas height, for a full-depth flower

function generateFlowers() {
  const count = Math.max(16, Math.min(30, Math.floor(W / 55)));
  const list = [];

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0.5 : i / (count - 1);
    const layer = Math.random();               // 0 = far background, 1 = foreground
    const jitterX = (Math.random() - 0.5) * (W / count) * 0.9;
    const depth = 0.35 + layer * 0.65;          // overall scale factor for this flower

    list.push({
      x: t * W + jitterX,
      baseY: H * 0.86 + layer * H * 0.06,        // closer flowers sit a little lower
      depth,
      delay: Math.random() * 0.55,               // how much extra growth is needed before this one starts
      bloomDelay: Math.random() * 0.3,
      hueShift: (Math.random() - 0.5) * 50,
      swayPhase: Math.random() * Math.PI * 2,
      petalCount: BASE_PETAL_COUNT + Math.floor((Math.random() - 0.5) * 4),
      heightRatio: MAX_STEM_HEIGHT_RATIO * (0.45 + depth * 0.65),
    });
  }

  // painter's algorithm: draw background flowers first, foreground last
  list.sort((a, b) => a.baseY - b.baseY);
  return list;
}

// ---------------------------------------------------------
// Global gesture state — smoothed 0..1 values
// ---------------------------------------------------------
const state = {
  growth: 0,
  bloom: 0,
  targetGrowth: 0,
  targetBloom: 0,
  wind: 0,
  handCenterX: null,
  time: 0,
};

const particles = []; // pollen, only spawned by foreground hero flowers

function lerp(a, b, t) { return a + (b - a) * t; }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }

// ---------------------------------------------------------
// Gesture processing
// ---------------------------------------------------------
function pinchStrength(landmarks) {
  const thumbTip = landmarks[4];
  const indexTip = landmarks[8];
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];

  const palmSize = dist(wrist.x, wrist.y, middleMcp.x, middleMcp.y) || 0.001;
  const pinchDist = dist(thumbTip.x, thumbTip.y, indexTip.x, indexTip.y) / palmSize;

  const t = 1 - clamp((pinchDist - 0.15) / 0.85, 0, 1);
  return t;
}

function handleHandResults(results) {
  let leftPinch = null;
  let rightPinch = null;
  let centerXs = [];

  if (results.multiHandLandmarks && results.multiHandedness) {
    results.multiHandLandmarks.forEach((landmarks, i) => {
      const label = results.multiHandedness[i].label; // 'Left' | 'Right' (selfie-corrected)
      const strength = pinchStrength(landmarks);
      centerXs.push(landmarks[9].x);

      if (label === 'Left') leftPinch = strength;
      if (label === 'Right') rightPinch = strength;
    });
  }

  if (leftPinch !== null) state.targetBloom = leftPinch;
  if (rightPinch !== null) state.targetGrowth = rightPinch;

  if (centerXs.length > 0) {
    const avgX = centerXs.reduce((a, b) => a + b, 0) / centerXs.length;
    if (state.handCenterX !== null) {
      const delta = avgX - state.handCenterX;
      state.wind += delta * 40;
    }
    state.handCenterX = avgX;
  }

  updateStatus(leftPinch !== null || rightPinch !== null);
  drawPreview(results);
}

function updateStatus(tracking) {
  if (!tracking) {
    statusEl.textContent = 'Show your hands to the camera 🌱';
  } else {
    statusEl.textContent = `Growth ${Math.round(state.growth * 100)}%  ·  Bloom ${Math.round(state.bloom * 100)}%`;
  }
}

function drawPreview(results) {
  previewCtx.save();
  previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
  if (videoEl.readyState >= 2) {
    previewCtx.drawImage(videoEl, 0, 0, previewCanvas.width, previewCanvas.height);
  }
  if (results.multiHandLandmarks && window.drawConnectors) {
    for (const landmarks of results.multiHandLandmarks) {
      window.drawConnectors(previewCtx, landmarks, window.HAND_CONNECTIONS, {
        color: '#ffd1e8', lineWidth: 2,
      });
      window.drawLandmarks(previewCtx, landmarks, { color: '#ff8fc7', radius: 2 });
    }
  }
  previewCtx.restore();
}

// ---------------------------------------------------------
// MediaPipe Hands setup
// ---------------------------------------------------------
let mouseFallback = false;

function initHandTracking() {
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
  });

  hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.6,
    selfieMode: true,
  });

  hands.onResults(handleHandResults);

  const camera = new Camera(videoEl, {
    onFrame: async () => {
      await hands.send({ image: videoEl });
    },
    width: 640,
    height: 480,
  });

  camera.start().catch(() => enableMouseFallback());
}

function enableMouseFallback() {
  mouseFallback = true;
  previewCanvas.style.display = 'none';
  statusEl.textContent = 'Camera unavailable — using mouse control (drag left/right = growth, up/down = bloom)';

  window.addEventListener('mousemove', (e) => {
    state.targetGrowth = clamp(e.clientX / W, 0, 1);
    state.targetBloom = clamp(1 - e.clientY / H, 0, 1);
  });
  window.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    state.targetGrowth = clamp(t.clientX / W, 0, 1);
    state.targetBloom = clamp(1 - t.clientY / H, 0, 1);
  }, { passive: true });
}

const cameraPossible = window.isSecureContext && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

if (!cameraPossible) {
  // Common cause: the page was opened as a local file:// URL, or over plain http://.
  // Camera access is blocked by the browser in both cases, so don't even try —
  // go straight to mouse control instead of showing a stuck "Initializing" message.
  statusEl.textContent = 'Camera needs https:// or localhost — using mouse control instead (see README for local testing)';
  enableMouseFallback();
} else {
  try {
    initHandTracking();
    setTimeout(() => {
      if (statusEl.textContent.includes('Initializing')) enableMouseFallback();
    }, 6000);
  } catch (e) {
    enableMouseFallback();
  }
}

// ============================================================
// RENDERING
// ============================================================

function drawGround() {
  const groundY = H * 0.84;
  const grad = ctx.createLinearGradient(0, groundY, 0, H);
  grad.addColorStop(0, '#233d2c');
  grad.addColorStop(1, '#132318');
  ctx.fillStyle = grad;
  ctx.fillRect(0, groundY, W, H - groundY);
}

function drawStem(baseX, baseY, topX, topY, sway, lineWidth) {
  const midX = baseX + (topX - baseX) * 0.5 + sway * 0.6;
  const midY = baseY + (topY - baseY) * 0.5;

  ctx.strokeStyle = '#3f8a4d';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(baseX, baseY);
  ctx.quadraticCurveTo(midX, midY, topX, topY);
  ctx.stroke();

  return { midX, midY };
}

function drawLeaf(x, y, angle, size, flip) {
  if (size < 1) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(flip ? -1 : 1, 1);
  ctx.fillStyle = '#4caf5f';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(size * 0.6, -size * 0.35, size, 0);
  ctx.quadraticCurveTo(size * 0.6, size * 0.35, 0, 0);
  ctx.fill();
  ctx.restore();
}

function drawFlowerHead(cx, cy, bloom, growth, sway, scale, hueShift, petalCount, spawnPollen) {
  if (growth < 0.45) return;
  const headProgress = clamp((growth - 0.45) / 0.55, 0, 1);
  const petalLen = (55 * bloom * headProgress + 4) * scale;
  const petalWidth = (20 * bloom * headProgress + 3) * scale;
  const rotation = state.time * 0.15 + sway * 0.01;

  for (let i = 0; i < petalCount; i++) {
    const angle = (i / petalCount) * Math.PI * 2 + rotation;
    const openAmount = lerp(0.15, 1, bloom);
    const hue = 320 - bloom * 40 + hueShift;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    const grad = ctx.createLinearGradient(0, 0, petalLen, 0);
    grad.addColorStop(0, `hsl(${hue}, 70%, 85%)`);
    grad.addColorStop(1, `hsl(${hue - 15}, 80%, 65%)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(petalLen * 0.55 * openAmount, 0, petalLen * 0.55 * openAmount + 1, petalWidth * openAmount + 1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.fillStyle = '#ffcb47';
  ctx.arc(cx, cy, (8 + bloom * 6) * scale, 0, Math.PI * 2);
  ctx.fill();

  if (spawnPollen && bloom > 0.9 && Math.random() < 0.06) {
    particles.push({
      x: cx + (Math.random() - 0.5) * 20 * scale,
      y: cy,
      vy: -0.3 - Math.random() * 0.4,
      vx: (Math.random() - 0.5) * 0.3,
      life: 1,
      size: (1.5 + Math.random() * 2) * scale,
    });
  }
}

function drawParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.006;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    ctx.beginPath();
    ctx.fillStyle = `rgba(255, 235, 180, ${p.life})`;
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function render() {
  ctx.clearRect(0, 0, W, H);
  drawGround();

  state.growth = lerp(state.growth, state.targetGrowth, 0.06);
  state.bloom = lerp(state.bloom, state.targetBloom, 0.08);
  state.wind = clamp(state.wind * 0.9, -40, 40);
  state.time += 0.016;

  const ambientSway = Math.sin(state.time * 1.2) * 6;

  for (const f of flowers) {
    // each flower starts growing/blooming at a slightly different threshold,
    // so the field fills in gradually rather than moving in lockstep
    const effGrowth = clamp((state.growth - f.delay) / Math.max(0.0001, 1 - f.delay), 0, 1);
    const effBloom = clamp((state.bloom - f.bloomDelay) / Math.max(0.0001, 1 - f.bloomDelay), 0, 1);

    const sway = (state.wind + Math.sin(state.time * 1.2 + f.swayPhase) * 6) * f.depth;
    const stemHeight = H * f.heightRatio * effGrowth;

    const baseX = f.x;
    const baseY = f.baseY;
    const topX = baseX + sway;
    const topY = baseY - stemHeight;

    const { midX, midY } = drawStem(baseX, baseY, topX, topY, sway, clamp(8 * effGrowth * f.depth, 1.5, 8));

    if (effGrowth > 0.2) {
      const leafSize = 34 * f.depth * clamp((effGrowth - 0.2) / 0.5, 0, 1);
      drawLeaf(midX - 4 * f.depth, midY + 8 * f.depth, -0.5, leafSize, false);
      drawLeaf(midX + 4 * f.depth, midY - 8 * f.depth, 0.5, leafSize, true);
    }

    drawFlowerHead(topX, topY, effBloom, effGrowth, sway, f.depth, f.hueShift, f.petalCount, f.depth > 0.75);
  }

  drawParticles();

  if (!mouseFallback) updateStatus(true);
  requestAnimationFrame(render);
}

resize();
render();
