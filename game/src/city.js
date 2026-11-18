// The city of Solmar Bay: a 5x5 grid of blocks, a beach and the sea to the east, built
// from one procedural ground texture (roads, sidewalks, crosswalks, beach, sea) and
// boxes with canvas facades. Everything is placed from the seeded random, so the same
// seed always builds the same city. No model, image or sound is loaded from outside.
import * as THREE from 'three';
import { CITY, FACADE_COLORS, PALETTE } from './config.js';

const GROUND_W = 2048;
const GROUND_H = 1024;

function worldToCanvasX(x) {
  return ((x - CITY.groundWest) / (CITY.groundEast - CITY.groundWest)) * GROUND_W;
}
function worldToCanvasY(z) {
  return ((z - CITY.groundNorth) / (CITY.groundSouth - CITY.groundNorth)) * GROUND_H;
}
function worldToCanvasW(w) {
  return (w / (CITY.groundEast - CITY.groundWest)) * GROUND_W;
}
function worldToCanvasH(h) {
  return (h / (CITY.groundSouth - CITY.groundNorth)) * GROUND_H;
}

/** True when the point is on a road (within half a road width of a centreline). */
export function isOnRoad(x, z) {
  const half = CITY.road / 2;
  for (const c of CITY.roads) {
    if (Math.abs(x - c) <= half || Math.abs(z - c) <= half) return true;
  }
  return false;
}

