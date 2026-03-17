/**
 * Water Run: Bucket Balance Game
 * ================================
 * A single-player browser game where the player balances a water
 * bucket while walking forward as far as possible.
 *
 * Controls: LEFT / RIGHT arrow keys, or A / D keys
 * Goal: Travel as far as possible without spilling all the water.
 */

// ─────────────────────────────────────────────────────────────
// DOM references
// ─────────────────────────────────────────────────────────────
const startScreen     = document.getElementById('start-screen');
const gameScreen      = document.getElementById('game-screen');
const gameoverScreen  = document.getElementById('gameover-screen');

const distanceDisplay = document.getElementById('distance-display');
const speedDisplay    = document.getElementById('speed-display');
const waterBar        = document.getElementById('water-bar');
const waterPercent    = document.getElementById('water-percent');

const bucketArm       = document.getElementById('bucket-arm');
const bucketWater     = document.getElementById('bucket-water');
const tiltNeedle      = document.getElementById('tilt-needle');
const dripWarning     = document.getElementById('drip-warning');

const startBtn        = document.getElementById('start-btn');
const resetBtn        = document.getElementById('reset-btn');
const playAgainBtn    = document.getElementById('play-again-btn');

const gameoverDistEl  = document.getElementById('gameover-distance');
const gameoverMsgEl   = document.getElementById('gameover-message');

const groundTrack     = document.getElementById('ground-track');

// ─────────────────────────────────────────────────────────────
// Game state variables
// ─────────────────────────────────────────────────────────────
let waterLevel;     // 0–100: how full the bucket is
let tilt;           // −45 to +45: bucket lean angle (degrees)
let distance;       // meters walked (score)
let speed;          // multiplier, starts at 1 and grows over time

let gameRunning;    // bool: is the game loop active?
let lastTimestamp;  // used to calculate delta time in the loop

// Track which keys are currently pressed
const keys = { left: false, right: false };

// ─────────────────────────────────────────────────────────────
// Constants — tweak these to adjust difficulty / feel
// ─────────────────────────────────────────────────────────────
const TILT_MAX           = 45;    // maximum tilt angle
const TILT_INPUT_RATE    = 55;    // degrees/second added when key held
const TILT_RETURN_RATE   = 28;    // degrees/second auto-centering
const SPEED_START        = 1.0;   // initial speed multiplier
const SPEED_INCREMENT    = 0.04;  // how much speed grows per second
const SPEED_MAX          = 4.0;   // cap on speed

// Water drain rates (% per second) — based on tilt severity
const DRAIN_NONE     = 0.5;   // slight idle drain while perfectly balanced
const DRAIN_SMALL    = 1.8;   // |tilt| < 15°
const DRAIN_MEDIUM   = 4.5;   // 15° ≤ |tilt| < 30°
const DRAIN_LARGE    = 10.0;  // 30° ≤ |tilt| < 40°
const DRAIN_EXTREME  = 22.0;  // |tilt| ≥ 40°

// ─────────────────────────────────────────────────────────────
// Initialise / reset all game variables
// ─────────────────────────────────────────────────────────────
function resetGame() {
  waterLevel  = 100;
  tilt        = 0;
  distance    = 0;
  speed       = SPEED_START;
  gameRunning = false;
  lastTimestamp = null;
}

// ─────────────────────────────────────────────────────────────
// Screen helpers
// ─────────────────────────────────────────────────────────────
function showScreen(screenEl) {
  [startScreen, gameScreen, gameoverScreen].forEach(s => s.classList.remove('active'));
  screenEl.classList.add('active');
}

