// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between four screens: title, play, paused and game over.
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N) stages that
// scene instead of running the loop, paints it and sets window.__shotReady.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const hudEl = document.getElementById('hud');
const hud = {
  cash: document.getElementById('hud-cash'),
  stars: Array.from(document.querySelectorAll('#hud-stars .star')),
  healthFill: document.getElementById('hud-health-fill'),
  objective: document.getElementById('hud-objective'),
  missionName: document.getElementById('hud-mission'),
  timer: document.getElementById('hud-timer'),
  speed: document.getElementById('hud-speed'),
  ammo: document.getElementById('hud-ammo'),
  prompt: document.getElementById('hud-prompt'),
  banner: document.getElementById('hud-banner'),
  crosshair: document.getElementById('hud-crosshair'),
  minimap: document.getElementById('minimap'),
};
const overlays = {
  title: document.getElementById('screen-title'),
  pause: document.getElementById('screen-pause'),
  over: document.getElementById('screen-over'),
};
const overTitle = document.getElementById('over-title');
const overText = document.getElementById('over-text');
const btnNew = document.getElementById('btn-new');
const btnContinue = document.getElementById('btn-continue');
const btnResume = document.getElementById('btn-resume');
const btnSave = document.getElementById('btn-save');
const btnRestart = document.getElementById('btn-restart');
const btnMute = document.getElementById('btn-mute');
const btnRetry = document.getElementById('btn-retry');
const btnTitle = document.getElementById('btn-title');

const renderer = createRenderer(canvas, hud);
const audio = createAudio();
const world = createWorld(createRandom(seed), renderer.scene);
const input = createInput(canvas);
// Debug/testing handle: lets a headless play-test read the live state.
window.__solmar = { state: world.state, world, renderer, input };

function showOverlay(name) {
  for (const [key, el] of Object.entries(overlays)) {
    el.classList.toggle('hidden', key !== name);
  }
  // The in-game HUD belongs to play and pause only, never the title or game over.
  hudEl.classList.toggle('hidden', name === 'title' || name === 'over');
}

function announce(message) {
  status.textContent = message;
}

function handleEvents(events) {
  for (const event of events) {
    switch (event.type) {
      case 'shot':
        audio.shot();
        break;
      case 'enemyShot':
        audio.enemyShot();
        break;
      case 'crash':
        audio.crash(event.intensity);
        break;
      case 'pickup':
        audio.pickup();
        break;
      case 'fareDone':
        audio.pickup();
        announce(`Fare paid $${event.value}.`);
        break;
      case 'wantedUp':
        audio.wantedUp();
        break;
      case 'missionDone':
        audio.missionDone();
        break;
      case 'missionFailed':
        announce(event.reason);
        break;
      case 'busted':
        audio.busted();
        break;
      case 'wasted':
        audio.busted();
        break;
      case 'save':
        world.save();
        break;
      case 'burst':
        renderer.burstAt(event.x, event.y, event.z, event.color, event.count, event.speed, event.life, event.gravity);
        break;
      default:
        break;
    }
  }
}

function updateAudio(dt) {
  const state = world.state;
  const inCar = !!state.playerCar;
  const speedNorm = inCar ? Math.min(1, Math.abs(state.playerCar.speed) / 34) : 0;
  const throttle = inCar ? Math.max(0, input.moveY()) : 0;
  audio.engine(speedNorm, throttle, inCar);
  let nearestPolice = 0;
  for (const car of state.policeCars) {
    const d = Math.hypot(car.x - state.player.x, car.z - state.player.z);
    nearestPolice = Math.max(nearestPolice, Math.max(0, 1 - d / 90));
  }
  audio.siren(nearestPolice, dt);
}

