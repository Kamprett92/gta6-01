// The police: patrol cars that chase and ram, and officers on foot who chase and
// arrest. A police car's light bar flashes; a car that pins the player's car (or an
// officer who touches the player on foot) starts the bust.
import * as THREE from 'three';
import { CAR, WANTED } from './config.js';
import { resolveBuildingCollision } from './city.js';
import { createCar, headingTo, syncCarMesh } from './vehicles.js';
import { makePedMesh } from './pedestrians.js';

export function createPoliceCar(scene, x, z, heading) {
  const car = createCar(scene, x, z, heading, 0x1d2b3a, { kind: 'police', police: true, driver: 'police' });
  car.targetSpeed = WANTED.chaseSpeed;
  car.pinT = 0;
  return car;
}

function angleLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * Math.min(1, Math.max(0, t));
}

/**
 * Chase the target. Returns true while this car is pinning a slow player car
 * (close and the player barely moving) — the bust timer counts then.
 */
export function stepPoliceCar(car, targetX, targetZ, targetSpeed, dt, colliders) {
  const dx = targetX - car.x;
  const dz = targetZ - car.z;
  const dist = Math.hypot(dx, dz);
  const desired = headingTo(dx, dz);
  car.heading = angleLerp(car.heading, desired, 2.2 * dt);
  // Ease off when very close so the car rams instead of orbiting the player.
  const want = dist < 6 ? Math.max(6, targetSpeed * 0.5) : WANTED.chaseSpeed;
  car.speed += (want - car.speed) * Math.min(1, dt * 1.8);
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  resolveBuildingCollision(car, CAR.radius, colliders);
  const pinning = dist < 5 && Math.abs(targetSpeed) < 2;
  car.pinT = pinning ? car.pinT + dt : 0;
  return pinning;
}

export function createOfficer(scene, x, z) {
  const { group, legL, legR, armL, armR } = makePedMesh(0x1d2b3a);
  // A police cap.
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.1, 10), new THREE.MeshLambertMaterial({ color: 0x101820 }));
  cap.position.set(0, 1.78, 0);
  group.add(cap);
  const officer = {
    group,
    legL,
    legR,
    armL,
    armR,
    x,
    z,
    heading: 0,
    walkPhase: 0,
    speed: 7,
  };
  group.position.set(x, 0, z);
  scene.add(group);
  return officer;
}

/** Chase the player on foot. Returns true when the officer touches the player. */
export function stepOfficer(officer, targetX, targetZ, dt, colliders) {
  const dx = targetX - officer.x;
  const dz = targetZ - officer.z;
  const dist = Math.hypot(dx, dz);
  if (dist > 0.01) {
    officer.heading = Math.atan2(dx, dz);
    officer.x += Math.sin(officer.heading) * officer.speed * dt;
    officer.z += Math.cos(officer.heading) * officer.speed * dt;
    resolveBuildingCollision(officer, 0.5, colliders);
  }
  officer.walkPhase += dt * 11;
  const swing = Math.sin(officer.walkPhase) * 0.55;
  officer.legL.rotation.x = swing;
  officer.legR.rotation.x = -swing;
  officer.armL.rotation.x = -swing * 0.8;
  officer.armR.rotation.x = swing * 0.8;
  officer.group.position.set(officer.x, 0, officer.z);
  officer.group.rotation.y = officer.heading;
  return dist < WANTED.bustTouch;
}

export function syncPoliceCar(car, dt) {
  syncCarMesh(car, dt);
}