/** The centreline nearest to `v` (for traffic that drives along a road). */
export function nearestRoad(v) {
  let best = CITY.roads[0];
  let bestD = Math.abs(v - best);
  for (const c of CITY.roads) {
    const d = Math.abs(v - c);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

/** A point on the road network, snapped to a centreline (for spawning traffic). */
export function randomRoadPoint(random) {
  const alongX = random.chance(0.5);
  const road = random.pick(CITY.roads);
  const t = random.range(CITY.groundNorth + 20, CITY.groundSouth - 20);
  return alongX ? { x: t, z: road } : { x: road, z: t };
}

function drawGroundTexture(random) {
  const canvas = document.createElement('canvas');
  canvas.width = GROUND_W;
  canvas.height = GROUND_H;
  const g = canvas.getContext('2d');
  const X = worldToCanvasX;
  const Y = worldToCanvasY;
  const W = worldToCanvasW;
  const H = worldToCanvasH;

  // Base: grass.
  g.fillStyle = '#6fa055';
  g.fillRect(0, 0, GROUND_W, GROUND_H);
  // A few grass patches, so the green is not one flat tone.
  for (let i = 0; i < 260; i += 1) {
    g.fillStyle = random.chance(0.5) ? '#679a4e' : '#77aa5c';
    const px = random.range(0, GROUND_W);
    const py = random.range(0, GROUND_H);
    g.beginPath();
    g.arc(px, py, random.range(6, 26), 0, Math.PI * 2);
    g.fill();
  }

  // Beach (sand) east of the city, then the sea.
  g.fillStyle = '#e8d29a';
  g.fillRect(X(CITY.beachX), 0, X(CITY.seaX) - X(CITY.beachX), GROUND_H);
  g.fillStyle = '#2e7fa8';
  g.fillRect(X(CITY.seaX), 0, GROUND_W - X(CITY.seaX), GROUND_H);
  // Wave lines where the sea meets the sand.
  g.strokeStyle = 'rgba(255,255,255,0.55)';
  g.lineWidth = 3;
  for (let i = 0; i < 9; i += 1) {
    const wx = X(CITY.seaX) + 8 + i * 16;
    g.beginPath();
    for (let y = 0; y <= GROUND_H; y += 24) {
      const wobble = Math.sin(y * 0.02 + i) * 6;
      if (y === 0) g.moveTo(wx + wobble, y);
      else g.lineTo(wx + wobble, y);
    }
    g.stroke();
  }
  // Wet sand band at the waterline.
  g.fillStyle = '#d9c48c';
  g.fillRect(X(CITY.seaX) - W(4), 0, W(4), GROUND_H);

  // Roads: asphalt strips along every centreline.
  g.fillStyle = '#3a3f46';
  for (const c of CITY.roads) {
    g.fillRect(X(CITY.groundWest), Y(c) - H(CITY.road) / 2, X(CITY.beachX) - X(CITY.groundWest), H(CITY.road));
    g.fillRect(X(c) - W(CITY.road) / 2, Y(CITY.groundNorth), W(CITY.road), Y(CITY.groundSouth) - Y(CITY.groundNorth));
  }
  // Lane markings: a dashed yellow centre line and white edges.
  g.strokeStyle = '#e8c84a';
  g.lineWidth = 2;
  g.setLineDash([18, 22]);
  for (const c of CITY.roads) {
    g.beginPath();
    g.moveTo(X(CITY.groundWest), Y(c));
    g.lineTo(X(CITY.beachX), Y(c));
    g.stroke();
    g.beginPath();
    g.moveTo(X(c), Y(CITY.groundNorth));
    g.lineTo(X(c), Y(CITY.groundSouth));
    g.stroke();
  }
  g.setLineDash([]);
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = 2;
  for (const c of CITY.roads) {
    g.beginPath();
    g.moveTo(X(CITY.groundWest), Y(c) - H(CITY.road) / 2 + 4);
    g.lineTo(X(CITY.beachX), Y(c) - H(CITY.road) / 2 + 4);
    g.stroke();
    g.beginPath();
    g.moveTo(X(CITY.groundWest), Y(c) + H(CITY.road) / 2 - 4);
    g.lineTo(X(CITY.beachX), Y(c) + H(CITY.road) / 2 - 4);
    g.stroke();
    g.beginPath();
    g.moveTo(X(c) - W(CITY.road) / 2 + 4, Y(CITY.groundNorth));
    g.lineTo(X(c) - W(CITY.road) / 2 + 4, Y(CITY.groundSouth));
    g.stroke();
    g.beginPath();
    g.moveTo(X(c) + W(CITY.road) / 2 - 4, Y(CITY.groundNorth));
    g.lineTo(X(c) + W(CITY.road) / 2 - 4, Y(CITY.groundSouth));
    g.stroke();
  }
  // Crosswalks at every intersection.
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const cx of CITY.roads) {
    for (const cz of CITY.roads) {
      for (let s = -3; s <= 3; s += 1) {
        g.fillRect(X(cx + s * 2.1) - W(0.9), Y(cz) - H(CITY.road) / 2 + 2, W(1.8), H(CITY.road) - 4);
      }
    }
  }

  // Blocks: a sidewalk ring, then the block's own surface.
  for (const bx of CITY.centres) {
    for (const bz of CITY.centres) {
      const x0 = bx - CITY.block / 2;
      const z0 = bz - CITY.block / 2;
      g.fillStyle = '#b9b3a4';
      g.fillRect(X(x0), Y(z0), W(CITY.block), H(CITY.block));
      const kind = blockKind(bx, bz);
      const inner = 5;
      if (kind === 'park') {
        g.fillStyle = '#5d9448';
        g.fillRect(X(x0 + inner), Y(z0 + inner), W(CITY.block - inner * 2), H(CITY.block - inner * 2));
      } else if (kind === 'plaza') {
        g.fillStyle = '#cfc8b4';
        g.fillRect(X(x0 + inner), Y(z0 + inner), W(CITY.block - inner * 2), H(CITY.block - inner * 2));
        g.fillStyle = '#3f8fb8';
        g.beginPath();
        g.arc(X(bx), Y(bz), W(9), 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#e8e0c8';
        g.lineWidth = 3;
        g.beginPath();
        g.arc(X(bx), Y(bz), W(13), 0, Math.PI * 2);
        g.stroke();
      } else if (kind === 'parking') {
        g.fillStyle = '#43484f';
        g.fillRect(X(x0 + inner), Y(z0 + inner), W(CITY.block - inner * 2), H(CITY.block - inner * 2));
        g.strokeStyle = 'rgba(255,255,255,0.8)';
        g.lineWidth = 2;
        for (let s = 0; s < 6; s += 1) {
          const sx = X(x0 + 8 + s * 7);
          g.beginPath();
          g.moveTo(sx, Y(z0 + 8));
          g.lineTo(sx, Y(z0 + 22));
          g.stroke();
          g.beginPath();
          g.moveTo(sx, Y(z0 + CITY.block - 22));
          g.lineTo(sx, Y(z0 + CITY.block - 8));
          g.stroke();
        }
      } else {
        g.fillStyle = '#8a8f7a';
        g.fillRect(X(x0 + inner), Y(z0 + inner), W(CITY.block - inner * 2), H(CITY.block - inner * 2));
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function blockKind(bx, bz) {
  if (bx === 0 && bz === 0) return 'plaza';
  if (bx === -144 && bz === 144) return 'garage';
  if (bx === -144 && bz === -144) return 'bank';
  if (bx === 144 && bz === -144) return 'docks';
  if (bx === 144 && bz === 144) return 'marina';
  if ((bx === -72 && bz === 72) || (bx === 72 && bz === -72) || (bx === 144 && bz === 0)) return 'park';
  if ((bx === -72 && bz === -72) || (bx === 72 && bz === 72)) return 'parking';
  return 'buildings';
}

function facadeCanvas(color) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = color.base;
  g.fillRect(0, 0, 256, 256);
  // A darker base and a trim at the top.
  g.fillStyle = color.trim;
  g.fillRect(0, 0, 256, 10);
  g.fillRect(0, 232, 256, 24);
  // Windows: four floors of six, some lit warm.
  for (let floor = 0; floor < 4; floor += 1) {
    for (let col = 0; col < 6; col += 1) {
      const lit = ((floor * 7 + col * 3) % 5) === 0;
      g.fillStyle = lit ? '#ffd98a' : color.windows;
      g.fillRect(18 + col * 40, 28 + floor * 52, 24, 34);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      g.fillRect(18 + col * 40, 28 + floor * 52, 24, 6);
    }
  }
  return canvas;
}

function buildFacadeMaterials() {
  // One material per (facade colour, floor count): the texture repeats so a window
  // row is about 10 units tall whatever the building's height.
  const cache = new Map();
  return function facadeMaterial(colorIndex, height) {
    const floors = Math.max(1, Math.round(height / 10));
    const key = `${colorIndex}:${floors}`;
    if (cache.has(key)) return cache.get(key);
    const color = FACADE_COLORS[colorIndex % FACADE_COLORS.length];
    const texture = new THREE.CanvasTexture(facadeCanvas(color));
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, floors / 4);
    const material = new THREE.MeshLambertMaterial({ map: texture });
    cache.set(key, material);
    return material;
  };
}

/**
 * Build the city into `scene` and return its colliders and places.
 * Colliders are flat AABBs {minX,maxX,minZ,maxZ} the cars and the player push out of.
 */
export function buildCity(scene, random) {
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // Ground.
  const groundGeo = new THREE.PlaneGeometry(CITY.groundEast - CITY.groundWest, CITY.groundSouth - CITY.groundNorth);
  const groundMat = new THREE.MeshLambertMaterial({ map: drawGroundTexture(random) });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set((CITY.groundWest + CITY.groundEast) / 2, 0, 0);
  ground.receiveShadow = true;
  group.add(ground);

  const facadeMaterial = buildFacadeMaterials();
  const roofMat = new THREE.MeshLambertMaterial({ color: PALETTE.buildingRoof });
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x7a5230 });
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x3f8f4f });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0x2b2f36 });
  const lampGlowMat = new THREE.MeshLambertMaterial({ color: 0xffe9a8, emissive: 0xffdf8a });

  const trees = [];
  const lamps = [];
  const umbrellas = [];

  function addBuilding(x, z, w, d, h, colorIndex) {
    const mesh = new THREE.Mesh(boxGeo, facadeMaterial(colorIndex, h));
    mesh.scale.set(w, h, d);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // A flat roof cap, slightly wider, so the top reads as a roof, not a facade.
    const roof = new THREE.Mesh(boxGeo, roofMat);
    roof.scale.set(w + 0.4, 0.5, d + 0.4);
    roof.position.set(x, h + 0.2, z);
    roof.castShadow = true;
    group.add(roof);
    colliders.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, height: h });
    return mesh;
  }

  for (const bx of CITY.centres) {
    for (const bz of CITY.centres) {
      const kind = blockKind(bx, bz);
      if (kind === 'plaza') {
        // The fountain: a basin and a centre column.
        const basin = new THREE.Mesh(new THREE.CylinderGeometry(9, 10, 1.2, 24), new THREE.MeshLambertMaterial({ color: 0xcfc8b4 }));
        basin.position.set(bx, 0.6, bz);
        basin.castShadow = true;
        basin.receiveShadow = true;
        group.add(basin);
        const water = new THREE.Mesh(new THREE.CylinderGeometry(8, 8, 0.3, 24), new THREE.MeshLambertMaterial({ color: 0x3f8fb8 }));
        water.position.set(bx, 1.2, bz);
        group.add(water);
        const column = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.2, 4, 12), new THREE.MeshLambertMaterial({ color: 0xe8e0c8 }));
        column.position.set(bx, 3, bz);
        column.castShadow = true;
        group.add(column);
        colliders.push({ minX: bx - 10, maxX: bx + 10, minZ: bz - 10, maxZ: bz + 10, height: 4 });
        for (let i = 0; i < 6; i += 1) trees.push({ x: bx + random.range(-22, 22), z: bz + random.range(-22, 22) });
        continue;
      }
      if (kind === 'park') {
        for (let i = 0; i < 7; i += 1) {
          trees.push({ x: bx + random.range(-22, 22), z: bz + random.range(-22, 22) });
        }
        continue;
      }
      if (kind === 'parking') continue;
      if (kind === 'garage') {
        // Lena's garage: one wide low building with a big door face.
        addBuilding(bx - 6, bz, 30, 34, 7, 3);
        continue;
      }
      if (kind === 'bank') {
        addBuilding(bx, bz, 34, 30, 26, 4);
        continue;
      }
      if (kind === 'docks') {
        addBuilding(bx - 10, bz - 8, 26, 20, 9, 5);
        addBuilding(bx + 12, bz + 10, 22, 18, 8, 0);
        continue;
      }
      if (kind === 'marina') {
        addBuilding(bx, bz, 30, 30, 44, 1);
        addBuilding(bx - 16, bz + 14, 16, 14, 12, 2);
        continue;
      }
      // Ordinary blocks: one to three buildings, taller toward the centre.
      const dist = Math.abs(bx) + Math.abs(bz);
      const maxH = dist === 0 ? 34 : dist <= 72 ? 28 : 18;
      const count = random.int(1, 3);
      const spots = [
        { x: bx - 12, z: bz - 12 },
        { x: bx + 12, z: bz + 10 },
        { x: bx + 10, z: bz - 13 },
        { x: bx - 13, z: bz + 12 },
      ];
      for (let i = 0; i < count; i += 1) {
        const s = spots[i];
        const w = random.range(16, 24);
        const d = random.range(16, 24);
        const h = random.range(8, maxH);
        addBuilding(s.x, s.z, w, d, h, random.int(0, FACADE_COLORS.length - 1));
      }
      if (random.chance(0.6)) trees.push({ x: bx + random.range(-20, 20), z: bz + random.range(-20, 20) });
    }
  }

  // Palms along the beach and a few on the west edge.
  for (let z = -240; z <= 240; z += 34) {
    trees.push({ x: 210 + random.range(-4, 10), z: z + random.range(-6, 6) });
  }
  for (let i = 0; i < 8; i += 1) {
    trees.push({ x: random.range(-250, -200), z: random.range(-240, 240) });
  }
  // Beach umbrellas.
  for (let i = 0; i < 7; i += 1) {
    umbrellas.push({ x: random.range(200, 245), z: random.range(-220, 220), color: random.pick([0xe85f4b, 0x3f7fb8, 0xe8c84a, 0x7fb069]) });
  }

  // Street lamps at every intersection corner, set back from the road edge.
  for (const cx of CITY.roads) {
    for (const cz of CITY.roads) {
      lamps.push({ x: cx + 12, z: cz + 12 });
      lamps.push({ x: cx - 12, z: cz - 12 });
    }
  }

  // Trees as instanced meshes (one trunk, one canopy each).
  const trunkGeo = new THREE.CylinderGeometry(0.22, 0.35, 5.5, 7);
  const canopyGeo = new THREE.IcosahedronGeometry(2.6, 0);
  const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, trees.length);
  const canopyMesh = new THREE.InstancedMesh(canopyGeo, canopyMat, trees.length);
  const m4 = new THREE.Matrix4();
  trees.forEach((t, i) => {
    m4.makeTranslation(t.x, 2.75, t.z);
    trunkMesh.setMatrixAt(i, m4);
    m4.makeTranslation(t.x, 6.4, t.z);
    canopyMesh.setMatrixAt(i, m4);
  });
  trunkMesh.castShadow = true;
  canopyMesh.castShadow = true;
  group.add(trunkMesh);
  group.add(canopyMesh);

  // Street lamps as instanced meshes.
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 6, 6);
  const headGeo = new THREE.SphereGeometry(0.32, 8, 6);
  const poleMesh = new THREE.InstancedMesh(poleGeo, lampMat, lamps.length);
  const headMesh = new THREE.InstancedMesh(headGeo, lampGlowMat, lamps.length);
  lamps.forEach((lamp, i) => {
    m4.makeTranslation(lamp.x, 3, lamp.z);
    poleMesh.setMatrixAt(i, m4);
    m4.makeTranslation(lamp.x, 6.1, lamp.z);
    headMesh.setMatrixAt(i, m4);
  });
  group.add(poleMesh);
  group.add(headMesh);

  // Beach umbrellas: a pole and a coloured cone each.
  const umbrellaPoleGeo = new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6);
  for (const u of umbrellas) {
    const pole = new THREE.Mesh(umbrellaPoleGeo, lampMat);
    pole.position.set(u.x, 1.2, u.z);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.1, 10), new THREE.MeshLambertMaterial({ color: u.color }));
    top.position.set(u.x, 2.8, u.z);
    top.castShadow = true;
    group.add(top);
  }

  return {
    colliders,
    // Reachable points: the door of each place, on the sidewalk outside its building.
    places: {
      garage: { x: -150, z: 122 },
      safehouse: { x: -144, z: 168 },
      bank: { x: -144, z: -126 },
      docks: { x: 150, z: -150 },
      marina: { x: 150, z: 168 },
      plaza: { x: 0, z: 0 },
      beach: { x: 220, z: 0 },
    },
  };
}