function runShot(name) {
  const scene = stageShot(name, world, renderer);
  if (name === 'start') showOverlay('title');
  else showOverlay(null);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, 1 / 60);
    painted += 1;
    if (painted < 4) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let titleAngle = 0.6;

  const hasSave = (() => {
    try {
      return !!window.localStorage.getItem('solmar-heat.save.v1');
    } catch {
      return false;
    }
  })();
  btnContinue.classList.toggle('hidden', !hasSave);

  function startGame(fresh) {
    audio.resume();
    audio.startMusic();
    if (fresh) {
      world.reset(true);
    } else {
      world.load();
    }
    screen = SCREEN_PLAY;
    showOverlay(null);
    announce('Playing. Follow the objective at the top of the screen.');
  }

  function toTitle() {
    world.reset(false);
    screen = SCREEN_TITLE;
    showOverlay('title');
    announce('Solmar Heat. Press Space or click to start.');
  }

  btnNew.addEventListener('click', () => {
    audio.click();
    startGame(true);
  });
  btnContinue.addEventListener('click', () => {
    audio.click();
    startGame(false);
  });
  btnResume.addEventListener('click', () => {
    audio.click();
    screen = SCREEN_PLAY;
    showOverlay(null);
    announce('Playing.');
  });
  btnSave.addEventListener('click', () => {
    world.save();
    audio.click();
    btnSave.textContent = 'Saved ✓';
    window.setTimeout(() => {
      btnSave.textContent = 'Save game';
    }, 1200);
  });
  btnRestart.addEventListener('click', () => {
    audio.click();
    startGame(true);
  });
  btnMute.addEventListener('click', () => {
    const muted = audio.setMuted(!audio.isMuted());
    btnMute.textContent = muted ? 'Unmute (M)' : 'Mute (M)';
  });
  btnRetry.addEventListener('click', () => {
    audio.click();
    world.respawn([]);
    world.state.over = null;
    screen = SCREEN_PLAY;
    showOverlay(null);
    announce('Back on the streets.');
  });
  btnTitle.addEventListener('click', () => {
    audio.click();
    toTitle();
  });

  function handleActions() {
    // Only the menu's own bits: enter/shoot/punch stay queued for the world step.
    const actions = input.takeActions(ACTION_MUTE | ACTION_PAUSE | ACTION_CONFIRM);
    if (actions & ACTION_MUTE) {
      const muted = audio.setMuted(!audio.isMuted());
      btnMute.textContent = muted ? 'Unmute (M)' : 'Mute (M)';
    }
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(!hasSave);
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        showOverlay('pause');
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & ACTION_PAUSE || actions & ACTION_CONFIRM) {
        screen = SCREEN_PLAY;
        showOverlay(null);
        announce('Playing.');
      }
    } else if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) {
        world.respawn([]);
        world.state.over = null;
        screen = SCREEN_PLAY;
        showOverlay(null);
        announce('Back on the streets.');
      }
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    const mouse = input.takeMouse();
    if (mouse.dx !== 0 || mouse.dy !== 0) renderer.addMouse(mouse.dx, mouse.dy);

    if (screen === SCREEN_TITLE) {
      // A slow orbit over the city behind the title panel.
      titleAngle += 0.00012 * (now - last + 16);
      const state = world.state;
      state.cameraTarget = { x: Math.cos(titleAngle) * 110, y: 42, z: Math.sin(titleAngle) * 110 };
      state.cameraDist = 150;
      state.cameraYawOverride = titleAngle + Math.PI / 2;
      while (accumulator >= STEP) {
        world.step(STEP, input, renderer.getYaw());
        accumulator -= STEP;
      }
      renderer.draw(state, SCREEN_PLAY, 1 / 60);
    } else if (screen === SCREEN_PLAY) {
      world.state.cameraTarget = null;
      world.state.cameraDist = null;
      world.state.cameraYawOverride = undefined;
      while (accumulator >= STEP) {
        const events = world.step(STEP, input, renderer.getYaw());
        handleEvents(events);
        accumulator -= STEP;
      }
      updateAudio(1 / 60);
      renderer.draw(world.state, SCREEN_PLAY, 1 / 60);
      if (world.state.over) {
        screen = SCREEN_OVER;
        overTitle.textContent = world.state.over === 'busted' ? 'Busted!' : 'Wasted!';
        overText.textContent = world.state.overReason;
        showOverlay('over');
        announce(world.state.overReason);
        const best = Math.max(world.readBest(), world.state.earned);
        world.saveBest(best);
      }
    } else if (screen === SCREEN_PAUSED) {
      accumulator = 0;
      renderer.draw(world.state, SCREEN_PAUSED, 1 / 60);
    } else {
      accumulator = 0;
      renderer.draw(world.state, SCREEN_OVER, 1 / 60);
    }
  }

  // Leaving the tab pauses a running game.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      showOverlay('pause');
      announce('Paused.');
    }
  });

  // The first gesture wakes the audio.
  const wake = () => {
    audio.resume();
  };
  window.addEventListener('keydown', wake, { once: true });
  window.addEventListener('pointerdown', wake, { once: true });

  showOverlay('title');
  announce('Solmar Heat. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
