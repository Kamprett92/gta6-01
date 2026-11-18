// Cars: a boxy mesh built from primitives, arcade driving physics for the player,
// and waypoint-loop AI for traffic. A car's forward is (sin(heading), cos(heading))
// in (x, z); the mesh is built facing +z, so rotation.y = heading.
import * as THREE from 'three';
import { CAR, TRAFFIC } from './config.js';
import { isOnRoad, nearestRoad, resolveBuildingCollision } from './city.js';

const tyreMat = new THREE.MeshLambertMaterial({ color: 0x181818 });
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1a2028 });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0x9aa2ac });
const headMat = new THREE.MeshLambertMaterial({ color: 0xfff2c0, emissive: 0xffedb0 });
const tailMat = new THREE.MeshLambertMaterial({ color: 0x7a1010, emissive: 0xd21f1f });
const bumperMat = new THREE.MeshLambertMaterial({ color: 0x22262c });

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

/** Build the visible car. `police` adds a roof light bar (red/blue, flashing). */
export function makeCarMesh(color, police) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  group.add(box(CAR.width, 0.62, CAR.length, bodyMat, 0, 0.62, 0));
  group.add(box(CAR.width - 0.24, 0.55, 2.2, glassMat, 0, 1.18, -0.25));
  group.add(box(CAR.width - 0.1, 0.12, CAR.length - 0.3, chromeMat, 0, 0.98, 0));
  group.add(box(0.4, 0.18, 0.1, headMat, -0.62, 0.62, CAR.length / 2 + 0.02));
  group.add(box(0.4, 0.18, 0.1, headMat, 0.62, 0.62, CAR.length / 2 + 0.02));
  group.add(box(0.4, 0.16, 0.1, tailMat, -0.62, 0.62, -CAR.length / 2 - 0.02));
  group.add(box(0.4, 0.16, 0.1, tailMat, 0.62, 0.62, -CAR.length / 2 - 0.02));
  group.add(box(CAR.width, 0.16, 0.24, bumperMat, 0, 0.32, CAR.length / 2 + 0.02));
  group.add(box(CAR.width, 0.16, 0.24, bumperMat, 0, 0.32, -CAR.length / 2 - 0.02));

  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = {};
  const positions = { fl: [-0.85, 1.35], fr: [0.85, 1.35], bl: [-0.85, -1.35], br: [0.85, -1.35] };
  for (const [key, [wx, wz]] of Object.entries(positions)) {
    const pivot = new THREE.Group();
    pivot.position.set(wx, 0.38, wz);
    const wheel = new THREE.Mesh(wheelGeo, tyreMat);
    wheel.castShadow = true;
    pivot.add(wheel);
    group.add(pivot);
    wheels[key] = { pivot, wheel };
  }

  let lightBar = null;
  if (police) {
    const redMat = new THREE.MeshLambertMaterial({ color: 0x881111, emissive: 0xff2020 });
    const blueMat = new THREE.MeshLambertMaterial({ color: 0x111188, emissive: 0x2040ff });
    const red = box(0.5, 0.16, 0.3, redMat, -0.32, 1.52, -0.25);
    const blue = box(0.5, 0.16, 0.3, blueMat, 0.32, 1.52, -0.25);
    group.add(red);
    group.add(blue);
    lightBar = { red, blue, redMat, blueMat };
  }
  return { group, wheels, lightBar };
}

/** Create a car object and add it to the scene. */
export function createCar(scene, x, z, heading, color, opts = {}) {
  const { group, wheels, lightBar } = makeCarMesh(color, !!opts.police);
  const car = {
    group,
    wheels,
    lightBar,
    kind: opts.kind || 'parked',
    x,
    z,
    heading,
    speed: 0,
    color,
    driver: opts.driver || null,
    health: 100,
    wheelSpin: 0,
    steerVis: 0,
    flash: 0,
    loop: null,
    waypoint: 0,
    targetSpeed: 0,
    smoke: 0,
  };
  group.position.set(x, 0, z);
  group.rotation.y = heading;
  scene.add(group);
  return car;
}

/** A rectangular loop around a block, on the roads that ring it, offset into the
 * right-hand lane: clockwise loops run the rectangle inset by 4, counter-clockwise
 * the one outset by 4, so the two directions use opposite lanes. */
export function makeLoop(bx, bz, clockwise) {
  const inset = clockwise ? 4 : -4;
  const e = 36 + inset;
  return [
    { x: bx - e, z: bz - e },
    { x: bx + e, z: bz - e },
    { x: bx + e, z: bz + e },
    { x: bx - e, z: bz + e },
  ];
}

export function headingTo(dx, dz) {
  return Math.atan2(dx, dz);
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, Math.max(0, t));
}

