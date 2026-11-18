// Missions and the story. Rico Marin is a getaway driver in Solmar Bay; Lena Cruz,
// who runs the garage in the south-west, lines up the jobs. Five missions, each a
// list of steps; a step names its kind, its target and its limits, and the world
// feeds this module a small context each frame. It answers with events.
export const MISSION_LIST = [
  {
    id: 'ride',
    name: 'A Ride of Your Own',
    intro: "Lena needs a driver. Steal any car and bring it to her garage.",
    reward: 150,
    steps: [
      { text: 'Steal a car — walk up to one and press E', type: 'steal' },
      { text: "Drive to Lena's garage", type: 'goto', target: 'garage', radius: 10, needCar: true },
    ],
  },
  {
    id: 'pickup',
    name: 'The Pickup',
    intro: 'A package is waiting at the docks. Grab it and run it to the Marina hotel.',
    reward: 250,
    steps: [
      { text: 'Drive to the docks', type: 'goto', target: 'docks', radius: 12 },
      { text: 'Pick up the package — press E', type: 'interact', target: 'docks', radius: 7 },
      { text: 'Deliver it to the Marina hotel', type: 'timed', target: 'marina', radius: 12, time: 95 },
    ],
  },
  {
    id: 'hotwheels',
    name: 'Hot Wheels',
    intro: 'A rival crew left a fast red Comet at the plaza. Take it — the cops will notice.',
    reward: 400,
    steps: [
      { text: 'Steal the red Comet at the plaza', type: 'stealSpecial', target: 'plaza', radius: 9 },
      { text: 'Lose the heat — get your wanted level to zero', type: 'loseWanted' },
      { text: 'Deliver the Comet to the garage', type: 'goto', target: 'garage', radius: 10, needCar: true },
    ],
  },
  {
    id: 'getaway',
    name: 'The Getaway',
    intro: "Lena's crew needs a getaway driver. Hit all five checkpoints before the clock runs out — and the cops are already on you.",
    reward: 500,
    steps: [
      {
        text: 'Hit the checkpoints',
        type: 'checkpoints',
        time: 160,
        points: [
          { x: 0, z: -180 },
          { x: 180, z: -36 },
          { x: 108, z: 180 },
          { x: -180, z: 36 },
          { x: 0, z: 0 },
        ],
        radius: 9,
      },
    ],
  },
  {
    id: 'bigscore',
    name: 'The Big Score',
    intro: 'The Solmar Bank. Crack the vault, grab the cash, and get out before the whole city is on you.',
    reward: 800,
    steps: [
      { text: 'Get to the Solmar Bank', type: 'goto', target: 'bank', radius: 12 },
      { text: 'Crack the vault — hold E', type: 'hold', target: 'bank', radius: 7, hold: 3 },
      { text: 'Deal with the guards', type: 'defeat', count: 3 },
      { text: 'Escape to the safehouse', type: 'goto', target: 'safehouse', radius: 10 },
    ],
  },
];

export function createMissionState() {
  return {
    missionIndex: 0,
    stepIndex: 0,
    subIndex: 0,
    timer: 0,
    holdT: 0,
    started: false,
    done: false,
    allDone: false,
    announceT: 0,
  };
}

export function currentMission(state) {
  return MISSION_LIST[state.missionIndex] || null;
}

export function currentStep(state) {
  const mission = currentMission(state);
  return mission ? mission.steps[state.stepIndex] || null : null;
}

/** Where the current step points (for the beacon and the minimap). */
export function stepTarget(state, places) {
  const step = currentStep(state);
  if (!step) return null;
  if (step.type === 'checkpoints') return step.points[state.subIndex] || null;
  if (step.target && typeof step.target === 'string') return places[step.target] || null;
  return null;
}

/** The objective line the HUD shows, with the checkpoint count and the timer. */
export function stepText(state) {
  const mission = currentMission(state);
  const step = currentStep(state);
  if (!mission || !step) return '';
  if (step.type === 'checkpoints') {
    return `${step.text} (${state.subIndex + 1} of ${step.points.length})`;
  }
  return step.text;
}

/** Start a step: arm its timer, reset its hold progress. */
function beginStep(state) {
  const step = currentStep(state);
  state.subIndex = 0;
  state.holdT = 0;
  state.timer = step && step.time ? step.time : 0;
}

