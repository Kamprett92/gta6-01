// Pedestrians: simple walkers on the sidewalks. Each one follows a rectangular loop
// around a block, turns at the corners, and runs away from gunshots and from cars that
// get too close. A pedestrian a car hits goes down, then gets up somewhere else.
import * as THREE from 'three';
import { CITY, PED, PED_SHIRTS } from './config.js';
import { resolveBuildingCollision } from './city.js';

const skinMat = new THREE.MeshLambertMaterial({ color: 0xd9a986 });
const pantsMat = new THREE.MeshLambertMaterial({ color: 0x2b3440 });
const hairMat = new THREE.MeshLambertMaterial({ color: 0x2b2118 });

function box(w, h, d, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function makePedMesh(shirtColor) {
  const group = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });
  const legL = box(0.16, 0.75, 0.18, pantsMat, -0.11, 0.38, 0);
  const legR = box(0.16, 0.75, 0.18, pantsMat, 0.11, 0.38, 0);
  const torso = box(0.52, 0.62, 0.3, shirtMat, 0, 1.06, 0);
  const armL = box(0.13, 0.55, 0.15, shirtMat, -0.34, 1.05, 0);
  const armR = box(0.13, 0.55, 0.15, shirtMat, 0.34, 1.05, 0);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), skinMat);
  head.position.set(0, 1.55, 0);
  head.castShadow = true;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), hairMat);
  hair.position.set(0, 1.62, -0.03);
  hair.scale.set(1, 0.7, 1);
  group.add(legL, legR, torso, armL, armR, head, hair);
  return { group, legL, legR, armL, armR };
}

/** A loop around a block on its sidewalk (a little inside the block's edge). */
export function makePedLoop(bx, bz) {
  const e = CITY.block / 2 - 2;
  return [
    { x: bx - e, z: bz - e },
    { x: bx + e, z: bz - e },
    { x: bx + e, z: bz + e },
    { x: bx - e, z: bz + e },
  ];
}

export function createPed(scene, random, x, z) {
  const { group, legL, legR, armL, armR } = makePedMesh(random.pick(PED_SHIRTS));
  const bx = random.pick(CITY.centres);
  const bz = random.pick(CITY.centres);
  const ped = {
    group,
    legL,
    legR,
    armL,
    armR,
    x,
    z,
    heading: random.range(0, Math.PI * 2),
    speed: random.range(PED.minSpeed, PED.maxSpeed),
    loop: makePedLoop(bx, bz),
    waypoint: 0,
    state: 'walk',
    stateT: 0,
    walkPhase: random.range(0, Math.PI * 2),
    downT: 0,
  };
  group.position.set(x, 0, z);
  scene.add(group);
  return ped;
}

/** A pedestrian runs away from a point (a gunshot, a speeding car). */
export function pedFlee(ped, fromX, fromZ) {
  if (ped.state === 'down') return;
  ped.state = 'flee';
  ped.stateT = 2.5;
  const dx = ped.x - fromX;
  const dz = ped.z - fromZ;
  ped.heading = Math.atan2(dx, dz);
}

function stepWalk(ped, dt, colliders) {
  const target = ped.loop[ped.waypoint];
  const dx = target.x - ped.x;
  const dz = target.z - ped.z;
  const dist = Math.hypot(dx, dz);
  if (dist < 1.2) {
    ped.waypoint = (ped.waypoint + 1) % ped.loop.length;
    return;
  }
  const desired = Math.atan2(dx, dz);
  let d = desired - ped.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  ped.heading += Math.max(-2.4 * dt, Math.min(2.4 * dt, d));
  ped.x += Math.sin(ped.heading) * ped.speed * dt;
  ped.z += Math.cos(ped.heading) * ped.speed * dt;
  resolveBuildingCollision(ped, 0.5, colliders);
}

export function stepPed(ped, dt, colliders) {
  if (ped.state === 'down') {
    ped.downT -= dt;
    ped.group.rotation.x = -Math.PI / 2;
    if (ped.downT <= 0) {
      ped.state = 'walk';
      ped.group.rotation.x = 0;
    }
    return;
  }
  if (ped.state === 'flee') {
    ped.stateT -= dt;
    ped.x += Math.sin(ped.heading) * PED.fleeSpeed * dt;
    ped.z += Math.cos(ped.heading) * PED.fleeSpeed * dt;
    resolveBuildingCollision(ped, 0.5, colliders);
    if (ped.stateT <= 0) ped.state = 'walk';
  } else {
    stepWalk(ped, dt, colliders);
  }
  // A walking swing for the legs and arms.
  ped.walkPhase += dt * (ped.state === 'flee' ? 11 : 6);
  const swing = Math.sin(ped.walkPhase) * 0.5;
  ped.legL.rotation.x = swing;
  ped.legR.rotation.x = -swing;
  ped.armL.rotation.x = -swing * 0.8;
  ped.armR.rotation.x = swing * 0.8;
  ped.group.position.set(ped.x, 0, ped.z);
  ped.group.rotation.y = ped.heading;
}

/** Knock a pedestrian down (a car hit them): they lie still, then get back up. */
export function knockPed(ped) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.downT = 6;
}