/** Push a circle (x, z, radius) out of every building collider it overlaps. */
export function resolveBuildingCollision(pos, radius, colliders) {
  for (const c of colliders) {
    const nx = Math.max(c.minX, Math.min(pos.x, c.maxX));
    const nz = Math.max(c.minZ, Math.min(pos.z, c.maxZ));
    const dx = pos.x - nx;
    const dz = pos.z - nz;
    const d2 = dx * dx + dz * dz;
    if (d2 < radius * radius) {
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = nx + (dx / d) * radius;
        pos.z = nz + (dz / d) * radius;
      } else {
        // Dead centre inside a building: push out along the smallest penetration.
        const pushLeft = pos.x - c.minX;
        const pushRight = c.maxX - pos.x;
        const pushUp = pos.z - c.minZ;
        const pushDown = c.maxZ - pos.z;
        const m = Math.min(pushLeft, pushRight, pushUp, pushDown);
        if (m === pushLeft) pos.x = c.minX - radius;
        else if (m === pushRight) pos.x = c.maxX + radius;
        else if (m === pushUp) pos.z = c.minZ - radius;
        else pos.z = c.maxZ + radius;
      }
    }
  }
}

/** Clamp a position to the walkable map (the sea is the eastern edge). */
export function clampToMap(pos) {
  pos.x = Math.max(CITY.groundWest + 8, Math.min(254, pos.x));
  pos.z = Math.max(CITY.groundNorth + 8, Math.min(CITY.groundSouth - 8, pos.z));
  return pos;
}
