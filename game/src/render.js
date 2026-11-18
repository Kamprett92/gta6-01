// Drawing only: the three.js renderer, the third-person camera, the sun and sky, the
// HUD (DOM) and the minimap, the mission beacon, and a small particle pool. The world
// hands it state; it never changes the rules.
import * as THREE from 'three';
import { CITY, PALETTE } from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const MINIMAP = 180;
const PARTICLES = 400;

function makeSunTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,244,200,1)');
  grad.addColorStop(0.35, 'rgba(255,220,140,0.9)');
  grad.addColorStop(1, 'rgba(255,220,140,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createRenderer(canvas, hud) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 160, 720);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1200);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.85);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(PALETTE.sun, 1.9);
  sun.position.set(180, 240, 120);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -280;
  sun.shadow.camera.right = 280;
  sun.shadow.camera.top = 280;
  sun.shadow.camera.bottom = -280;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 700;
  sun.shadow.bias = -0.0006;
  scene.add(sun);
  scene.add(sun.target);

  // The sun disc and a few drifting clouds.
  const sunSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeSunTexture(), depthWrite: false, fog: false }));
  sunSprite.position.set(420, 320, -420);
  sunSprite.scale.set(180, 180, 1);
  scene.add(sunSprite);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  const clouds = [];
  for (let i = 0; i < 7; i += 1) {
    const cloud = new THREE.Group();
    const puffs = 3 + (i % 3);
    for (let p = 0; p < puffs; p += 1) {
      const sphere = new THREE.Mesh(new THREE.SphereGeometry(9 + p * 3, 8, 6), cloudMat);
      sphere.position.set(p * 12 - puffs * 6, (p % 2) * 3, (p % 3) * 6 - 6);
      sphere.scale.y = 0.45;
      cloud.add(sphere);
    }
    cloud.position.set(-350 + i * 110, 95 + (i % 3) * 14, -260 + (i * 53) % 420);
    scene.add(cloud);
    clouds.push(cloud);
  }

  // The mission beacon: a light column and a spinning diamond over the target.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.22, depthWrite: false });
  const beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 60, 16, 1, true), beaconMat);
  beacon.position.y = 30;
  const diamond = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.6),
    new THREE.MeshBasicMaterial({ color: 0xf2c94c, transparent: true, opacity: 0.95 }),
  );
  diamond.position.y = 7;
  const beaconGroup = new THREE.Group();
  beaconGroup.add(beacon);
  beaconGroup.add(diamond);
  beaconGroup.visible = false;
  scene.add(beaconGroup);

  // Particles: one THREE.Points, a fixed pool, dead ones parked below the map.
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(PARTICLES * 3);
  const pCol = new Float32Array(PARTICLES * 3);
  for (let i = 0; i < PARTICLES; i += 1) pPos[i * 3 + 1] = -1000;
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  const pMat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  const particles = [];
  for (let i = 0; i < PARTICLES; i += 1) {
    particles.push({ alive: false, x: 0, y: -1000, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1, gravity: 0 });
  }
  let pCursor = 0;

  // Pickup markers: small gold diamonds that bob over the cash pickups.
  const pickupMat = new THREE.MeshBasicMaterial({ color: 0x37d67a });
  const pickupGeo = new THREE.OctahedronGeometry(0.8);
  const pickupMeshes = [];
  for (let i = 0; i < 12; i += 1) {
    const mesh = new THREE.Mesh(pickupGeo, pickupMat);
    mesh.visible = false;
    scene.add(mesh);
    pickupMeshes.push(mesh);
  }

  // Camera state.
  let camYaw = Math.PI;
  let camPitch = 0.42;
  let camDist = 10;
  let mouseIdle = 0;
  let snapNext = false;
  let smoothPos = new THREE.Vector3(0, 8, -20);
  let smoothTarget = new THREE.Vector3();

  const minimap = hud.minimap.getContext('2d');

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  function spawnBurst(x, y, z, color, count, speed, life, gravity) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n += 1) {
      const p = particles[pCursor];
      pCursor = (pCursor + 1) % PARTICLES;
      p.alive = true;
      p.x = x;
      p.y = y;
      p.z = z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.2;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.vx = Math.cos(a) * s;
      p.vz = Math.sin(a) * s;
      p.vy = up * s;
      p.life = life * (0.6 + Math.random() * 0.7);
      p.max = p.life;
      p.gravity = gravity;
      const i = particles.indexOf(p);
      pCol[i * 3] = c.r;
      pCol[i * 3 + 1] = c.g;
      pCol[i * 3 + 2] = c.b;
    }
  }

  function stepParticles(dt) {
    for (let i = 0; i < PARTICLES; i += 1) {
      const p = particles[i];
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        pPos[i * 3 + 1] = -1000;
        continue;
      }
      p.vy -= p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.y < 0.05) {
        p.y = 0.05;
        p.vy = 0;
        p.vx *= 0.7;
        p.vz *= 0.7;
      }
      pPos[i * 3] = p.x;
      pPos[i * 3 + 1] = p.y;
      pPos[i * 3 + 2] = p.z;
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.color.needsUpdate = true;
  }

  function addMouse(dx, dy) {
    camYaw -= dx * 0.0042;
    camPitch = Math.max(0.08, Math.min(1.15, camPitch + dy * 0.0032));
    mouseIdle = 0;
  }

  /** Point the camera at a fixed yaw/pitch; with `snap`, jump there at once. */
  function setCamera(yaw, pitch, snap) {
    camYaw = yaw;
    camPitch = pitch;
    mouseIdle = 0;
    if (snap) snapNext = true;
  }

  function cameraDistanceFor(inCar) {
    return inCar ? 13 : 9.5;
  }

  /** Where the camera looks from, so the player moves relative to it. */
  function getYaw() {
    return camYaw;
  }

  function updateCamera(target, heading, inCar, dt, colliders, state) {
    mouseIdle += dt;
    // A staged shot or the title orbit can pin the camera's yaw and distance.
    if (state && state.cameraYawOverride !== undefined) camYaw = state.cameraYawOverride;
    // While driving and the mouse is still, ease the camera behind the car.
    if (inCar && mouseIdle > 1.2 && !(state && state.cameraYawOverride !== undefined)) {
      let d = heading - camYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      camYaw += d * Math.min(1, dt * 1.4);
    }
    const dist = state && state.cameraDist ? state.cameraDist : cameraDistanceFor(inCar);
    camDist += (dist - camDist) * Math.min(1, dt * 4);
    if (state && state.cameraDist) camDist = state.cameraDist;
    const dir = new THREE.Vector3(-Math.sin(camYaw) * Math.cos(camPitch), Math.sin(camPitch), -Math.cos(camYaw) * Math.cos(camPitch));
    // Keep the camera out of buildings: shorten the ray where a collider blocks it.
    let reach = camDist;
    for (let t = 0.4; t <= 1; t += 0.1) {
      const px = target.x + dir.x * camDist * t;
      const pz = target.z + dir.z * camDist * t;
      const py = target.y + dir.y * camDist * t;
      if (py < 1) continue;
      for (const c of colliders) {
        if (px > c.minX && px < c.maxX && pz > c.minZ && pz < c.maxZ && py < c.height) {
          reach = Math.min(reach, camDist * (t - 0.12));
        }
      }
    }
    reach = Math.max(3.5, reach);
    const wanted = new THREE.Vector3(
      target.x + dir.x * reach,
      target.y + dir.y * reach,
      target.z + dir.z * reach,
    );
    if (snapNext) {
      smoothPos.copy(wanted);
      smoothTarget.copy(target);
      snapNext = false;
    } else {
      smoothPos.lerp(wanted, Math.min(1, dt * 9));
      smoothTarget.lerp(target, Math.min(1, dt * 12));
    }
    camera.position.copy(smoothPos);
    camera.lookAt(smoothTarget);
  }

  function drawMinimap(state) {
    const g = minimap;
    const sx = MINIMAP / (CITY.groundEast - CITY.groundWest);
    const sz = MINIMAP / (CITY.groundSouth - CITY.groundNorth);
    const mx = (x) => (x - CITY.groundWest) * sx;
    const my = (z) => (z - CITY.groundNorth) * sz;
    g.fillStyle = '#10141a';
    g.fillRect(0, 0, MINIMAP, MINIMAP);
    g.fillStyle = '#2e7fa8';
    g.fillRect(mx(CITY.seaX), 0, MINIMAP - mx(CITY.seaX), MINIMAP);
    g.fillStyle = '#c9b078';
    g.fillRect(mx(CITY.beachX), 0, mx(CITY.seaX) - mx(CITY.beachX), MINIMAP);
    g.fillStyle = '#20242b';
    g.fillRect(mx(-CITY.half), my(-CITY.half), mx(CITY.half) - mx(-CITY.half), my(CITY.half) - my(-CITY.half));
    g.strokeStyle = '#5a6068';
    g.lineWidth = 2;
    for (const c of CITY.roads) {
      g.beginPath();
      g.moveTo(mx(CITY.groundWest), my(c));
      g.lineTo(mx(CITY.beachX), my(c));
      g.stroke();
      g.beginPath();
      g.moveTo(mx(c), my(CITY.groundNorth));
      g.lineTo(mx(c), my(CITY.groundSouth));
      g.stroke();
    }
    // Pickups.
    g.fillStyle = '#37d67a';
    for (const p of state.pickups) {
      if (!p.active) continue;
      g.fillRect(mx(p.x) - 1.5, my(p.z) - 1.5, 3, 3);
    }
    // The fare.
    if (state.fare && state.fare.active) {
      g.fillStyle = '#37d67a';
      g.beginPath();
      g.arc(mx(state.fare.x), my(state.fare.z), 4, 0, Math.PI * 2);
      g.fill();
    }
    // The mission target.
    if (state.missionTarget) {
      const pulse = 4 + Math.sin(performance.now() / 280) * 1.5;
      g.fillStyle = '#f2c94c';
      g.beginPath();
      g.moveTo(mx(state.missionTarget.x), my(state.missionTarget.z) - pulse);
      g.lineTo(mx(state.missionTarget.x) + pulse, my(state.missionTarget.z));
      g.lineTo(mx(state.missionTarget.x), my(state.missionTarget.z) + pulse);
      g.lineTo(mx(state.missionTarget.x) - pulse, my(state.missionTarget.z));
      g.fill();
    }
    // Traffic (white) and police (flashing blue/red).
    const flash = Math.floor(performance.now() / 350) % 2 === 0;
    g.fillStyle = '#e8e8e8';
    for (const car of state.cars) {
      if (car.kind === 'police') continue;
      if (car.driver === 'player') continue;
      g.fillRect(mx(car.x) - 1.5, my(car.z) - 1.5, 3, 3);
    }
    for (const car of state.cars) {
      if (car.kind !== 'police') continue;
      g.fillStyle = flash ? '#ff4040' : '#4080ff';
      g.beginPath();
      g.arc(mx(car.x), my(car.z), 3.5, 0, Math.PI * 2);
      g.fill();
    }
    // The player: a white arrow.
    const px = state.playerCar ? state.playerCar.x : state.player.x;
    const pz = state.playerCar ? state.playerCar.z : state.player.z;
    const heading = state.playerCar ? state.playerCar.heading : state.player.heading;
    g.save();
    g.translate(mx(px), my(pz));
    g.rotate(Math.atan2(Math.sin(heading), Math.cos(heading)) + Math.PI / 2);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(0, -7);
    g.lineTo(5, 5);
    g.lineTo(-5, 5);
    g.closePath();
    g.fill();
    g.restore();
  }

  function setStars(n) {
    for (let i = 0; i < hud.stars.length; i += 1) {
      hud.stars[i].classList.toggle('lit', i < n);
    }
  }

  function drawHud(state) {
    hud.cash.textContent = `$${Math.floor(state.cash).toLocaleString('en-US')}`;
    setStars(state.wanted);
    hud.healthFill.style.width = `${Math.max(0, Math.round(state.player.health))}%`;
    hud.healthFill.style.background = state.player.health > 50 ? '#37d67a' : state.player.health > 25 ? '#f2c94c' : '#e5534b';
    hud.objective.textContent = state.objectiveText || '';
    hud.missionName.textContent = state.missionName || 'Free Roam';
    hud.timer.textContent = state.timerText || '';
    hud.speed.textContent = state.playerCar ? `${Math.round(Math.abs(state.playerCar.speed) * 3.6)} km/h` : '';
    hud.ammo.textContent = state.inCar ? '' : `Ammo ${state.player.ammo}`;
    hud.prompt.textContent = state.prompt || '';
    hud.crosshair.style.display = state.inCar ? 'none' : 'block';
    if (state.banner) {
      hud.banner.textContent = state.banner;
      hud.banner.classList.add('show');
    } else {
      hud.banner.classList.remove('show');
    }
    drawMinimap(state);
  }

  /** One frame: move the camera, the beacon and the pickups, render, paint the HUD. */
  function draw(state, screen, dt) {
    const target = state.cameraTarget
      ? new THREE.Vector3(state.cameraTarget.x, state.cameraTarget.y, state.cameraTarget.z)
      : new THREE.Vector3(
          state.playerCar ? state.playerCar.x : state.player.x,
          2.2,
          state.playerCar ? state.playerCar.z : state.player.z,
        );
    const heading = state.playerCar ? state.playerCar.heading : state.player.heading;
    updateCamera(target, heading, !!state.playerCar, dt, state.colliders, state);
    for (const cloud of clouds) {
      cloud.position.x += dt * 1.2;
      if (cloud.position.x > 420) cloud.position.x = -420;
    }
    if (state.missionTarget) {
      beaconGroup.visible = true;
      beaconGroup.position.set(state.missionTarget.x, 0, state.missionTarget.z);
      diamond.rotation.y += dt * 2.2;
      diamond.position.y = 7 + Math.sin(performance.now() / 350) * 0.8;
    } else {
      beaconGroup.visible = false;
    }
    state.pickups.forEach((p, i) => {
      const mesh = pickupMeshes[i];
      if (!mesh) return;
      mesh.visible = !!p.active;
      if (p.active) {
        mesh.position.set(p.x, 1.2 + Math.sin(performance.now() / 300 + i) * 0.25, p.z);
        mesh.rotation.y += dt * 2;
      }
    });
    stepParticles(dt);
    renderer.render(scene, camera);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(state);
  }

  return {
    scene,
    draw,
    addMouse,
    setCamera,
    getYaw,
    spawnBurst,
    burstAt(x, y, z, color, count, speed, life, gravity) {
      spawnBurst(x, y, z, color, count, speed, life, gravity);
    },
  };
}
