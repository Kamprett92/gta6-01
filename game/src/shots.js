// The screenshot scenes behind ?shot=start|drive|chase|mission. Each one sets the real
// game to a fixed, seeded scene and steps it forward, so the frame is what the game
// really looks like and the same seed always gives the same frame.
import { STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createPoliceCar } from './police.js';

function fakeInput(moveY, moveX) {
  return {
    moveY: () => moveY,
    moveX: () => moveX,
    run: () => false,
    handbrake: () => false,
    takeActions: () => 0,
    takeMouse: () => ({ dx: 0, dy: 0 }),
  };
}

function clearCameraOverride(state) {
  state.cameraTarget = null;
  state.cameraDist = null;
  state.cameraYawOverride = undefined;
}

function putPlayerInCar(state, car) {
  car.driver = 'player';
  state.playerCar = car;
  state.inCar = true;
}

function driveFor(world, renderer, seconds, moveY, moveX) {
  const input = fakeInput(moveY, moveX);
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    world.step(STEP, input, renderer.getYaw());
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * start: the title over the city at a fixed angle. drive: the player driving down a
 * road with traffic. chase: a police chase at three stars. mission: the bank vault.
 */
export function stageShot(name, world, renderer) {
  const state = world.state;
  world.reset(false);
  clearCameraOverride(state);

  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    // Start: a fixed wide view of the city — the beach, the towers and the plaza.
    state.cameraTarget = { x: 40, y: 26, z: 10 };
    state.cameraDist = 170;
    state.cameraYawOverride = 2.4;
    return { screen: SCREEN_TITLE };
  }

  if (name === 'mission') {
    // The Big Score, mid-vault: Rico at the bank's door, the beacon over it, the
    // objective up. The player stands on the sidewalk south of the bank, facing it.
    state.missions.missionIndex = 4;
    state.missions.stepIndex = 1;
    state.missions.started = true;
    state.missions.holdT = 1.5;
    state.player.x = state.places.bank.x;
    state.player.z = state.places.bank.z + 4;
    state.player.heading = Math.PI;
    state.cash = 1240;
    // Pull the camera back and up so the shot reads the player, the bank and the street.
    state.cameraDist = 17;
    renderer.setCamera(2.4, 0.55, true);
    driveFor(world, renderer, 0.5, 0, 0);
    return { screen: SCREEN_PLAY };
  }

  // drive and chase: the player in a car on the east-west road at z = -36, heading east.
  // The first mission is already past its steal step, so the objective reads as a drive.
  const car = state.cars.find((c) => c.kind === 'parked');
  car.x = -120;
  car.z = -36 + 4;
  car.heading = Math.PI / 2;
  car.speed = 0;
  putPlayerInCar(state, car);
  state.missions.stepIndex = 1;
  state.cash = 860;

  if (name === 'chase') {
    state.wanted = 3;
    // Two police cars closing in from behind, close enough to read in the frame.
    // The camera looks back at the player from the front, so the chase is behind them.
    const cop1 = createPoliceCar(renderer.scene, -134, -36 - 4, Math.PI / 2);
    cop1.speed = 27;
    state.cars.push(cop1);
    state.policeCars.push(cop1);
    const cop2 = createPoliceCar(renderer.scene, -138, -36 + 9, Math.PI / 2);
    cop2.speed = 25;
    state.cars.push(cop2);
    state.policeCars.push(cop2);
    state.cameraYawOverride = (Math.PI / 2) + Math.PI;
    renderer.setCamera((Math.PI / 2) + Math.PI, 0.34, true);
    driveFor(world, renderer, 4, 1, 0);
    return { screen: SCREEN_PLAY };
  }

  renderer.setCamera(Math.PI / 2, 0.34, true);
  driveFor(world, renderer, 5, 1, 0);
  return { screen: SCREEN_PLAY };
}