// ─────────────────────────────────────────────────────────────
// Start / restart the game
// ─────────────────────────────────────────────────────────────
function startGame() {
  resetGame();
  showScreen(gameScreen);
  updateHUD();          // set initial display values
  gameRunning = true;
  requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────────────────────
// End the game
// ─────────────────────────────────────────────────────────────
function endGame() {
  gameRunning = false;

  // Round distance to one decimal
  const metres = Math.round(distance * 10) / 10;   // meters walked

  // Build game-over message depending on how far the player walked
  let message;
  if (metres < 10) {
    message = "Don't give up! A good balance takes practice. Try again!";
  } else if (metres < 30) {
    message = "Nice try! You're getting the feel for it. Keep at it!";
  } else if (metres < 75) {
    message = "Good effort! You carried water for a solid stretch — well done!";
  } else if (metres < 150) {
    message = "Impressive! You'd be a real help to a village in need. 💪";
  } else if (metres < 300) {
    message = "Amazing! You carried water like a true champion. 🏆";
  } else {
    message = "Legendary! You're a water-carrying hero — communities everywhere thank you! 🌍💧";
  }

  gameoverDistEl.textContent = `You walked ${metres} meter${metres === 1 ? '' : 's'} before your water ran out.`;
  gameoverMsgEl.textContent  = message;

  showScreen(gameoverScreen);
}

// ─────────────────────────────────────────────────────────────
// Update all on-screen HUD elements to match current state
// ─────────────────────────────────────────────────────────────
function updateHUD() {
  // Distance
  distanceDisplay.textContent = `${Math.floor(distance)} m`;

  // Speed
  speedDisplay.textContent = `${speed.toFixed(1)}x`;

  // Water bar width + colour
  const pct = Math.max(0, Math.min(100, waterLevel));
  waterBar.style.width = `${pct}%`;
  waterPercent.textContent = `${Math.round(pct)}%`;

  // Change bar colour: blue → yellow → red as water drops
  if (pct > 50) {
    waterBar.style.background = 'linear-gradient(90deg, #00c6ff, #0072ff)';
  } else if (pct > 25) {
    waterBar.style.background = 'linear-gradient(90deg, #ffe066, #f0a500)';
  } else {
    waterBar.style.background = 'linear-gradient(90deg, #ff6b6b, #ff0000)';
  }

  // Bucket water fill height (matches waterLevel %)
  bucketWater.style.height = `${pct}%`;

  // Bucket / arm rotation based on tilt
  bucketArm.style.transform = `rotate(${tilt}deg)`;

  // Tilt needle position — map tilt from [−45, +45] to [0%, 100%] of track width
  // The needle is 10 px wide; track is 160 px wide; usable range = 150 px
  const needlePercent = ((tilt + TILT_MAX) / (TILT_MAX * 2)) * 100;
  tiltNeedle.style.left = `${needlePercent}%`;

  // "Spilling!" warning — show when tilt is large
  const absTilt = Math.abs(tilt);
  if (absTilt >= 30) {
    dripWarning.classList.remove('hidden');
  } else {
    dripWarning.classList.add('hidden');
  }
}

// ─────────────────────────────────────────────────────────────
// Calculate how fast water drains based on current tilt
// ─────────────────────────────────────────────────────────────
function getDrainRate() {
  const absTilt = Math.abs(tilt);
  if (absTilt >= 40) return DRAIN_EXTREME;
  if (absTilt >= 30) return DRAIN_LARGE;
  if (absTilt >= 15) return DRAIN_MEDIUM;
  return absTilt > 2 ? DRAIN_SMALL : DRAIN_NONE;
}

// ─────────────────────────────────────────────────────────────
// Main game loop — called every animation frame
// ─────────────────────────────────────────────────────────────
function gameLoop(timestamp) {
  if (!gameRunning) return;

  // Calculate seconds elapsed since last frame (capped to avoid large jumps)
  if (!lastTimestamp) lastTimestamp = timestamp;
  const dt = Math.min((timestamp - lastTimestamp) / 1000, 0.1); // seconds
  lastTimestamp = timestamp;

  // ── 1. Handle player input: adjust tilt ──────────────────
  if (keys.left) {
    tilt -= TILT_INPUT_RATE * dt;
  }
  if (keys.right) {
    tilt += TILT_INPUT_RATE * dt;
  }

  // ── 2. Auto-centre tilt toward 0 when no key pressed ─────
  if (!keys.left && !keys.right) {
    if (tilt > 0) {
      tilt = Math.max(0, tilt - TILT_RETURN_RATE * dt);
    } else if (tilt < 0) {
      tilt = Math.min(0, tilt + TILT_RETURN_RATE * dt);
    }
  }

  // ── 3. Clamp tilt to allowed range ───────────────────────
  tilt = Math.max(-TILT_MAX, Math.min(TILT_MAX, tilt));

  // ── 4. Drain water based on tilt ─────────────────────────
  const drainRate = getDrainRate();
  waterLevel -= drainRate * dt;
  waterLevel = Math.max(0, waterLevel);

  // ── 5. Increase distance and gradually speed up ───────────
  distance += speed * 3.5 * dt;           // ~3.5 m/s base walking pace
  speed = Math.min(SPEED_MAX, speed + SPEED_INCREMENT * dt);

  // ── 6. Adjust ground-scroll animation speed ──────────────
  // CSS animation duration controls scroll speed: shorter = faster
  const baseScrollDuration = 1.2;         // seconds at speed 1.0
  const scrollDuration = baseScrollDuration / speed;
  groundTrack.style.animationDuration = `${scrollDuration.toFixed(2)}s`;

  // ── 7. Update all visuals ─────────────────────────────────
  updateHUD();

  // ── 8. Check game-over condition ─────────────────────────
  if (waterLevel <= 0) {
    endGame();
    return;
  }

  // ── 9. Request next frame ─────────────────────────────────
  requestAnimationFrame(gameLoop);
}

// ─────────────────────────────────────────────────────────────
// Keyboard event listeners
// ─────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
  if (!gameRunning) return;
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keys.left  = true;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = true;
  // Prevent arrow keys from scrolling the page during play
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.preventDefault();
});

document.addEventListener('keyup', (e) => {
  if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') keys.left  = false;
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keys.right = false;
});

// ─────────────────────────────────────────────────────────────
// Button listeners
// ─────────────────────────────────────────────────────────────

// Start screen → begin game
startBtn.addEventListener('click', startGame);

// Reset button (during gameplay) → restart immediately
resetBtn.addEventListener('click', () => {
  if (gameScreen.classList.contains('active')) {
    startGame();
  }
});

// Game over screen → play again
playAgainBtn.addEventListener('click', startGame);

// ─────────────────────────────────────────────────────────────
// Initialise on page load
// ─────────────────────────────────────────────────────────────
resetGame();
showScreen(startScreen);