/** Drive the player's car. Returns the impact speed of a hard crash, else 0. */
export function driveCar(car, throttle, steer, handbrake, dt, colliders) {
  const speed = car.speed;
  if (throttle > 0) car.speed = Math.min(CAR.maxSpeed, speed + CAR.accel * throttle * dt);
  else if (throttle < 0) {
    if (speed > 0.5) car.speed = Math.max(0, speed - CAR.brake * dt);
    else car.speed = Math.max(-CAR.maxReverse, speed + CAR.reverseAccel * throttle * dt);
  }
  const drag = isOnRoad(car.x, car.z) ? CAR.drag : CAR.offroadDrag;
  car.speed -= car.speed * drag * dt;
  if (handbrake) car.speed -= car.speed * CAR.handbrake * dt;

  const grip = 1 - CAR.steerAtSpeed * Math.min(1, Math.abs(car.speed) / CAR.maxSpeed);
  const turnRate = CAR.steer * grip * (car.speed / CAR.maxSpeed) * (handbrake ? 1.5 : 1);
  car.heading += steer * turnRate * dt * (car.speed < 0 ? -1 : 1);

  const prevX = car.x;
  const prevZ = car.z;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  resolveBuildingCollision(car, CAR.radius, colliders);
  const moved = Math.hypot(car.x - prevX, car.z - prevZ);
  const wanted = Math.abs(car.speed) * dt;
  let impact = 0;
  if (wanted - moved > 0.02 && Math.abs(car.speed) > 3) {
    impact = Math.abs(car.speed);
    car.speed *= 0.3;
  }
  return impact;
}

function carAheadOf(car, cars, gap) {
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  for (const other of cars) {
    if (other === car) continue;
    const dx = other.x - car.x;
    const dz = other.z - car.z;
    const ahead = dx * fx + dz * fz;
    if (ahead > 0 && ahead < gap) {
      const side = Math.abs(-dz * fx + dx * fz);
      if (side < 3) return true;
    }
  }
  return false;
}

/** One traffic step: follow the loop waypoints, slow for corners and for cars ahead. */
export function stepTraffic(car, dt, cars, colliders) {
  const target = car.loop[car.waypoint];
  const dx = target.x - car.x;
  const dz = target.z - car.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 3) {
    car.waypoint = (car.waypoint + 1) % car.loop.length;
    return;
  }
  const desired = headingTo(dx, dz);
  const turnRate = 1.6;
  car.heading = angleLerp(car.heading, desired, turnRate * dt);
  let speed = car.targetSpeed;
  if (dist < 14) speed *= 0.55;
  if (carAheadOf(car, cars, TRAFFIC.followGap)) speed = 0;
  car.speed += (speed - car.speed) * Math.min(1, dt * 2.5);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  resolveBuildingCollision(car, CAR.radius, colliders);
}

/** Push two cars apart when their circles overlap; the faster one keeps more speed. */
export function collideCars(a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const d = Math.hypot(dx, dz);
  const min = CAR.radius * 2 - 0.4;
  if (d >= min || d < 0.001) return 0;
  const push = (min - d) / 2;
  const nx = dx / d;
  const nz = dz / d;
  a.x -= nx * push;
  a.z -= nz * push;
  b.x += nx * push;
  b.z += nz * push;
  const impact = Math.abs(a.speed - b.speed);
  const avg = (a.speed + b.speed) / 2;
  a.speed = avg * 0.6;
  b.speed = avg * 0.6;
  return impact;
}

/** Sync the mesh to the car's state: position, heading, wheel spin and steer, police flash. */
export function syncCarMesh(car, dt) {
  car.group.position.set(car.x, 0, car.z);
  car.group.rotation.y = car.heading;
  car.wheelSpin += (car.speed / 0.38) * dt;
  const steerTarget = car.steerVis || 0;
  car.wheels.fl.pivot.rotation.y = steerTarget;
  car.wheels.fr.pivot.rotation.y = steerTarget;
  for (const key of ['fl', 'fr', 'bl', 'br']) {
    car.wheels[key].wheel.rotation.x = car.wheelSpin;
  }
  if (car.lightBar) {
    car.flash += dt;
    const phase = Math.floor(car.flash * 4) % 2 === 0;
    car.lightBar.redMat.emissiveIntensity = phase ? 2.2 : 0.25;
    car.lightBar.blueMat.emissiveIntensity = phase ? 0.25 : 2.2;
  }
}

/** A parked or traffic car the player can steal: put it on a road or a parking spot. */
export function spawnParkedCar(scene, random, color) {
  const onRoad = random.chance(0.6);
  let x;
  let z;
  let heading;
  if (onRoad) {
    const road = random.pick([-180, -108, -36, 36, 108, 180]);
    if (random.chance(0.5)) {
      // On an east-west road (constant z): face east or west, on the right lane.
      const dir = random.chance(0.5) ? 1 : -1;
      x = random.range(-170, 170);
      z = road + (dir === 1 ? 4 : -4);
      heading = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
    } else {
      // On a north-south road (constant x): face south or north, on the right lane.
      const dir = random.chance(0.5) ? 1 : -1;
      z = random.range(-170, 170);
      x = road + (dir === 1 ? -4 : 4);
      heading = dir === 1 ? 0 : Math.PI;
    }
  } else {
    const bx = random.pick([-144, -72, 0, 72, 144]);
    const bz = random.pick([-144, -72, 0, 72, 144]);
    x = bx + random.range(-18, 18);
    z = bz + random.range(-18, 18);
    heading = random.range(0, Math.PI * 2);
  }
  return createCar(scene, x, z, heading, color, { kind: 'parked' });
}
