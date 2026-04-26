/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { Lane, LANE_WIDTH, INITIAL_SPEED, MAX_SPEED, SPEED_INCREMENT } from '../types';

interface GameCanvasProps {
  onGameOver: (score: number) => void;
  onUpdateScore: (score: number) => void;
  isPaused: boolean;
}

const GameCanvas: React.FC<GameCanvasProps> = ({ onGameOver, onUpdateScore, isPaused }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const gameRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    player: THREE.Group;
    lanes: Lane;
    targetX: number;
    clock: THREE.Clock;
    speed: number;
    distance: number;
    score: number;
    trackSegments: THREE.Group[];
    obstacles: THREE.Mesh[];
    coins: THREE.Group[];
    lastObstaclePos: number;
    animationId: number;
    isJumping: boolean;
    jumpVelocity: number;
  } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // --- INITIALIZATION ---
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a); // Neural-950
    scene.fog = new THREE.Fog(0x0a0a0a, 20, 100);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 5, 10);
    camera.lookAt(0, 0, -10);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    
    const updateSize = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      renderer.setSize(clientWidth, clientHeight);
      camera.aspect = clientWidth / clientHeight;
      camera.updateProjectionMatrix();
    };

    updateSize();
    containerRef.current.appendChild(renderer.domElement);

    const resizeObserver = new ResizeObserver(updateSize);
    resizeObserver.observe(containerRef.current);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x00ffff, 1.2); // Cyan punch
    dirLight.position.set(5, 10, 5);
    scene.add(dirLight);

    const pointLight = new THREE.PointLight(0xff00ff, 1, 50); // Pink accent
    pointLight.position.set(-10, 5, -20);
    scene.add(pointLight);

    // Player
    const playerGroup = new THREE.Group();
    const bodyGeom = new THREE.BoxGeometry(1, 1.8, 0.8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x06b6d4, emissiveIntensity: 0.2 });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.9;
    playerGroup.add(body);

    const headGeom = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 2.1;
    playerGroup.add(head);

    scene.add(playerGroup);

    // Track state
    const trackSegments: THREE.Group[] = [];
    const obstacles: THREE.Mesh[] = [];
    const coins: THREE.Group[] = [];

    // Helper to create a track segment
    const createTrackSegment = (zPos: number) => {
      const segment = new THREE.Group();
      
      // Ground
      const groundGeom = new THREE.PlaneGeometry(LANE_WIDTH * 3 + 4, 20);
      const groundMat = new THREE.MeshStandardMaterial({ color: 0x171717 }); // Neutral-900
      const ground = new THREE.Mesh(groundGeom, groundMat);
      ground.rotation.x = -Math.PI / 2;
      segment.add(ground);

      // Lane markers
      for (let i = -1; i <= 1; i++) {
        const markerGeom = new THREE.PlaneGeometry(0.1, 20);
        const markerMat = new THREE.MeshStandardMaterial({ color: 0x262626 });
        const marker = new THREE.Mesh(markerGeom, markerMat);
        marker.rotation.x = -Math.PI / 2;
        marker.position.set(i * LANE_WIDTH, 0.01, 0);
        segment.add(marker);
      }

      // Yellow lines (Theme aesthetic)
      const lineGeom = new THREE.PlaneGeometry(0.05, 20);
      const lineMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0xfacc15, emissiveIntensity: 0.5 });
      const leftLine = new THREE.Mesh(lineGeom, lineMat);
      leftLine.rotation.x = -Math.PI / 2;
      leftLine.position.set(-LANE_WIDTH * 1.5, 0.02, 0);
      segment.add(leftLine);

      const rightLine = new THREE.Mesh(lineGeom, lineMat);
      rightLine.rotation.x = -Math.PI / 2;
      rightLine.position.set(LANE_WIDTH * 1.5, 0.02, 0);
      segment.add(rightLine);

      segment.position.z = zPos;
      scene.add(segment);
      return segment;
    };

    // Initial segments
    for (let i = 0; i < 10; i++) {
      trackSegments.push(createTrackSegment(-i * 20));
    }

    gameRef.current = {
      scene, camera, renderer,
      player: playerGroup,
      lanes: Lane.CENTER,
      targetX: 0,
      clock: new THREE.Clock(),
      speed: INITIAL_SPEED,
      distance: 0,
      score: 0,
      trackSegments,
      obstacles,
      coins,
      lastObstaclePos: -30,
      animationId: 0,
      isJumping: false,
      jumpVelocity: 0
    };

    // --- INPUT HANDLING ---
    const handleKeyDown = (e: KeyboardEvent) => {
      const g = gameRef.current;
      if (!g || isPaused) return;

      if (e.key === 'ArrowLeft' || e.key === 'a') {
        if (g.lanes > -1) {
          g.lanes--;
          g.targetX = g.lanes * LANE_WIDTH;
        }
      } else if (e.key === 'ArrowRight' || e.key === 'd') {
        if (g.lanes < 1) {
          g.lanes++;
          g.targetX = g.lanes * LANE_WIDTH;
        }
      } else if (e.key === 'ArrowUp' || e.key === ' ' || e.key === 'w') {
        if (!g.isJumping) {
          g.isJumping = true;
          g.jumpVelocity = 0.5;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    // --- GAME LOOP ---
    const spawnObstacle = (zPos: number) => {
      const g = gameRef.current;
      if (!g) return;

      const lane = Math.floor(Math.random() * 3) - 1;
      const type = Math.random();

      if (type > 0.3) {
        // High barrier or train
        const h = Math.random() > 0.5 ? 4 : 2;
        const geom = new THREE.BoxGeometry(LANE_WIDTH * 0.8, h, 2);
        const colors = [0xdb2777, 0xfacc15, 0x06b6d4]; // Pink, Yellow, Cyan
        const mat = new THREE.MeshStandardMaterial({ 
          color: colors[Math.floor(Math.random() * colors.length)],
          emissive: colors[Math.floor(Math.random() * colors.length)],
          emissiveIntensity: 0.2
        });
        const obstacle = new THREE.Mesh(geom, mat);
        obstacle.position.set(lane * LANE_WIDTH, h / 2, zPos);
        g.scene.add(obstacle);
        g.obstacles.push(obstacle);
      } else {
        // Coins
        for (let i = 0; i < 5; i++) {
          const coinGeom = new THREE.CylinderGeometry(0.4, 0.4, 0.1, 16);
          const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 });
          const coin = new THREE.Mesh(coinGeom, coinMat);
          coin.rotation.z = Math.PI / 2;
          const coinGroup = new THREE.Group();
          coinGroup.add(coin);
          coinGroup.position.set(lane * LANE_WIDTH, 1, zPos - (i * 2));
          g.scene.add(coinGroup);
          g.coins.push(coinGroup);
        }
      }
    };

    const update = () => {
      const g = gameRef.current;
      if (!g) return;

      if (!isPaused) {
        const delta = g.clock.getDelta();
        const moveStep = g.speed * delta;
        g.distance += moveStep;
        g.score = Math.floor(g.distance);
        onUpdateScore(g.score);

        // Speed up
        if (g.speed < MAX_SPEED) {
          g.speed += SPEED_INCREMENT;
        }

        // Horizontal movement - Smooth Lerp
        g.player.position.x += (g.targetX - g.player.position.x) * 0.15;

        // Jump physics
        if (g.isJumping) {
          g.player.position.y += g.jumpVelocity;
          g.jumpVelocity -= 0.03;
          if (g.player.position.y <= 0) {
            g.player.position.y = 0;
            g.isJumping = false;
            g.jumpVelocity = 0;
          }
        }

        // Track generation / recycling
        g.trackSegments.forEach(segment => {
          segment.position.z += moveStep;
          if (segment.position.z > 25) {
            segment.position.z -= 200; // Move back to end
          }
        });

        // Obstacle & Coin movement
        g.obstacles.forEach((obs, index) => {
          obs.position.z += moveStep;
          // Collision check
          const dist = g.player.position.distanceTo(obs.position);
          if (dist < 1.5) {
            // Simple collision
            onGameOver(g.score);
          }
          if (obs.position.z > 15) {
            g.scene.remove(obs);
            g.obstacles.splice(index, 1);
          }
        });

        g.coins.forEach((coin, index) => {
          coin.position.z += moveStep;
          coin.rotation.y += 0.05;
          // Collection check
          const dist = g.player.position.distanceTo(coin.position);
          if (dist < 1.2) {
            g.scene.remove(coin);
            g.coins.splice(index, 1);
            g.distance += 10; // Bonus score
          }
          if (coin.position.z > 15) {
            g.scene.remove(coin);
            g.coins.splice(index, 1);
          }
        });

        // Spawn obstacles
        if (g.distance - g.lastObstaclePos > 25) {
          spawnObstacle(-150);
          g.lastObstaclePos = g.distance;
        }

        // Camera follow (slight shake or tilt could be added)
        camera.position.x = g.player.position.x * 0.3;
      }

      renderer.render(scene, camera);
      g.animationId = requestAnimationFrame(update);
    };

    update();

    // Cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      resizeObserver.disconnect();
      if (gameRef.current) {
        cancelAnimationFrame(gameRef.current.animationId);
        gameRef.current.renderer.dispose();
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [onGameOver, onUpdateScore, isPaused]);

  return <div ref={containerRef} className="w-full h-full" id="game-container" />;
};

export default GameCanvas;
