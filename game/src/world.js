// The game's rules and state, with no drawing in it: the player on foot and in a car,
// traffic, pedestrians, police and the wanted level, missions, combat, pickups and
// fares, and the save. step() advances one fixed step and returns events, so the
// caller can play sounds and show banners without the world knowing about them.
import * as THREE from 'three';
import { CAR, CITY, MISSIONS, PED, PICKUPS, FARE, PLAYER, SAVE_KEY, BEST_KEY, TRAFFIC, WANTED, CAR_COLORS } from './config.js';
import { buildCity, clampToMap, isOnRoad, resolveBuildingCollision } from './city.js';
import { createCar, collideCars, driveCar, makeLoop, spawnParkedCar, stepTraffic, syncCarMesh } from './vehicles.js';
import { createPed, knockPed, pedFlee, stepPed } from './pedestrians.js';
import { createOfficer, createPoliceCar as makePoliceCar, stepOfficer, stepPoliceCar, syncPoliceCar } from './police.js';
import { createMissionState, currentMission, currentStep, stepTarget, stepText, updateMissions } from './missions.js';
import { ACTION_ENTER, ACTION_PUNCH, ACTION_SHOOT } from './input.js';
import { createRandom } from './random.js';

const ENEMY_SHIRTS = [0xc23b2e];

function makeEnemyMesh() {
  const group = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: ENEMY_SHIRTS[0] });
  const pants = new THREE.MeshLambertMaterial({ color: 0x2b3440 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
  const gun = new THREE.MeshLambertMaterial({ color: 0x181818 });
  function box(w, h, d, mat, x, y, z) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    group.add(m);
    return m;
  }
  const legL = box(0.16, 0.75, 0.18, pants, -0.11, 0.38, 0);
  const legR = box(0.16, 0.75, 0.18, pants, 0.11, 0.38, 0);
  box(0.52, 0.62, 0.3, shirt, 0, 1.06, 0);
  box(0.13, 0.55, 0.15, shirt, -0.34, 1.05, 0);
  box(0.13, 0.55, 0.15, shirt, 0.34, 1.05, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), skin);
  head.position.set(0, 1.55, 0);
  head.castShadow = true;
  group.add(head);
  const gunMesh = box(0.08, 0.08, 0.55, gun, 0.3, 1.15, 0.3);
  group.add(gunMesh);
  return { group, legL, legR, gunMesh };
}

