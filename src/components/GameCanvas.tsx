/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Subway Runner 3D — game engine.
 *
 * A polished endless runner built entirely from Three.js primitives:
 * animated runner character, 3 lanes, jump/slide, fair-by-construction
 * obstacle patterns, height-aware AABB collision, coins + power-ups,
 * procedural environment (rails, platforms, buildings, arches, skyline),
 * particles, camera juice and WebAudio-synthesised SFX. No external
 * models, textures or audio files.
 */

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  GRAVITY,
  INITIAL_SPEED,
  JUMP_VELOCITY,
  LANE_WIDTH,
  MAX_SPEED,
  SLIDE_DURATION,
} from '../types';
import type {
  ActivePowerUp,
  GameControls,
  GameStats,
  HudState,
  PowerUpType,
} from '../types';
import { Sfx } from '../audio';

interface GameCanvasProps {
  onGameOver: (stats: GameStats) => void;
  onHud: (hud: HudState) => void;
  onRequestPause: () => void;
  paused: boolean;
  controlsRef: { current: GameControls | null };
}

/* ------------------------------------------------------------------ */
/* Tuning constants                                                    */
/* ------------------------------------------------------------------ */

const SEG_LEN = 20;
const SEG_COUNT = 8;
const SPAWN_Z = -150;
const DESPAWN_Z = 18;
const COIN_POOL = 90;
const PLAYER_HALF_W = 0.42;
const PLAYER_HALF_D = 0.35;
const PLAYER_HEIGHT = 2.0;
const PLAYER_SLIDE_HEIGHT = 0.75;
const POWERUP_DURATION = 10;
const COMBO_WINDOW = 2.5;

const rand = (min: number, max: number): number =>
  min + Math.random() * (max - min);
const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/* ------------------------------------------------------------------ */
/* Procedural canvas textures                                          */
/* ------------------------------------------------------------------ */