function distance(x1, z1, x2, z2) {
  return Math.hypot(x1 - x2, z1 - z2);
}

/**
 * Advance the missions one step. `ctx` carries what the world knows:
 * playerX, playerZ, inCar, wanted, interactPressed, holdingE, stoleCar (an event
 * flag this frame), stoleSpecial, enemiesDown, dt. Returns events:
 * step, missionDone {reward}, missionFailed {reason}, missionStart {mission},
 * spawnGuards {at, count}, spawnSpecial {at}, allDone.
 */
export function updateMissions(state, ctx, dt) {
  const events = [];
  if (state.allDone || state.done) return events;
  const mission = currentMission(state);
  if (!mission) {
    state.allDone = true;
    events.push({ type: 'allDone' });
    return events;
  }
  if (!state.started) {
    state.started = true;
    beginStep(state);
    events.push({ type: 'missionStart', mission });
    if (currentStep(state).type === 'defeat') {
      events.push({ type: 'spawnGuards', at: ctx.places.bank, count: currentStep(state).count });
    }
    if (mission.id === 'hotwheels') {
      events.push({ type: 'spawnSpecial', at: ctx.places.plaza });
    }
    if (mission.id === 'getaway') {
      events.push({ type: 'wantedBoost', stars: 3 });
    }
    if (mission.id === 'bigscore') {
      events.push({ type: 'wantedBoost', stars: 2 });
    }
  }

  const step = currentStep(state);
  if (!step) return events;

  // Timed steps count down; running out restarts the mission from its first step.
  if (step.time) {
    state.timer -= dt;
    if (state.timer <= 0) {
      state.stepIndex = 0;
      state.started = false;
      events.push({ type: 'missionFailed', reason: 'Out of time — the job fell through. Try again.' });
      return events;
    }
  }

  const target = stepTarget(state, ctx.places);
  let done = false;
  switch (step.type) {
    case 'steal':
      done = !!ctx.stoleCar;
      break;
    case 'stealSpecial':
      done = !!ctx.stoleSpecial;
      break;
    case 'goto':
      if (target && distance(ctx.playerX, ctx.playerZ, target.x, target.z) <= step.radius) {
        done = !step.needCar || ctx.inCar;
      }
      break;
    case 'timed':
      if (target && distance(ctx.playerX, ctx.playerZ, target.x, target.z) <= step.radius) done = true;
      break;
    case 'interact':
      if (target && ctx.interactPressed && distance(ctx.playerX, ctx.playerZ, target.x, target.z) <= step.radius) done = true;
      break;
    case 'hold':
      if (target && distance(ctx.playerX, ctx.playerZ, target.x, target.z) <= step.radius && ctx.holdingE && !ctx.inCar) {
        state.holdT += dt;
        if (state.holdT >= step.hold) done = true;
      } else {
        state.holdT = Math.max(0, state.holdT - dt * 2);
      }
      break;
    case 'loseWanted':
      done = ctx.wanted === 0;
      break;
    case 'checkpoints': {
      const point = step.points[state.subIndex];
      if (point && distance(ctx.playerX, ctx.playerZ, point.x, point.z) <= step.radius) {
        state.subIndex += 1;
        if (state.subIndex >= step.points.length) done = true;
        else events.push({ type: 'checkpoint', index: state.subIndex, total: step.points.length });
      }
      break;
    }
    case 'defeat':
      done = ctx.enemiesDown >= step.count;
      break;
    default:
      break;
  }

  if (!done) return events;

  events.push({ type: 'step', mission: mission.id, step: state.stepIndex });
  state.stepIndex += 1;
  if (state.stepIndex >= mission.steps.length) {
    events.push({ type: 'missionDone', mission, reward: mission.reward });
    state.missionIndex += 1;
    state.stepIndex = 0;
    state.started = false;
    if (state.missionIndex >= MISSION_LIST.length) {
      state.allDone = true;
      state.done = true;
      events.push({ type: 'allDone' });
    }
  } else {
    beginStep(state);
    if (currentStep(state).type === 'defeat') {
      events.push({ type: 'spawnGuards', at: ctx.places.bank, count: currentStep(state).count });
    }
  }
  return events;
}