export function createWorld(random, scene) {
  const city = buildCity(scene, random);
  const colliders = city.colliders;
  const places = city.places;

  const player = {
    x: places.safehouse.x,
    z: places.safehouse.z + 12,
    heading: Math.PI,
    vx: 0,
    vz: 0,
    health: PLAYER.health,
    ammo: PLAYER.pistolAmmo,
    ammoT: 0,
    punchT: 0,
    shootT: 0,
    lastDamageT: -99,
    moving: false,
  };
  // The player on foot: a small humanoid, teal jacket so the eye finds them.
  const playerMesh = (() => {
    const group = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0x2fa39a });
    const pants = new THREE.MeshLambertMaterial({ color: 0x1d2b33 });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
    function box(w, h, d, mat, x, y, z) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      group.add(m);
      return m;
    }
    const legL = box(0.17, 0.78, 0.19, pants, -0.12, 0.39, 0);
    const legR = box(0.17, 0.78, 0.19, pants, 0.12, 0.39, 0);
    box(0.56, 0.64, 0.32, jacket, 0, 1.1, 0);
    const armL = box(0.14, 0.58, 0.16, jacket, -0.36, 1.08, 0);
    const armR = box(0.14, 0.58, 0.16, jacket, 0.36, 1.08, 0);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), skin);
    head.position.set(0, 1.6, 0);
    head.castShadow = true;
    group.add(head);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0xe87a2e }));
    cap.position.set(0, 1.82, 0);
    group.add(cap);
    scene.add(group);
    return { group, legL, legR, armL, armR };
  })();

  const cars = [];
  const traffic = [];
  const policeCars = [];
  const officers = [];
  const peds = [];
  const enemies = [];
  const pickups = [];

  // Parked cars the player can steal, and traffic on loops around blocks.
  for (let i = 0; i < 7; i += 1) {
    cars.push(spawnParkedCar(scene, random, CAR_COLORS[i % CAR_COLORS.length]));
  }
  for (let i = 0; i < TRAFFIC.count; i += 1) {
    const bx = random.pick(CITY.centres);
    const bz = random.pick(CITY.centres);
    const clockwise = random.chance(0.5);
    const loop = makeLoop(bx, bz, clockwise);
    const start = loop[0];
    const car = createCar(scene, start.x, start.z, 0, random.pick(CAR_COLORS), { kind: 'traffic', driver: 'traffic' });
    car.loop = loop;
    car.waypoint = 1;
    car.targetSpeed = random.range(TRAFFIC.minSpeed, TRAFFIC.maxSpeed);
    car.heading = Math.atan2(loop[1].x - loop[0].x, loop[1].z - loop[0].z);
    cars.push(car);
    traffic.push(car);
  }

  for (let i = 0; i < PED.count; i += 1) {
    const bx = random.pick(CITY.centres);
    const bz = random.pick(CITY.centres);
    const x = bx + random.range(-24, 24);
    const z = bz + random.range(-24, 24);
    peds.push(createPed(scene, random, x, z));
  }

  for (let i = 0; i < PICKUPS.count; i += 1) {
    pickups.push({ x: 0, z: 0, active: false, respawnT: random.range(0, 5) });
  }

  const state = {
    scene,
    random,
    colliders,
    places,
    player,
    playerMesh,
    playerCar: null,
    cars,
    traffic,
    policeCars,
    officers,
    peds,
    enemies,
    pickups,
    fare: null,
    fareT: 8,
    missions: createMissionState(),
    cash: MISSIONS.startCash,
    earned: 0,
    wanted: 0,
    wantedT: 0,
    decayT: 0,
    time: 0,
    objectiveText: '',
    missionName: 'Free Roam',
    timerText: '',
    prompt: '',
    banner: '',
    bannerT: 0,
    inCar: false,
    specialCar: null,
    stats: { carsStolen: 0, missionsDone: 0, faresDone: 0, pickups: 0 },
    over: null,
    overReason: '',
  };

  function randomPickupSpot() {
    const bx = random.pick(CITY.centres);
    const bz = random.pick(CITY.centres);
    return { x: bx + random.range(-24, 24), z: bz + random.range(-24, 24) };
  }

  function spawnFare() {
    const spot = randomPickupSpot();
    state.fare = {
      active: true,
      x: spot.x,
      z: spot.z,
      destX: 0,
      destZ: 0,
      passenger: false,
      value: 0,
      waitT: FARE.waitSeconds,
    };
    // A fare ped standing on the sidewalk.
    const ped = createPed(scene, random, spot.x, spot.z);
    ped.loop = [{ x: spot.x, z: spot.z }];
    ped.waypoint = 0;
    ped.speed = 0;
    state.fare.ped = ped;
    peds.push(ped);
  }

  function removeFarePed() {
    if (!state.fare || !state.fare.ped) return;
    const ped = state.fare.ped;
    scene.remove(ped.group);
    const index = peds.indexOf(ped);
    if (index !== -1) peds.splice(index, 1);
    state.fare.ped = null;
  }

  function setBanner(text, seconds) {
    state.banner = text;
    state.bannerT = seconds;
  }

  function addWanted(n, events) {
    if (n <= 0) return;
    const before = state.wanted;
    state.wanted = Math.min(WANTED.max, state.wanted + n);
    state.wantedT = 0;
    state.decayT = 0;
    if (state.wanted > before) {
      events.push({ type: 'wantedUp', stars: state.wanted });
      setBanner(`Wanted level ${state.wanted}`, 2.2);
    }
  }

  function damagePlayer(amount, events) {
    if (state.over) return;
    player.health -= amount;
    player.lastDamageT = state.time;
    if (player.health <= 0) {
      player.health = 0;
      wastePlayer(events);
    }
  }

  function payFine(events) {
    const fine = Math.max(WANTED.fineMin, Math.floor(state.cash * WANTED.fineFraction));
    state.cash = Math.max(0, state.cash - fine);
    return fine;
  }

  function respawn(events) {
    player.x = places.safehouse.x;
    player.z = places.safehouse.z;
    player.heading = Math.PI;
    player.vx = 0;
    player.vz = 0;
    player.health = PLAYER.health;
    player.ammo = PLAYER.pistolAmmo;
    state.wanted = 0;
    state.wantedT = 0;
    state.decayT = 0;
    if (state.playerCar) {
      state.playerCar.driver = null;
      state.playerCar = null;
      state.inCar = false;
    }
    clearPolice();
    clearEnemies();
    if (state.fare && state.fare.passenger) {
      state.fare.passenger = false;
      state.fare = null;
      state.fareT = 12;
    }
  }

  function bustPlayer(events) {
    if (state.over) return;
    const fine = payFine(events);
    state.over = 'busted';
    state.overReason = `Busted! The Solmar police took $${fine} off you.`;
    events.push({ type: 'busted', fine });
    events.push({ type: 'save' });
  }

  function wastePlayer(events) {
    if (state.over) return;
    const fine = payFine(events);
    state.over = 'wasted';
    state.overReason = `Wasted! The medics took $${fine} off you.`;
    events.push({ type: 'wasted', fine });
    events.push({ type: 'save' });
  }

  function clearPolice() {
    for (const car of policeCars) scene.remove(car.group);
    policeCars.length = 0;
    for (const car of cars) {
      if (car.kind === 'police') {
        const i = cars.indexOf(car);
        if (i !== -1) cars.splice(i, 1);
      }
    }
    for (const officer of officers) scene.remove(officer.group);
    officers.length = 0;
  }

  function clearEnemies() {
    for (const enemy of enemies) scene.remove(enemy.group);
    enemies.length = 0;
  }

  function spawnPoliceCar(events) {
    // On a road, a little away from the player, facing the player.
    const angle = random.range(0, Math.PI * 2);
    const dist = random.range(55, 80);
    let x = player.x + Math.cos(angle) * dist;
    let z = player.z + Math.sin(angle) * dist;
    x = Math.max(-180, Math.min(180, x));
    z = Math.max(-180, Math.min(180, z));
    const heading = Math.atan2(player.x - x, player.z - z);
    const car = makePoliceCar(scene, x, z, heading);
    cars.push(car);
    policeCars.push(car);
  }

  function spawnGuards(at, count) {
    for (let i = 0; i < count; i += 1) {
      const mesh = makeEnemyMesh();
      const x = at.x + random.range(-14, 14);
      const z = at.z + random.range(-14, 14);
      mesh.group.position.set(x, 0, z);
      scene.add(mesh.group);
      enemies.push({ group: mesh.group, legL: mesh.legL, legR: mesh.legR, x, z, heading: 0, health: 100, shootT: random.range(0.5, 1.5), state: 'alive', downT: 0 });
    }
  }

  function spawnSpecialCar(at) {
    if (state.specialCar) return;
    // Just outside the plaza fountain, so the player can walk up to it.
    const car = createCar(scene, at.x + 12, at.z + 12, Math.PI / 2, 0xc23b2e, { kind: 'parked' });
    cars.push(car);
    state.specialCar = car;
  }

  function nearestStealable(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of cars) {
      if (car.kind === 'police') continue;
      if (car.driver === 'player') continue;
      const d = Math.hypot(car.x - player.x, car.z - player.z);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function enterCar(car, events) {
    const wasTraffic = car.driver === 'traffic';
    if (wasTraffic) {
      // The driver bails out and runs.
      const ped = createPed(scene, random, car.x + 2, car.z + 2);
      pedFlee(ped, car.x, car.z);
      peds.push(ped);
      addWanted(WANTED.stealTraffic, events);
    }
    car.driver = 'player';
    state.playerCar = car;
    state.inCar = true;
    state.stats.carsStolen += 1;
    if (car === state.specialCar) {
      events.push({ type: 'stoleSpecial' });
      state.specialCar = null;
    } else {
      events.push({ type: 'stoleCar', traffic: wasTraffic });
    }
    events.push({ type: 'burst', x: car.x, y: 1, z: car.z, color: 0xffffff, count: 8, speed: 3, life: 0.5, gravity: 2 });
  }

  function exitCar(events) {
    const car = state.playerCar;
    if (!car) return;
    car.driver = null;
    if (car.kind === 'traffic') car.kind = 'parked';
    const side = 2.4;
    player.x = car.x + Math.cos(car.heading) * side;
    player.z = car.z - Math.sin(car.heading) * side;
    player.heading = car.heading;
    player.vx = 0;
    player.vz = 0;
    clampToMap(player);
    resolveBuildingCollision(player, PLAYER.radius, colliders);
    state.playerCar = null;
    state.inCar = false;
    if (state.fare && state.fare.passenger) {
      state.fare.passenger = false;
      state.fare = null;
      state.fareT = 15;
      setBanner('The fare walked off.', 2);
    }
  }

  function shoot(camYaw, events) {
    if (player.shootT > 0 || player.ammo <= 0) return;
    player.shootT = PLAYER.pistolRate;
    player.ammo -= 1;
    // Restart the slow ammo regen, so the shot just fired is not refunded on the
    // very next frame by a timer that has been running since the game started.
    player.ammoT = 0;
    player.heading = camYaw;
    const dirX = Math.sin(camYaw);
    const dirZ = Math.cos(camYaw);
    const muzzleX = player.x + dirX * 1.2;
    const muzzleZ = player.z + dirZ * 1.2;
    events.push({ type: 'shot', x: muzzleX, z: muzzleZ, dirX, dirZ });
    events.push({ type: 'burst', x: muzzleX, y: 1.4, z: muzzleZ, color: 0xffd98a, count: 6, speed: 4, life: 0.25, gravity: 0 });
    // The nearest enemy or officer in the line of fire, within range and a narrow cone.
    let best = null;
    let bestD = PLAYER.pistolRange;
    const targets = [];
    for (const e of enemies) if (e.state === 'alive') targets.push({ x: e.x, z: e.z, kind: 'enemy', ref: e });
    for (const o of officers) targets.push({ x: o.x, z: o.z, kind: 'officer', ref: o });
    for (const t of targets) {
      const dx = t.x - player.x;
      const dz = t.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d > bestD || d < 0.5) continue;
      const dot = (dx * dirX + dz * dirZ) / d;
      if (dot < 0.94) continue;
      bestD = d;
      best = t;
    }
    if (best) {
      events.push({ type: 'burst', x: best.x, y: 1.2, z: best.z, color: 0xff5040, count: 10, speed: 4, life: 0.4, gravity: 3 });
      if (best.kind === 'enemy') {
        best.ref.health -= PLAYER.pistolDamage;
        if (best.ref.health <= 0) {
          best.ref.state = 'down';
          best.ref.downT = 5;
          best.ref.group.rotation.x = -Math.PI / 2;
          events.push({ type: 'enemyDown', remaining: enemies.filter((e) => e.state === 'alive').length });
        }
      } else {
        addWanted(WANTED.shoot, events);
        events.push({ type: 'officerDown' });
        const index = officers.indexOf(best.ref);
        if (index !== -1) {
          scene.remove(best.ref.group);
          officers.splice(index, 1);
        }
      }
    }
    // Nearby pedestrians flee from the shot.
    for (const ped of peds) {
      if (Math.hypot(ped.x - player.x, ped.z - player.z) < 25) pedFlee(ped, player.x, player.z);
    }
  }

  function punch(events) {
    if (player.punchT > 0) return;
    player.punchT = PLAYER.punchRate;
    const dirX = Math.sin(player.heading);
    const dirZ = Math.cos(player.heading);
    for (const e of enemies) {
      if (e.state !== 'alive') continue;
      const dx = e.x - player.x;
      const dz = e.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < PLAYER.punchRange && (dx * dirX + dz * dirZ) / Math.max(0.1, d) > 0.5) {
        e.health -= PLAYER.punchDamage;
        events.push({ type: 'burst', x: e.x, y: 1.2, z: e.z, color: 0xff5040, count: 8, speed: 3, life: 0.3, gravity: 3 });
        if (e.health <= 0) {
          e.state = 'down';
          e.downT = 5;
          e.group.rotation.x = -Math.PI / 2;
        }
        return;
      }
    }
    for (const o of officers) {
      const dx = o.x - player.x;
      const dz = o.z - player.z;
      const d = Math.hypot(dx, dz);
      if (d < PLAYER.punchRange && (dx * dirX + dz * dirZ) / Math.max(0.1, d) > 0.5) {
        addWanted(WANTED.shoot, events);
        const index = officers.indexOf(o);
        if (index !== -1) {
          scene.remove(o.group);
          officers.splice(index, 1);
        }
        return;
      }
    }
  }

  function stepPlayer(dt, input, camYaw, events) {
    player.shootT = Math.max(0, player.shootT - dt);
    player.punchT = Math.max(0, player.punchT - dt);
    player.ammoT += dt;
    if (player.ammoT > 1.5 && player.ammo < PLAYER.pistolAmmo) {
      player.ammo += 1;
      player.ammoT = 0;
    }
    if (state.time - player.lastDamageT > PLAYER.regenDelay && player.health < PLAYER.health) {
      player.health = Math.min(PLAYER.health, player.health + PLAYER.regenRate * dt);
    }

    if (state.playerCar) {
      const car = state.playerCar;
      const throttle = input.moveY();
      const steer = input.moveX();
      const handbrake = input.handbrake();
      car.steerVis = steer * 0.45;
      const impact = driveCar(car, throttle, steer, handbrake, dt, colliders);
      if (impact > CAR.crashSpeed) {
        damagePlayer(CAR.crashDamage, events);
        events.push({ type: 'crash', x: car.x, y: 1, z: car.z, intensity: impact });
        events.push({ type: 'burst', x: car.x, y: 1, z: car.z, color: 0xffa040, count: 14, speed: 6, life: 0.5, gravity: 6 });
      }
      // Running over pedestrians.
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - car.x, ped.z - car.z) < CAR.radius) {
          knockPed(ped);
          addWanted(WANTED.hitPed, events);
          events.push({ type: 'burst', x: ped.x, y: 1, z: ped.z, color: 0xff5040, count: 10, speed: 4, life: 0.5, gravity: 4 });
        }
      }
      return;
    }

    // On foot: move relative to the camera.
    const moveY = input.moveY();
    const moveX = input.moveX();
    const fx = Math.sin(camYaw);
    const fz = Math.cos(camYaw);
    const rx = -fz;
    const rz = fx;
    let dx = fx * moveY + rx * moveX;
    let dz = fz * moveY + rz * moveX;
    const len = Math.hypot(dx, dz);
    if (len > 0.01) {
      dx /= len;
      dz /= len;
      player.moving = true;
      const speed = input.run() ? PLAYER.runSpeed : PLAYER.walkSpeed;
      const tx = dx * speed;
      const tz = dz * speed;
      player.vx += (tx - player.vx) * Math.min(1, dt * 10);
      player.vz += (tz - player.vz) * Math.min(1, dt * 10);
      const targetHeading = Math.atan2(dx, dz);
      let d = targetHeading - player.heading;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      player.heading += Math.max(-6 * dt, Math.min(6 * dt, d));
    } else {
      player.moving = false;
      player.vx += (0 - player.vx) * Math.min(1, dt * 10);
      player.vz += (0 - player.vz) * Math.min(1, dt * 10);
    }
    player.x += player.vx * dt;
    player.z += player.vz * dt;
    clampToMap(player);
    resolveBuildingCollision(player, PLAYER.radius, colliders);
    // Don't walk through cars.
    for (const car of cars) {
      const dx = player.x - car.x;
      const dz = player.z - car.z;
      const d = Math.hypot(dx, dz);
      if (d < CAR.radius + 0.4 && d > 0.001) {
        player.x = car.x + (dx / d) * (CAR.radius + 0.4);
        player.z = car.z + (dz / d) * (CAR.radius + 0.4);
      }
    }
    // Pick up cash on foot.
    for (const p of pickups) {
      if (!p.active) continue;
      if (Math.hypot(p.x - player.x, p.z - player.z) < 2.5) {
        p.active = false;
        p.respawnT = PICKUPS.respawnSeconds;
        state.cash += PICKUPS.value;
        state.earned += PICKUPS.value;
        state.stats.pickups += 1;
        events.push({ type: 'pickup', x: p.x, z: p.z, value: PICKUPS.value });
        events.push({ type: 'burst', x: p.x, y: 1.2, z: p.z, color: 0x37d67a, count: 12, speed: 4, life: 0.6, gravity: 1 });
      }
    }
  }

  function stepTrafficCars(dt, events) {
    for (const car of traffic) {
      stepTraffic(car, dt, cars, colliders);
      // A traffic car that hits a pedestrian knocks them down (no wanted for the player).
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        if (Math.hypot(ped.x - car.x, ped.z - car.z) < CAR.radius) {
          knockPed(ped);
          events.push({ type: 'burst', x: ped.x, y: 1, z: ped.z, color: 0xff5040, count: 8, speed: 4, life: 0.4, gravity: 4 });
        }
      }
    }
    // Car-car collisions.
    for (let i = 0; i < cars.length; i += 1) {
      for (let j = i + 1; j < cars.length; j += 1) {
        const impact = collideCars(cars[i], cars[j]);
        if (impact > 8 && (cars[i].driver === 'player' || cars[j].driver === 'player')) {
          const playerCar = cars[i].driver === 'player' ? cars[i] : cars[j];
          damagePlayer(Math.min(12, impact * 0.4), events);
          events.push({ type: 'crash', x: playerCar.x, y: 1, z: playerCar.z, intensity: impact });
          events.push({ type: 'burst', x: playerCar.x, y: 1, z: playerCar.z, color: 0xffa040, count: 12, speed: 5, life: 0.5, gravity: 6 });
          const other = playerCar === cars[i] ? cars[j] : cars[i];
          if (other.kind === 'police') addWanted(WANTED.ramCop, events);
        }
      }
    }
  }

  function stepPolice(dt, events) {
    const wantCars = WANTED.policeCars[state.wanted];
    const wantFoot = state.playerCar ? 0 : WANTED.policeFoot[state.wanted];
    while (policeCars.length < wantCars) spawnPoliceCar(events);
    while (policeCars.length > wantCars) {
      const car = policeCars.pop();
      scene.remove(car.group);
      const i = cars.indexOf(car);
      if (i !== -1) cars.splice(i, 1);
    }
    let pinning = false;
    const targetSpeed = state.playerCar ? Math.abs(state.playerCar.speed) : 0;
    for (const car of policeCars) {
      if (stepPoliceCar(car, state.playerCar ? state.playerCar.x : player.x, state.playerCar ? state.playerCar.z : player.z, targetSpeed, dt, colliders)) {
        pinning = true;
      }
      syncPoliceCar(car, dt);
    }
    if (pinning && state.playerCar) {
      const car = policeCars[0];
      if (car && car.pinT > WANTED.bustSeconds) bustPlayer(events);
    }
    while (officers.length < wantFoot) {
      const angle = random.range(0, Math.PI * 2);
      const officer = createOfficer(scene, player.x + Math.cos(angle) * 25, player.z + Math.sin(angle) * 25);
      officers.push(officer);
    }
    while (officers.length > wantFoot) {
      const officer = officers.pop();
      scene.remove(officer.group);
    }
    for (const officer of officers) {
      if (stepOfficer(officer, player.x, player.z, dt, colliders)) bustPlayer(events);
    }
  }

  function stepEnemies(dt, events) {
    for (const enemy of enemies) {
      if (enemy.state === 'down') {
        enemy.downT -= dt;
        if (enemy.downT <= 0) {
          scene.remove(enemy.group);
          const i = enemies.indexOf(enemy);
          if (i !== -1) enemies.splice(i, 1);
        }
        continue;
      }
      const dx = player.x - enemy.x;
      const dz = player.z - enemy.z;
      const dist = Math.hypot(dx, dz);
      enemy.heading = Math.atan2(dx, dz);
      enemy.group.rotation.y = enemy.heading;
      enemy.shootT -= dt;
      if (dist < 42 && enemy.shootT <= 0) {
        enemy.shootT = 1.25;
        const hitChance = Math.max(0.15, Math.min(0.65, 0.7 - dist / 70));
        const hit = random.next() < hitChance;
        events.push({ type: 'enemyShot', x: enemy.x, z: enemy.z, hit });
        events.push({ type: 'burst', x: enemy.x + Math.sin(enemy.heading) * 1, y: 1.4, z: enemy.z + Math.cos(enemy.heading) * 1, color: 0xffd98a, count: 5, speed: 4, life: 0.2, gravity: 0 });
        if (hit) {
          damagePlayer(8, events);
          events.push({ type: 'burst', x: player.x, y: 1.4, z: player.z, color: 0xff5040, count: 8, speed: 4, life: 0.4, gravity: 3 });
        }
      }
    }
  }

  function stepPickups(dt) {
    for (const p of pickups) {
      if (p.active) continue;
      p.respawnT -= dt;
      if (p.respawnT <= 0) {
        const spot = randomPickupSpot();
        p.x = spot.x;
        p.z = spot.z;
        p.active = true;
      }
    }
    // Driving over a pickup collects it too.
    if (state.playerCar) {
      const car = state.playerCar;
      for (const p of pickups) {
        if (!p.active) continue;
        if (Math.hypot(p.x - car.x, p.z - car.z) < 3) {
          p.active = false;
          p.respawnT = PICKUPS.respawnSeconds;
          state.cash += PICKUPS.value;
          state.earned += PICKUPS.value;
          state.stats.pickups += 1;
        }
      }
    }
  }

  function stepFare(dt, events, interactPressed) {
    if (!state.fare) {
      state.fareT -= dt;
      if (state.fareT <= 0) spawnFare();
      return;
    }
    const fare = state.fare;
    if (fare.passenger) {
      const d = Math.hypot(fare.destX - (state.playerCar ? state.playerCar.x : player.x), fare.destZ - (state.playerCar ? state.playerCar.z : player.z));
      if (d < 10) {
        state.cash += fare.value;
        state.earned += fare.value;
        state.stats.faresDone += 1;
        events.push({ type: 'fareDone', value: fare.value });
        events.push({ type: 'burst', x: fare.destX, y: 1.5, z: fare.destZ, color: 0x37d67a, count: 14, speed: 4, life: 0.6, gravity: 1 });
        state.fare = null;
        state.fareT = 14;
      }
      return;
    }
    fare.waitT -= dt;
    if (fare.waitT <= 0) {
      removeFarePed();
      state.fare = null;
      state.fareT = 12;
      return;
    }
    // Pick up: the player must be in a car, close, and press E.
    if (state.playerCar && interactPressed) {
      const d = Math.hypot(fare.x - state.playerCar.x, fare.z - state.playerCar.z);
      if (d < 7) {
        removeFarePed();
        fare.passenger = true;
        const dest = randomPickupSpot();
        fare.destX = dest.x;
        fare.destZ = dest.z;
        fare.value = Math.floor(random.range(FARE.min, FARE.max));
        setBanner(`Fare: take them to the marker — $${fare.value}`, 3);
      }
    }
  }

  function updatePrompt() {
    if (state.over) {
      state.prompt = '';
      return;
    }
    const step = currentStep(state.missions);
    if (state.playerCar) {
      state.prompt = 'E — get out   ·   Space — handbrake';
      return;
    }
    if (step && step.type === 'hold' && state.missions.holdT > 0) {
      state.prompt = `Cracking the vault… ${Math.ceil(step.hold - state.missions.holdT)}s — hold E`;
      return;
    }
    if (step && step.type === 'hold') {
      state.prompt = 'Hold E to crack the vault';
      return;
    }
    const car = nearestStealable(4.5);
    if (car) {
      state.prompt = car === state.specialCar ? 'E — steal the red Comet' : 'E — steal this car';
      return;
    }
    if (step && step.type === 'interact') {
      const target = stepTarget(state.missions, places);
      if (target && Math.hypot(player.x - target.x, player.z - target.z) <= step.radius) {
        state.prompt = 'E — pick up the package';
        return;
      }
    }
    if (state.fare && state.fare.active && !state.fare.passenger && state.playerCar) {
      state.prompt = 'E — pick up the fare';
      return;
    }
    state.prompt = 'WASD — move   ·   E — enter a car   ·   Click — shoot   ·   F — punch';
  }

  function updateObjective() {
    const mission = currentMission(state.missions);
    if (!mission) {
      state.missionName = 'Free Roam';
      state.objectiveText = 'Explore Solmar Bay — take fares, grab cash, stay out of trouble.';
      state.timerText = '';
      return;
    }
    state.missionName = mission.name;
    state.objectiveText = stepText(state.missions);
    const step = currentStep(state.missions);
    if (step && step.time && state.missions.timer > 0) {
      state.timerText = `${Math.ceil(state.missions.timer)}s`;
    } else if (step && step.type === 'hold' && state.missions.holdT > 0) {
      state.timerText = `${Math.ceil(step.hold - state.missions.holdT)}s`;
    } else {
      state.timerText = '';
    }
  }

  function updateMissionTarget() {
    const target = stepTarget(state.missions, places);
    if (target && !state.over) {
      state.missionTarget = target;
      return;
    }
    if (state.fare && state.fare.passenger) {
      state.missionTarget = { x: state.fare.destX, z: state.fare.destZ };
      return;
    }
    if (state.fare && state.fare.active && state.playerCar) {
      state.missionTarget = { x: state.fare.x, z: state.fare.z };
      return;
    }
    state.missionTarget = null;
  }

  function step(dt, input, camYaw) {
    const events = [];
    if (state.over) return events;
    state.time += dt;
    if (state.bannerT > 0) {
      state.bannerT -= dt;
      if (state.bannerT <= 0) state.banner = '';
    }
    state.wantedT += dt;

    // Only the world's own bits: the menu handler already took mute/pause/confirm.
    const actions = input.takeActions(ACTION_ENTER | ACTION_PUNCH | ACTION_SHOOT);
    const interactPressed = !!(actions & ACTION_ENTER);
    const holdingE = false;
    const shootPressed = !!(actions & ACTION_SHOOT);
    const punchPressed = !!(actions & ACTION_PUNCH);

    // Enter / exit a car, and mission interactions.
    if (interactPressed) {
      if (state.playerCar) {
        exitCar(events);
      } else {
        const car = nearestStealable(4.5);
        if (car) enterCar(car, events);
      }
    }
    if (shootPressed && !state.playerCar) shoot(camYaw, events);
    if (punchPressed && !state.playerCar) punch(events);

    stepPlayer(dt, input, camYaw, events);
    stepTrafficCars(dt, events);
    for (const ped of peds) stepPed(ped, dt, colliders);
    // Respawning a downed pedestrian somewhere else keeps the streets full.
    for (const ped of peds) {
      if (ped.state === 'down' && ped.downT <= 0.5 && ped.x !== undefined) {
        // (stepPed already returns them to walking; nothing to do here.)
      }
    }
    stepPolice(dt, events);
    stepEnemies(dt, events);
    stepPickups(dt);

    // Wanted decay: quiet for a while and no police nearby.
    if (state.wanted > 0) {
      state.decayT += dt;
      const nearPolice = policeCars.some((c) => Math.hypot(c.x - player.x, c.z - player.z) < 80) || officers.length > 0;
      if (state.decayT >= WANTED.decaySeconds && !nearPolice) {
        state.wanted -= 1;
        state.decayT = 0;
        events.push({ type: 'wantedDown', stars: state.wanted });
      }
    }

    // Missions.
    const enemiesDown = enemies.filter((e) => e.state === 'down').length;
    const missionCtx = {
      playerX: state.playerCar ? state.playerCar.x : player.x,
      playerZ: state.playerCar ? state.playerCar.z : player.z,
      inCar: !!state.playerCar,
      wanted: state.wanted,
      interactPressed,
      holdingE,
      stoleCar: events.some((e) => e.type === 'stoleCar'),
      stoleSpecial: events.some((e) => e.type === 'stoleSpecial'),
      enemiesDown,
      places,
      dt,
    };
    const missionEvents = updateMissions(state.missions, missionCtx, dt);
    for (const ev of missionEvents) {
      if (ev.type === 'spawnGuards') spawnGuards(ev.at, ev.count);
      else if (ev.type === 'spawnSpecial') spawnSpecialCar(ev.at);
      else if (ev.type === 'wantedBoost') addWanted(Math.max(0, ev.stars - state.wanted), events);
      else if (ev.type === 'missionStart') setBanner(`${ev.mission.name} — ${ev.mission.intro}`, 3.5);
      else if (ev.type === 'missionDone') {
        state.cash += ev.reward;
        state.earned += ev.reward;
        state.stats.missionsDone += 1;
        setBanner(`Mission complete — +$${ev.reward}`, 4);
        events.push({ type: 'missionDone', mission: ev.mission, reward: ev.reward });
        events.push({ type: 'save' });
      } else if (ev.type === 'missionFailed') {
        setBanner(ev.reason, 4);
        events.push({ type: 'missionFailed', reason: ev.reason });
      } else if (ev.type === 'checkpoint') {
        setBanner(`Checkpoint ${ev.index} of ${ev.total}`, 2);
        events.push(ev);
      } else if (ev.type === 'allDone') {
        setBanner('Solmar Legend — every job done. The city is yours.', 6);
        events.push(ev);
        events.push({ type: 'save' });
      } else {
        events.push(ev);
      }
    }

    stepFare(dt, events, interactPressed);
    updatePrompt();
    updateObjective();
    updateMissionTarget();

    // Sync the visible meshes.
    for (const car of cars) syncCarMesh(car, dt);
    playerMesh.group.position.set(player.x, 0, player.z);
    playerMesh.group.rotation.y = player.heading;
    playerMesh.group.visible = !state.playerCar;
    const swing = player.moving ? Math.sin(state.time * 11) * 0.55 : 0;
    playerMesh.legL.rotation.x = swing;
    playerMesh.legR.rotation.x = -swing;
    playerMesh.armL.rotation.x = -swing * 0.8;
    playerMesh.armR.rotation.x = swing * 0.8;

    return events;
  }

  function reset(newGame) {
    respawn([]);
    state.cash = MISSIONS.startCash;
    state.earned = 0;
    state.missions = createMissionState();
    state.stats = { carsStolen: 0, missionsDone: 0, faresDone: 0, pickups: 0 };
    state.over = null;
    state.overReason = '';
    state.time = 0;
    state.banner = '';
    state.bannerT = 0;
    state.fare = null;
    state.fareT = 8;
    state.specialCar = null;
    for (const p of pickups) {
      p.active = false;
      p.respawnT = random.range(0, 3);
    }
    if (newGame) {
      try {
        window.localStorage.removeItem(SAVE_KEY);
      } catch {
        // Storage can be off; the game still runs.
      }
    }
  }

  function save() {
    try {
      const data = {
        cash: state.cash,
        earned: state.earned,
        missionIndex: state.missions.missionIndex,
        stepIndex: state.missions.stepIndex,
        playerX: player.x,
        playerZ: player.z,
        health: player.health,
        stats: state.stats,
      };
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {
      // Storage can be off; the game still runs.
    }
  }

  function load() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (typeof data !== 'object' || data === null) return false;
      state.cash = typeof data.cash === 'number' ? data.cash : MISSIONS.startCash;
      state.earned = typeof data.earned === 'number' ? data.earned : 0;
      state.missions.missionIndex = typeof data.missionIndex === 'number' ? data.missionIndex : 0;
      state.missions.stepIndex = typeof data.stepIndex === 'number' ? data.stepIndex : 0;
      state.missions.started = false;
      if (typeof data.playerX === 'number') player.x = data.playerX;
      if (typeof data.playerZ === 'number') player.z = data.playerZ;
      if (typeof data.health === 'number') player.health = data.health;
      if (data.stats) state.stats = data.stats;
      clampToMap(player);
      resolveBuildingCollision(player, PLAYER.radius, colliders);
      return true;
    } catch {
      return false;
    }
  }

  function readBest() {
    try {
      return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
    } catch {
      return 0;
    }
  }

  function saveBest(value) {
    try {
      window.localStorage.setItem(BEST_KEY, String(value));
    } catch {
      // Storage can be off.
    }
  }

  // First-frame setup: pickups appear, the first fare is on its way.
  for (const p of pickups) p.respawnT = random.range(0, 2);

  return { state, step, reset, save, load, readBest, saveBest, respawn, bustPlayer, wastePlayer };
}