function canvasTexture(
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2d canvas context unavailable');
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeAsphaltTexture(): THREE.CanvasTexture {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#17171b';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = Math.floor(rand(18, 52));
      ctx.fillStyle = `rgb(${v},${v},${v + 6})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // faint centre wear per lane
    ctx.fillStyle = 'rgba(255,255,255,0.03)';
    for (const x of [42, 128, 214]) ctx.fillRect(x - 18, 0, 36, h);
  });
}

function makeHazardTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#facc15';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111111';
    for (let x = -h; x < w + h; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 16, 0);
      ctx.lineTo(x + 16 + h, h);
      ctx.lineTo(x + h, h);
      ctx.closePath();
      ctx.fill();
    }
  });
}

function makeWindowsTexture(): THREE.CanvasTexture {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#0d0a1a';
    ctx.fillRect(0, 0, w, h);
    const cols = 6;
    const rows = 14;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const lit = Math.random() < 0.42;
        if (!lit) continue;
        ctx.fillStyle =
          Math.random() < 0.7
            ? 'rgba(250, 204, 21, 0.95)'
            : 'rgba(6, 182, 212, 0.95)';
        ctx.fillRect(8 + c * 20, 10 + r * 17, 12, 9);
      }
    }
  });
}

function makeSkyTexture(): THREE.CanvasTexture {
  return canvasTexture(16, 512, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#04020d');
    grad.addColorStop(0.45, '#160a2e');
    grad.addColorStop(0.72, '#3d1a56');
    grad.addColorStop(0.88, '#8a2f5c');
    grad.addColorStop(1, '#ff8a5c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
}

/* ------------------------------------------------------------------ */
/* Track segment construction (merged geometry, few draw calls)        */
/* ------------------------------------------------------------------ */

interface SegmentParts {
  groundGeo: THREE.PlaneGeometry;
  sleeperGeo: THREE.BufferGeometry;
  railGeo: THREE.BufferGeometry;
  platformGeo: THREE.BufferGeometry;
  stripGeo: THREE.BufferGeometry;
  buildingGeos: THREE.BufferGeometry[];
  archMetalGeo: THREE.BufferGeometry;
  archLampGeo: THREE.BufferGeometry;
}

function buildSegmentParts(): SegmentParts {
  const groundGeo = new THREE.PlaneGeometry(17, SEG_LEN);

  // Sleepers: one merged geometry for all 3 lanes.
  const sleeperGeos: THREE.BufferGeometry[] = [];
  const railGeos: THREE.BufferGeometry[] = [];
  for (const laneX of [-LANE_WIDTH, 0, LANE_WIDTH]) {
    for (const dx of [-0.8, 0.8]) {
      const rail = new THREE.BoxGeometry(0.14, 0.1, SEG_LEN);
      rail.translate(laneX + dx, 0.05, 0);
      railGeos.push(rail);
    }
    for (let z = -SEG_LEN / 2 + 0.8; z < SEG_LEN / 2; z += 1.7) {
      const sleeper = new THREE.BoxGeometry(2.4, 0.07, 0.55);
      sleeper.translate(laneX, 0.035, z);
      sleeperGeos.push(sleeper);
    }
  }
  const sleeperGeo = mergeGeometries(sleeperGeos, false) as THREE.BufferGeometry;
  const railGeo = mergeGeometries(railGeos, false) as THREE.BufferGeometry;

  // Side platforms + yellow safety strips.
  const platformGeos: THREE.BufferGeometry[] = [];
  const stripGeos: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const platform = new THREE.BoxGeometry(3.4, 0.6, SEG_LEN);
    platform.translate(side * 8.7, 0.3, 0);
    platformGeos.push(platform);
    const strip = new THREE.BoxGeometry(0.28, 0.64, SEG_LEN);
    strip.translate(side * 7.05, 0.32, 0);
    stripGeos.push(strip);
  }
  const platformGeo = mergeGeometries(platformGeos, false) as THREE.BufferGeometry;
  const stripGeo = mergeGeometries(stripGeos, false) as THREE.BufferGeometry;

  // City buildings, 4 variants so the recycled segments do not repeat
  // the exact same skyline every 20 m.
  const buildingGeos: THREE.BufferGeometry[] = [];
  for (let v = 0; v < 4; v++) {
    const geos: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1]) {
      let z = -SEG_LEN / 2 + rand(1, 3);
      while (z < SEG_LEN / 2 - 1) {
        const bw = rand(3, 5.5);
        const bh = rand(4, 17);
        const bd = rand(2.5, 4.5);
        const b = new THREE.BoxGeometry(bw, bh, bd);
        b.translate(side * rand(12.5, 17.5), bh / 2, z);
        geos.push(b);
        z += bd + rand(0.5, 3.5);
      }
    }
    buildingGeos.push(mergeGeometries(geos, false) as THREE.BufferGeometry);
  }

  // Tunnel arch (metal frame + glowing lamp strip underneath).
  const archMetal: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    const pillar = new THREE.BoxGeometry(0.55, 7.2, 0.55);
    pillar.translate(side * 7.3, 3.6, 0);
    archMetal.push(pillar);
  }
  const beam = new THREE.BoxGeometry(15.2, 0.7, 0.9);
  beam.translate(0, 7.1, 0);
  archMetal.push(beam);
  const archMetalGeo = mergeGeometries(archMetal, false) as THREE.BufferGeometry;
  const archLampGeo = new THREE.BoxGeometry(14.2, 0.16, 0.34);
  archLampGeo.translate(0, 6.68, 0);

  return {
    groundGeo,
    sleeperGeo,
    railGeo,
    platformGeo,
    stripGeo,
    buildingGeos,
    archMetalGeo,
    archLampGeo,
  };
}

/* ------------------------------------------------------------------ */
/* Obstacle factories                                                  */
/* ------------------------------------------------------------------ */

type ObstacleType = 'low' | 'train' | 'overhead';

interface Obstacle {
  group: THREE.Group;
  type: ObstacleType;
  active: boolean;
  /** Half extents + vertical span, in world units. */
  w: number;
  h: number;
  d: number;
  y0: number;
  y1: number;
  counted: boolean;
}

function makeLowBarrier(hazardTex: THREE.CanvasTexture): THREE.Group {
  const g = new THREE.Group();
  const barMat = new THREE.MeshStandardMaterial({
    map: hazardTex,
    roughness: 0.6,
    metalness: 0.1,
  });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.62, 0.5), barMat);
  bar.position.y = 0.64;
  g.add(bar);
  const legMat = new THREE.MeshStandardMaterial({ color: 0x3f3f46 });
  for (const dx of [-1.05, 1.05]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.95, 0.4), legMat);
    leg.position.set(dx, 0.475, 0);
    g.add(leg);
  }
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.1, 0.54),
    new THREE.MeshStandardMaterial({
      color: 0xdb2777,
      emissive: 0xdb2777,
      emissiveIntensity: 0.7,
    }),
  );
  stripe.position.y = 0.98;
  g.add(stripe);
  return g;
}

function makeTrain(color: number): THREE.Group {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.35,
    metalness: 0.45,
  });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.8, 2.3, 4.2), bodyMat);
  body.position.y = 1.35;
  g.add(body);
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.28, 4.0),
    new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.5 }),
  );
  roof.position.y = 2.62;
  g.add(roof);
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0e7490,
    emissive: 0x155e75,
    emissiveIntensity: 0.9,
    roughness: 0.15,
    metalness: 0.6,
  });
  for (const side of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 3.6), glassMat);
    strip.position.set(side * 1.42, 1.75, 0);
    g.add(strip);
  }
  const front = new THREE.Mesh(
    new THREE.BoxGeometry(2.4, 0.9, 0.12),
    new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: 0xfacc15,
      emissiveIntensity: 0.4,
    }),
  );
  front.position.set(0, 1.9, 2.12);
  g.add(front);
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(2.7, 0.4, 4.1),
    new THREE.MeshStandardMaterial({ color: 0x18181b }),
  );
  skirt.position.y = 0.2;
  g.add(skirt);
  return g;
}

function makeOverhead(): THREE.Group {
  const g = new THREE.Group();
  const postMat = new THREE.MeshStandardMaterial({ color: 0x52525b });
  for (const dx of [-1.32, 1.32]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.7, 0.16), postMat);
    post.position.set(dx, 0.85, 0);
    g.add(post);
  }
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.55, 0.7),
    new THREE.MeshStandardMaterial({
      color: 0xdb2777,
      emissive: 0xdb2777,
      emissiveIntensity: 0.45,
      roughness: 0.4,
    }),
  );
  bar.position.y = 1.32;
  g.add(bar);
  const warn = new THREE.Mesh(
    new THREE.BoxGeometry(2.8, 0.08, 0.74),
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xfacc15,
      emissiveIntensity: 0.9,
    }),
  );
  warn.position.y = 1.02;
  g.add(warn);
  return g;
}

/* ------------------------------------------------------------------ */
/* Player character (primitives only)                                 */
/* ------------------------------------------------------------------ */

interface PlayerRig {
  root: THREE.Group;
  inner: THREE.Group;
  torso: THREE.Mesh;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shadow: THREE.Mesh;
}

function makePlayer(): PlayerRig {
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);

  const cyan = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x06b6d4,
    emissiveIntensity: 0.25,
    roughness: 0.5,
  });
  const pink = new THREE.MeshStandardMaterial({
    color: 0xdb2777,
    emissive: 0xdb2777,
    emissiveIntensity: 0.3,
    roughness: 0.5,
  });
  const yellow = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    emissive: 0xfacc15,
    emissiveIntensity: 0.25,
    roughness: 0.5,
  });
  const dark = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.6 });
  const skin = new THREE.MeshStandardMaterial({
    color: 0xffd9b3,
    roughness: 0.6,
  });

  // Torso
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.05, 0.55), cyan);
  torso.position.y = 1.32;
  inner.add(torso);
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.97, 0.22, 0.57), pink);
  chest.position.y = 1.52;
  inner.add(chest);
  // Backpack
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.26), pink);
  pack.position.set(0, 1.38, -0.4);
  inner.add(pack);

  // Head + cap
  const head = new THREE.Group();
  head.position.y = 2.02;
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.56, 0.52), skin);
  head.add(face);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.2, 0.56), pink);
  cap.position.y = 0.32;
  head.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.07, 0.3), pink);
  brim.position.set(0, 0.24, 0.38);
  head.add(brim);
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
  for (const dx of [-0.13, 0.13]) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.04), eyeMat);
    eye.position.set(dx, 0.04, 0.27);
    head.add(eye);
  }
  inner.add(head);

  // Arms (pivot at shoulder)
  const mkArm = (side: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.6, 1.74, 0);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.78, 0.22), cyan);
    arm.position.y = -0.39;
    pivot.add(arm);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), skin);
    hand.position.y = -0.84;
    pivot.add(hand);
    pivot.rotation.z = side * 0.12;
    inner.add(pivot);
    return pivot;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  // Legs (pivot at hip) + shoes
  const mkLeg = (side: number): THREE.Group => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.24, 0.82, 0);
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.74, 0.27), dark);
    leg.position.y = -0.37;
    pivot.add(leg);
    const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.18, 0.52), yellow);
    shoe.position.set(0, -0.74, 0.08);
    pivot.add(shoe);
    inner.add(pivot);
    return pivot;
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  // Fake blob shadow (no shadow maps, keeps 60fps)
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 20),
    new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.02;

  return { root, inner, torso, head, armL, armR, legL, legR, shadow };
}

/* ------------------------------------------------------------------ */
/* Particle pools (pre-allocated, no per-frame allocation)             */
/* ------------------------------------------------------------------ */

interface Puff {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  vx: number;
  vy: number;
  vz: number;
  active: boolean;
}

function makePuffPool(
  scene: THREE.Scene,
  count: number,
  color: number,
  radius: number,
  additive: boolean,
): Puff[] {
  const geo = new THREE.CircleGeometry(radius, 8);
  const pool: Puff[] = [];
  for (let i = 0; i < count; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    mesh.rotation.x = -Math.PI / 2;
    scene.add(mesh);
    pool.push({ mesh, mat, life: 0, maxLife: 1, vx: 0, vy: 0, vz: 0, active: false });
  }
  return pool;
}

function spawnPuff(
  pool: Puff[],
  x: number,
  y: number,
  z: number,
  vx: number,
  vy: number,
  vz: number,
  life: number,
): void {
  for (const p of pool) {
    if (p.active) continue;
    p.active = true;
    p.life = life;
    p.maxLife = life;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.mesh.position.set(x, y, z);
    p.mesh.visible = true;
    return;
  }
}

function updatePuffs(pool: Puff[], dt: number, grow: number, rise: number): void {
  for (const p of pool) {
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.active = false;
      p.mesh.visible = false;
      p.mat.opacity = 0;
      continue;
    }
    p.vy += rise * dt;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    const t = p.life / p.maxLife;
    p.mat.opacity = 0.5 * t;
    const s = 1 + (1 - t) * grow;
    p.mesh.scale.set(s, s, s);
  }
}

/* ------------------------------------------------------------------ */
/* Engine state                                                        */
/* ------------------------------------------------------------------ */

interface CoinItem {
  active: boolean;
  x: number;
  y: number;
  z: number;
  spin: number;
}

interface PowerUpItem {
  group: THREE.Group;
  type: PowerUpType;
  active: boolean;
}

interface Engine {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  sfx: Sfx;
  player: PlayerRig;
  segments: THREE.Group[];
  obstacles: Obstacle[];
  coins: CoinItem[];
  coinMesh: THREE.InstancedMesh;
  powerUps: PowerUpItem[];
  dust: Puff[];
  sparkles: Puff[];
  speedLines: THREE.LineSegments;
  speedLinePos: Float32Array;
  flashMat: THREE.MeshBasicMaterial;
  lane: number;
  targetX: number;
  y: number;
  vy: number;
  grounded: boolean;
  slideTimer: number;
  runPhase: number;
  speed: number;
  distance: number;
  score: number;
  coinsCollected: number;
  combo: number;
  comboTimer: number;
  bestCombo: number;
  score2xTimer: number;
  magnetTimer: number;
  nextSpawnAt: number;
  nextPowerAt: number;
  nextPowerType: PowerUpType;
  paused: boolean;
  dying: boolean;
  dyingT: number;
  over: boolean;
  shake: number;
  flash: number;
  fov: number;
  hudTimer: number;
  dustTimer: number;
  lean: number;
  jumpBlend: number;
  slideBlend: number;
  landSquash: number;
}

const GameCanvas: React.FC<GameCanvasProps> = ({
  onGameOver,
  onHud,
  onRequestPause,
  paused,
  controlsRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const propsRef = useRef({ onGameOver, onHud, onRequestPause });
  propsRef.current = { onGameOver, onHud, onRequestPause };

  // Keep the engine's paused flag in sync with the App.
  useEffect(() => {
    if (engineRef.current) engineRef.current.paused = paused;
  }, [paused]);

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;
    const sfx = new Sfx();

    /* ---------------- scene / camera / renderer ---------------- */
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x160a2e);
    scene.fog = new THREE.Fog(0x1b0f2e, 35, 150);

    const camera = new THREE.PerspectiveCamera(
      62,
      container.clientWidth / Math.max(1, container.clientHeight),
      0.1,
      500,
    );
    camera.position.set(0, 4.7, 8.8);
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const updateSize = (): void => {
      const w = container.clientWidth;
      const h = Math.max(1, container.clientHeight);
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(container);

    /* ---------------- lights ---------------- */
    scene.add(new THREE.HemisphereLight(0x8a7bd8, 0x1a1210, 0.85));
    const sun = new THREE.DirectionalLight(0xffe7c4, 1.6);
    sun.position.set(6, 14, 6);
    scene.add(sun);
    const cyanGlow = new THREE.PointLight(0x06b6d4, 40, 34, 2);
    cyanGlow.position.set(0, 5, -8);
    scene.add(cyanGlow);
    const pinkGlow = new THREE.PointLight(0xdb2777, 26, 40, 2);
    pinkGlow.position.set(-9, 4, -42);
    scene.add(pinkGlow);

    /* ---------------- sky + distant skyline ---------------- */
    const sky = new THREE.Mesh(
      new THREE.PlaneGeometry(620, 260),
      new THREE.MeshBasicMaterial({ map: makeSkyTexture(), fog: false }),
    );
    sky.position.set(0, 75, -205);
    scene.add(sky);

    const skylineGeos: THREE.BufferGeometry[] = [];
    let sx = -130;
    while (sx < 130) {
      const bw = rand(8, 22);
      const bh = rand(10, 55);
      const b = new THREE.BoxGeometry(bw, bh, 6);
      b.translate(sx + bw / 2, bh / 2 - 2, -172);
      skylineGeos.push(b);
      sx += bw + rand(1, 6);
    }
    const skyline = new THREE.Mesh(
      mergeGeometries(skylineGeos, false) as THREE.BufferGeometry,
      new THREE.MeshBasicMaterial({ color: 0x12081f }),
    );
    scene.add(skyline);

    /* ---------------- track segments ---------------- */
    const parts = buildSegmentParts();
    const asphaltTex = makeAsphaltTexture();
    const groundMat = new THREE.MeshStandardMaterial({
      map: asphaltTex,
      roughness: 0.95,
    });
    const sleeperMat = new THREE.MeshStandardMaterial({
      color: 0x2e2620,
      roughness: 0.9,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: 0x9aa3b2,
      metalness: 0.85,
      roughness: 0.35,
    });
    const platformMat = new THREE.MeshStandardMaterial({
      color: 0x232028,
      roughness: 0.9,
    });
    const stripMat = new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      emissive: 0xfacc15,
      emissiveIntensity: 0.55,
    });
    const buildingMat = new THREE.MeshBasicMaterial({
      map: makeWindowsTexture(),
    });
    const archMat = new THREE.MeshStandardMaterial({
      color: 0x1c1a26,
      roughness: 0.5,
      metalness: 0.6,
    });
    const lampMat = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x06b6d4,
      emissiveIntensity: 1.6,
    });

    const segments: THREE.Group[] = [];
    for (let i = 0; i < SEG_COUNT; i++) {
      const seg = new THREE.Group();
      const ground = new THREE.Mesh(parts.groundGeo, groundMat);
      ground.rotation.x = -Math.PI / 2;
      seg.add(ground);
      seg.add(new THREE.Mesh(parts.sleeperGeo, sleeperMat));
      seg.add(new THREE.Mesh(parts.railGeo, railMat));
      seg.add(new THREE.Mesh(parts.platformGeo, platformMat));
      seg.add(new THREE.Mesh(parts.stripGeo, stripMat));
      seg.add(new THREE.Mesh(parts.buildingGeos[i % 4], buildingMat));
      if (i % 3 === 0) {
        seg.add(new THREE.Mesh(parts.archMetalGeo, archMat));
        seg.add(new THREE.Mesh(parts.archLampGeo, lampMat));
      }
      seg.position.z = 10 - i * SEG_LEN;
      scene.add(seg);
      segments.push(seg);
    }

    /* ---------------- player ---------------- */
    const player = makePlayer();
    scene.add(player.root);
    scene.add(player.shadow);

    /* ---------------- obstacle pools ---------------- */
    const hazardTex = makeHazardTexture();
    const obstacles: Obstacle[] = [];
    const trainColors = [0xdb2777, 0x06b6d4, 0xfacc15, 0x7c3aed];
    const addPool = (
      type: ObstacleType,
      count: number,
      make: () => THREE.Group,
      dims: { w: number; h: number; d: number; y0: number; y1: number },
    ): void => {
      for (let i = 0; i < count; i++) {
        const group = make();
        group.visible = false;
        scene.add(group);
        obstacles.push({ group, type, active: false, counted: false, ...dims });
      }
    };
    addPool('low', 10, () => makeLowBarrier(hazardTex), {
      w: 2.6, h: 0.95, d: 0.8, y0: 0, y1: 0.95,
    });
    trainColors.forEach((c) =>
      addPool('train', 2, () => makeTrain(c), {
        w: 2.8, h: 2.7, d: 4.2, y0: 0, y1: 2.7,
      }),
    );
    addPool('overhead', 6, () => makeOverhead(), {
      w: 2.8, h: 0.55, d: 0.7, y0: 1.05, y1: 1.6,
    });

    /* ---------------- coins (single InstancedMesh) ---------------- */
    const coinGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.12, 20);
    coinGeo.rotateX(Math.PI / 2);
    const coinMat = new THREE.MeshStandardMaterial({
      color: 0xffc93c,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0x664400,
      emissiveIntensity: 0.5,
    });
    const coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, COIN_POOL);
    coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    coinMesh.frustumCulled = false;
    scene.add(coinMesh);
    const coins: CoinItem[] = Array.from({ length: COIN_POOL }, () => ({
      active: false,
      x: 0,
      y: 0,
      z: 0,
      spin: 0,
    }));
    const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < COIN_POOL; i++) coinMesh.setMatrixAt(i, zeroMatrix);
    coinMesh.instanceMatrix.needsUpdate = true;

    /* ---------------- power-ups ---------------- */
    const powerUps: PowerUpItem[] = [];
    const mk2x = (): THREE.Group => {
      const g = new THREE.Group();
      const star = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.62),
        new THREE.MeshStandardMaterial({
          color: 0xdb2777,
          emissive: 0xdb2777,
          emissiveIntensity: 0.9,
          roughness: 0.3,
        }),
      );
      g.add(star);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.95, 0.06, 8, 32),
        new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xfacc15,
          emissiveIntensity: 1.2,
        }),
      );
      g.add(ring);
      return g;
    };
    const mkMagnet = (): THREE.Group => {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.55, 0.2, 12, 28),
        new THREE.MeshStandardMaterial({
          color: 0x06b6d4,
          emissive: 0x06b6d4,
          emissiveIntensity: 1.0,
          roughness: 0.3,
        }),
      );
      g.add(ring);
      const core = new THREE.Mesh(
        new THREE.SphereGeometry(0.28, 16, 12),
        new THREE.MeshStandardMaterial({
          color: 0xfacc15,
          emissive: 0xfacc15,
          emissiveIntensity: 1.0,
        }),
      );
      g.add(core);
      return g;
    };
    for (const [type, make] of [
      ['score2x', mk2x],
      ['magnet', mkMagnet],
    ] as [PowerUpType, () => THREE.Group][]) {
      const group = make();
      group.visible = false;
      scene.add(group);
      powerUps.push({ group, type, active: false });
    }

    /* ---------------- particles ---------------- */
    const dust = makePuffPool(scene, 16, 0xb8a88f, 0.17, false);
    const sparkles = makePuffPool(scene, 10, 0xffd94d, 0.1, true);
    // Sparkles stand upright facing the camera; dust lies flat on the ground.
    for (const p of sparkles) p.mesh.rotation.set(0, 0, 0);

    // Speed lines
    const LINE_COUNT = 46;
    const speedLinePos = new Float32Array(LINE_COUNT * 6);
    const resetLine = (i: number, zMin: number): void => {
      const x = rand(-15, 15);
      const y = rand(0.4, 10);
      const z = rand(zMin, 4);
      speedLinePos[i * 6] = x;
      speedLinePos[i * 6 + 1] = y;
      speedLinePos[i * 6 + 2] = z;
      speedLinePos[i * 6 + 3] = x;
      speedLinePos[i * 6 + 4] = y;
      speedLinePos[i * 6 + 5] = z + rand(1.5, 3.5);
    };
    for (let i = 0; i < LINE_COUNT; i++) resetLine(i, -70);
    const speedLineGeo = new THREE.BufferGeometry();
    speedLineGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(speedLinePos, 3),
    );
    const speedLines = new THREE.LineSegments(
      speedLineGeo,
      new THREE.LineBasicMaterial({
        color: 0x9fd8ff,
        transparent: true,
        opacity: 0.26,
      }),
    );
    speedLines.frustumCulled = false;
    scene.add(speedLines);

    /* ---------------- crash flash (camera-attached quad) ---------------- */
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xdc2626,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    const flash = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), flashMat);
    flash.position.set(0, 0, -0.6);
    flash.renderOrder = 999;
    camera.add(flash);

    /* ---------------- engine state ---------------- */
    const engine: Engine = {
      scene,
      camera,
      renderer,
      sfx,
      player,
      segments,
      obstacles,
      coins,
      coinMesh,
      powerUps,
      dust,
      sparkles,
      speedLines,
      speedLinePos,
      flashMat,
      lane: 0,
      targetX: 0,
      y: 0,
      vy: 0,
      grounded: true,
      slideTimer: 0,
      runPhase: 0,
      speed: INITIAL_SPEED,
      distance: 0,
      score: 0,
      coinsCollected: 0,
      combo: 0,
      comboTimer: 0,
      bestCombo: 0,
      score2xTimer: 0,
      magnetTimer: 0,
      nextSpawnAt: 32,
      nextPowerAt: rand(320, 480),
      nextPowerType: 'score2x',
      paused,
      dying: false,
      dyingT: 0,
      over: false,
      shake: 0,
      flash: 0,
      fov: 62,
      hudTimer: 0,
      dustTimer: 0,
      lean: 0,
      jumpBlend: 0,
      slideBlend: 0,
      landSquash: 0,
    };
    engineRef.current = engine;

    /* ---------------- helpers (closures over engine) ---------------- */
    const dummy = new THREE.Object3D();

    const currentMultiplier = (): number => {
      const comboMult = Math.min(5, 1 + Math.floor(engine.combo / 8));
      return comboMult * (engine.score2xTimer > 0 ? 2 : 1);
    };

    const activePowerUps = (): ActivePowerUp[] => {
      const list: ActivePowerUp[] = [];
      if (engine.score2xTimer > 0)
        list.push({
          type: 'score2x',
          timeLeft: engine.score2xTimer,
          duration: POWERUP_DURATION,
        });
      if (engine.magnetTimer > 0)
        list.push({
          type: 'magnet',
          timeLeft: engine.magnetTimer,
          duration: POWERUP_DURATION,
        });
      return list;
    };

    const pushHud = (): void => {
      propsRef.current.onHud({
        score: Math.floor(engine.score),
        coins: engine.coinsCollected,
        distance: Math.floor(engine.distance),
        speed: engine.speed,
        multiplier: currentMultiplier(),
        combo: engine.combo,
        bestCombo: engine.bestCombo,
        powerUps: activePowerUps(),
        paused: engine.paused,
        muted: sfx.muted,
      });
    };

    const getObstacle = (type: ObstacleType): Obstacle | null => {
      for (const o of engine.obstacles) {
        if (o.type === type && !o.active) return o;
      }
      return null;
    };

    const placeObstacle = (
      type: ObstacleType,
      lane: number,
      z: number,
    ): void => {
      const o = getObstacle(type);
      if (!o) return;
      o.active = true;
      o.counted = false;
      o.group.visible = true;
      o.group.position.set(lane * LANE_WIDTH, 0, z);
    };

    const spawnCoin = (x: number, y: number, z: number): void => {
      for (const c of engine.coins) {
        if (c.active) continue;
        c.active = true;
        c.x = x;
        c.y = y;
        c.z = z;
        c.spin = Math.random() * Math.PI * 2;
        return;
      }
    };

    const coinLine = (lane: number, z: number, n = 6): void => {
      for (let i = 0; i < n; i++) {
        spawnCoin(lane * LANE_WIDTH, 1.0, z - i * 2);
      }
    };

    const coinArc = (lane: number, z: number): void => {
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        spawnCoin(
          lane * LANE_WIDTH,
          0.9 + Math.sin(t * Math.PI) * 1.15,
          z + 2 - i * 1.1,
        );
      }
    };

    const shuffledLanes = (): number[] => {
      const lanes = [-1, 0, 1];
      for (let i = lanes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [lanes[i], lanes[j]] = [lanes[j], lanes[i]];
      }
      return lanes;
    };

    /** Spawn one fair row: at most two lanes hold obstacles, and the
     *  remaining lane is always free — never a wall across all 3. */
    const spawnRow = (): void => {
      const diff = clamp(engine.distance / 2600, 0, 1);
      const z = SPAWN_Z;
      const L = shuffledLanes();
      const roll = Math.random();
      if (roll < 0.2) {
        coinLine(L[0], z, 7);
        return;
      }
      const r = Math.random();
      if (r < 0.2) {
        // Single low barrier + arc over it
        placeObstacle('low', L[0], z);
        coinArc(L[0], z);
        coinLine(L[2], z - 4, 5);
      } else if (r < 0.34) {
        // Two low barriers, staggered so the player can hop both
        placeObstacle('low', L[0], z);
        placeObstacle('low', L[1], z - 8);
        coinArc(L[0], z);
      } else if (r < 0.48) {
        // One train, coins in a free lane
        placeObstacle('train', L[0], z);
        coinLine(L[1], z - 2, 6);
      } else if (r < 0.62) {
        // Train + low barrier, one lane free
        placeObstacle('train', L[0], z);
        placeObstacle('low', L[1], z - 6);
        coinLine(L[2], z - 2, 5);
      } else if (r < 0.74) {
        // Train + overhead bar, one lane free
        placeObstacle('train', L[0], z);
        placeObstacle('overhead', L[1], z - 4);
      } else if (r < 0.84 && diff > 0.25) {
        // Two trains (harder), one lane free
        placeObstacle('train', L[0], z);
        placeObstacle('train', L[1], z - 9);
        coinLine(L[2], z - 2, 6);
      } else if (r < 0.92) {
        // Overhead bar only, coins elsewhere
        placeObstacle('overhead', L[0], z);
        coinLine(L[1], z - 2, 6);
      } else {
        // Low + overhead, one lane free
        placeObstacle('low', L[0], z);
        placeObstacle('overhead', L[1], z - 5);
        coinLine(L[2], z - 2, 5);
      }
    };

    const spawnPowerUp = (): void => {
      const type = engine.nextPowerType;
      engine.nextPowerType =
        type === 'score2x' ? 'magnet' : 'score2x';
      const item = engine.powerUps.find((p) => p.type === type);
      if (!item || item.active) return;
      item.active = true;
      item.group.visible = true;
      item.group.position.set(
        (Math.floor(Math.random() * 3) - 1) * LANE_WIDTH,
        1.3,
        SPAWN_Z,
      );
    };

    const collectCoin = (c: CoinItem): void => {
      c.active = false;
      engine.coinsCollected += 1;
      engine.combo += 1;
      engine.comboTimer = COMBO_WINDOW;
      if (engine.combo > engine.bestCombo) engine.bestCombo = engine.combo;
      engine.score += 10 * currentMultiplier();
      sfx.coin();
      for (let i = 0; i < 5; i++) {
        spawnPuff(
          engine.sparkles,
          c.x,
          c.y,
          c.z,
          rand(-2.4, 2.4),
          rand(0.5, 3.2),
          rand(-1, 1),
          rand(0.3, 0.5),
        );
      }
      pushHud();
    };

    const nearMiss = (): void => {
      engine.combo += 2;
      engine.comboTimer = COMBO_WINDOW;
      if (engine.combo > engine.bestCombo) engine.bestCombo = engine.combo;
      engine.score += 25 * currentMultiplier();
      sfx.nearMiss();
      pushHud();
    };

    const crash = (): void => {
      if (engine.dying || engine.over) return;
      engine.dying = true;
      engine.dyingT = 0;
      engine.shake = 1;
      engine.flash = 0.6;
      sfx.crash();
    };

    const finishGameOver = (): void => {
      engine.over = true;
      propsRef.current.onGameOver({
        score: Math.floor(engine.score),
        distance: Math.floor(engine.distance),
        coins: engine.coinsCollected,
        bestCombo: engine.bestCombo,
        newBest: false,
      });
    };

    /* ---------------- player actions ---------------- */
    const doMove = (dir: -1 | 1): void => {
      if (engine.paused || engine.dying || engine.over) return;
      sfx.unlock();
      const next = clamp(engine.lane + dir, -1, 1);
      if (next === engine.lane) return;
      engine.lane = next;
      engine.targetX = next * LANE_WIDTH;
    };

    const doJump = (): void => {
      if (engine.paused || engine.dying || engine.over) return;
      sfx.unlock();
      if (!engine.grounded) return;
      engine.grounded = false;
      engine.vy = JUMP_VELOCITY;
      engine.slideTimer = 0;
      sfx.jump();
    };

    const doSlide = (): void => {
      if (engine.paused || engine.dying || engine.over) return;
      sfx.unlock();
      if (!engine.grounded) {
        // Slam down fast, then slide on landing.
        engine.vy = Math.min(engine.vy, -20);
        engine.slideTimer = SLIDE_DURATION;
        return;
      }
      engine.slideTimer = SLIDE_DURATION;
    };

    /* ---------------- per-frame update ---------------- */
    const update = (dt: number): void => {
      const moveStep = engine.speed * dt;
      engine.distance += moveStep;

      // Difficulty ramp
      const diff = clamp(engine.distance / 2600, 0, 1);
      engine.speed = Math.min(
        MAX_SPEED,
        INITIAL_SPEED + engine.distance * 0.0115,
      );
      engine.score += engine.speed * dt * currentMultiplier();

      // Combo decay
      if (engine.combo > 0) {
        engine.comboTimer -= dt;
        if (engine.comboTimer <= 0) engine.combo = 0;
      }
      if (engine.score2xTimer > 0) engine.score2xTimer -= dt;
      if (engine.magnetTimer > 0) engine.magnetTimer -= dt;

      // Spawning
      if (engine.distance >= engine.nextSpawnAt) {
        spawnRow();
        engine.nextSpawnAt =
          engine.distance + (34 - diff * 12) + Math.random() * 5;
      }
      if (engine.distance >= engine.nextPowerAt) {
        spawnPowerUp();
        engine.nextPowerAt = engine.distance + rand(380, 620);
      }

      // Lane movement + lean
      const prevX = engine.player.root.position.x;
      engine.player.root.position.x +=
        (engine.targetX - engine.player.root.position.x) *
        Math.min(1, dt * 11);
      const lateralVel = (engine.player.root.position.x - prevX) / Math.max(dt, 0.001);
      engine.lean = lerp(engine.lean, clamp(-lateralVel * 0.045, -0.4, 0.4), Math.min(1, dt * 10));

      // Jump physics
      if (!engine.grounded) {
        engine.vy -= GRAVITY * dt;
        engine.y += engine.vy * dt;
        if (engine.y <= 0) {
          engine.y = 0;
          engine.vy = 0;
          engine.grounded = true;
          engine.landSquash = 1;
          sfx.land();
          for (let i = 0; i < 6; i++) {
            spawnPuff(
              engine.dust,
              engine.player.root.position.x + rand(-0.4, 0.4),
              0.12,
              rand(-0.3, 0.3),
              rand(-1.5, 1.5),
              rand(0.4, 1.4),
              rand(-0.5, 1.5),
              rand(0.35, 0.6),
            );
          }
        }
      }
      if (engine.slideTimer > 0) engine.slideTimer -= dt;

      // Run cycle + pose blending
      engine.runPhase += dt * (7 + engine.speed * 0.5);
      const airborne = engine.grounded ? 0 : 1;
      engine.jumpBlend = lerp(engine.jumpBlend, airborne, Math.min(1, dt * 12));
      const sliding = engine.slideTimer > 0 ? 1 : 0;
      engine.slideBlend = lerp(engine.slideBlend, sliding, Math.min(1, dt * 14));
      engine.landSquash = Math.max(0, engine.landSquash - dt * 5);

      const s = Math.sin(engine.runPhase);
      const legSwing = s * 1.0;
      const armSwing = -s * 0.85;
      const jb = engine.jumpBlend;
      const sb = engine.slideBlend;
      // Legs: run swing -> jump tuck -> slide forward
      engine.player.legL.rotation.x = lerp(
        lerp(legSwing, -1.5, jb),
        -1.25,
        sb,
      );
      engine.player.legR.rotation.x = lerp(
        lerp(-legSwing, -0.55, jb),
        -0.9,
        sb,
      );
      // Arms: run swing -> raised while airborne -> tucked while sliding
      engine.player.armL.rotation.x = lerp(
        lerp(armSwing, -2.5, jb),
        -0.4,
        sb,
      );
      engine.player.armR.rotation.x = lerp(
        lerp(-armSwing, -2.5, jb),
        -0.4,
        sb,
      );
      // Inner group: bob, forward lean, slide lean-back, landing squash
      const bob = engine.grounded ? Math.abs(Math.cos(engine.runPhase)) * 0.07 : 0;
      engine.player.inner.position.y = bob;
      engine.player.inner.rotation.x = lerp(
        0.1 + diff * 0.08,
        -1.05,
        sb,
      );
      const squash = 1 - engine.landSquash * 0.12;
      engine.player.inner.scale.set(1 / Math.sqrt(squash), squash, 1);
      engine.player.root.position.y = engine.y;
      engine.player.root.rotation.z = engine.lean;
      engine.player.head.rotation.x = lerp(-0.08, 0.25, jb);

      // Blob shadow follows x, shrinks/fades with jump height
      const sh = engine.player.shadow;
      sh.position.x = engine.player.root.position.x;
      const shScale = Math.max(0.35, 1 - engine.y * 0.22);
      sh.scale.set(shScale, shScale, shScale);
      (sh.material as THREE.MeshBasicMaterial).opacity = 0.35 * shScale;

      // Running dust
      engine.dustTimer -= dt;
      if (engine.grounded && engine.dustTimer <= 0) {
        engine.dustTimer = engine.slideTimer > 0 ? 0.06 : 0.13;
        spawnPuff(
          engine.dust,
          engine.player.root.position.x + rand(-0.25, 0.25),
          0.1,
          rand(0.2, 0.6),
          rand(-0.6, 0.6),
          rand(0.4, 1.1),
          rand(0.5, 1.6),
          rand(0.4, 0.7),
        );
      }

      // Track recycling
      for (const seg of engine.segments) {
        seg.position.z += moveStep;
        if (seg.position.z > 30) seg.position.z -= SEG_LEN * SEG_COUNT;
      }

      // Obstacles: move, collide, near-miss, despawn
      const pTop = engine.y + (engine.slideTimer > 0 ? PLAYER_SLIDE_HEIGHT : PLAYER_HEIGHT);
      const pBottom = engine.y;
      for (const o of engine.obstacles) {
        if (!o.active) continue;
        const prevZ = o.group.position.z;
        o.group.position.z += moveStep;
        const oz = o.group.position.z;
        const dz = oz;
        const dx = o.group.position.x - engine.player.root.position.x;
        if (Math.abs(dz) < o.d / 2 + PLAYER_HALF_D) {
          if (
            Math.abs(dx) < o.w / 2 + PLAYER_HALF_W &&
            pBottom < o.y1 &&
            pTop > o.y0
          ) {
            crash();
            return;
          }
        }
        // Near-miss: passed in the next lane over, close by
        if (!o.counted && prevZ < 1.5 && oz >= 1.5) {
          o.counted = true;
          const lateral = Math.abs(dx);
          if (lateral > o.w / 2 + PLAYER_HALF_W && lateral < 4.6) nearMiss();
        }
        if (oz > DESPAWN_Z) {
          o.active = false;
          o.group.visible = false;
        }
      }

      // Coins: move, magnet, spin, collect, despawn
      const magnetOn = engine.magnetTimer > 0;
      for (let i = 0; i < engine.coins.length; i++) {
        const c = engine.coins[i];
        if (!c.active) continue;
        c.z += moveStep;
        c.spin += dt * 4;
        if (magnetOn) {
          const dxm = engine.player.root.position.x - c.x;
          const dym = engine.y + 1.0 - c.y;
          if (Math.abs(c.z) < 8 && Math.abs(dxm) < 4) {
            c.x += dxm * Math.min(1, dt * 7);
            c.y += dym * Math.min(1, dt * 7);
          }
        }
        const collectR = magnetOn ? 2.0 : 1.1;
        if (
          Math.abs(c.z) < collectR &&
          Math.abs(c.x - engine.player.root.position.x) < collectR &&
          Math.abs(c.y - (engine.y + 1.0)) < 1.3
        ) {
          collectCoin(c);
          dummy.position.set(0, 0, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          coinMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        if (c.z > DESPAWN_Z) {
          c.active = false;
          dummy.position.set(0, 0, 0);
          dummy.scale.set(0, 0, 0);
          dummy.updateMatrix();
          coinMesh.setMatrixAt(i, dummy.matrix);
          continue;
        }
        dummy.position.set(c.x, c.y, c.z);
        dummy.rotation.set(0, c.spin, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        coinMesh.setMatrixAt(i, dummy.matrix);
      }
      coinMesh.instanceMatrix.needsUpdate = true;

      // Power-ups: move, bob, collect, despawn
      for (const p of engine.powerUps) {
        if (!p.active) continue;
        p.group.position.z += moveStep;
        p.group.position.y = 1.3 + Math.sin(engine.distance * 0.15) * 0.15;
        p.group.rotation.y += dt * 2.2;
        const pz = p.group.position.z;
        if (
          Math.abs(pz) < 1.2 &&
          Math.abs(p.group.position.x - engine.player.root.position.x) < 1.1 &&
          Math.abs(p.group.position.y - (engine.y + 1.1)) < 1.3
        ) {
          p.active = false;
          p.group.visible = false;
          if (p.type === 'score2x') engine.score2xTimer = POWERUP_DURATION;
          else engine.magnetTimer = POWERUP_DURATION;
          sfx.powerup();
          pushHud();
        } else if (pz > DESPAWN_Z) {
          p.active = false;
          p.group.visible = false;
        }
      }

      // Particles
      updatePuffs(engine.dust, dt, 1.4, 0.6);
      updatePuffs(engine.sparkles, dt, 0.4, -2.5);

      // Speed lines
      const pos = engine.speedLinePos;
      const lineSpeed = engine.speed * dt * 1.9;
      for (let i = 0; i < LINE_COUNT; i++) {
        pos[i * 6 + 2] += lineSpeed;
        pos[i * 6 + 5] += lineSpeed;
        if (pos[i * 6 + 2] > 9) resetLine(i, -70);
      }
      speedLineGeo.attributes.position.needsUpdate = true;

      // Camera: follow, FOV widens with speed, roll with lean, shake
      const speedNorm = (engine.speed - INITIAL_SPEED) / (MAX_SPEED - INITIAL_SPEED);
      const targetFov = 62 + speedNorm * 16;
      if (Math.abs(engine.fov - targetFov) > 0.05) {
        engine.fov = lerp(engine.fov, targetFov, Math.min(1, dt * 2));
        camera.fov = engine.fov;
        camera.updateProjectionMatrix();
      }
      const shakeAmp = engine.shake * 0.35;
      engine.shake = Math.max(0, engine.shake - dt * 1.8);
      camera.position.set(
        engine.player.root.position.x * 0.35 + (Math.random() - 0.5) * shakeAmp,
        4.7 + speedNorm * 0.5 + (Math.random() - 0.5) * shakeAmp,
        8.8,
      );
      camera.lookAt(
        engine.player.root.position.x * 0.55,
        1.3,
        -10,
      );
      camera.rotateZ(engine.lean * 0.5);
      if (engine.flash > 0) {
        engine.flash = Math.max(0, engine.flash - dt * 1.4);
        flashMat.opacity = engine.flash;
      }

      // HUD push (throttled)
      engine.hudTimer -= dt;
      if (engine.hudTimer <= 0) {
        engine.hudTimer = 0.1;
        pushHud();
      }
    };

    const updateDying = (dt: number): void => {
      engine.dyingT += dt;
      engine.speed = Math.max(0, engine.speed - dt * 55);
      engine.player.inner.rotation.x = lerp(
        engine.player.inner.rotation.x,
        -1.5,
        Math.min(1, dt * 6),
      );
      engine.player.root.position.y = Math.max(0, engine.y);
      engine.shake = Math.max(0, engine.shake - dt * 1.4);
      camera.position.x += (Math.random() - 0.5) * engine.shake * 0.4;
      camera.position.y += (Math.random() - 0.5) * engine.shake * 0.3;
      if (engine.flash > 0) {
        engine.flash = Math.max(0, engine.flash - dt * 1.2);
        flashMat.opacity = engine.flash;
      }
      updatePuffs(engine.dust, dt, 1.4, 0.6);
      if (engine.dyingT > 0.85) {
        engine.dying = false;
        finishGameOver();
      }
    };

    /* ---------------- main loop ---------------- */
    let raf = 0;
    let last = performance.now();
    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (engine.paused) {
        renderer.render(scene, camera);
        return;
      }
      if (engine.over) {
        renderer.render(scene, camera);
        return;
      }
      if (engine.dying) {
        updateDying(dt);
      } else {
        update(dt);
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(loop);
    pushHud();

    /* ---------------- input ---------------- */
    const onKeyDown = (e: KeyboardEvent): void => {
      if (engine.over) return;
      const k = e.key;
      if (
        k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' ||
        k === 'ArrowDown' || k === ' '
      ) {
        e.preventDefault();
      }
      if (k === 'p' || k === 'P' || k === 'Escape') {
        propsRef.current.onRequestPause();
        return;
      }
      if (engine.paused) return;
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') doMove(-1);
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') doMove(1);
      else if (k === 'ArrowUp' || k === 'w' || k === 'W' || k === ' ') doJump();
      else if (k === 'ArrowDown' || k === 's' || k === 'S') doSlide();
    };
    window.addEventListener('keydown', onKeyDown);

    let touchX = 0;
    let touchY = 0;
    let touchT = 0;
    const onTouchStart = (e: TouchEvent): void => {
      const t = e.changedTouches[0];
      touchX = t.clientX;
      touchY = t.clientY;
      touchT = performance.now();
      sfx.unlock();
    };
    const onTouchEnd = (e: TouchEvent): void => {
      const t = e.changedTouches[0];
      const dx = t.clientX - touchX;
      const dy = t.clientY - touchY;
      const dtMs = performance.now() - touchT;
      if (Math.abs(dx) < 24 && Math.abs(dy) < 24) {
        if (dtMs < 300) doJump(); // tap = jump
        return;
      }
      if (Math.abs(dx) > Math.abs(dy)) {
        doMove(dx > 0 ? 1 : -1);
      } else if (dy < 0) {
        doJump();
      } else {
        doSlide();
      }
    };
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchend', onTouchEnd, { passive: true });
    const onPointerDown = (): void => sfx.unlock();
    container.addEventListener('pointerdown', onPointerDown);

    const onVisibility = (): void => {
      if (document.hidden && !engine.paused && !engine.over && !engine.dying) {
        propsRef.current.onRequestPause();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    /* ---------------- expose controls ---------------- */
    controlsRef.current = {
      moveLeft: () => doMove(-1),
      moveRight: () => doMove(1),
      jump: () => doJump(),
      slide: () => doSlide(),
      togglePause: () => propsRef.current.onRequestPause(),
      toggleMute: () => {
        sfx.unlock();
        sfx.setMuted(!sfx.muted);
        pushHud();
      },
    };

    /* ---------------- cleanup ---------------- */
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown);
      container.removeEventListener('touchstart', onTouchStart);
      container.removeEventListener('touchend', onTouchEnd);
      container.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('visibilitychange', onVisibility);
      resizeObserver.disconnect();
      controlsRef.current = null;
      engineRef.current = null;
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
          obj.geometry?.dispose();
          const mat = obj.material as THREE.Material | THREE.Material[];
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
          else mat?.dispose();
        }
      });
      renderer.dispose();
      container.innerHTML = '';
    };
    // Mount once per run; App remounts via key for a fresh run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className="h-full w-full touch-none" id="game-container" />;
};

export default GameCanvas;
