/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Lane {
  LEFT = -1,
  CENTER = 0,
  RIGHT = 1,
}

export const LANE_WIDTH = 4;
export const INITIAL_SPEED = 20;
export const MAX_SPEED = 50;

/** Gravity applied to the jump (m/s^2). */
export const GRAVITY = 30;
/** Initial upward velocity of a jump (m/s). */
export const JUMP_VELOCITY = 11;
/** How long a slide lasts (s). */
export const SLIDE_DURATION = 0.8;

export type PowerUpType = 'score2x' | 'magnet';

export interface ActivePowerUp {
  type: PowerUpType;
  /** Seconds remaining. */
  timeLeft: number;
  /** Total duration when picked up. */
  duration: number;
}

export interface HudState {
  score: number;
  coins: number;
  distance: number;
  speed: number;
  /** Real score multiplier currently applied (combo x power-up). */
  multiplier: number;
  combo: number;
  bestCombo: number;
  powerUps: ActivePowerUp[];
  paused: boolean;
  muted: boolean;
}

export interface GameStats {
  score: number;
  distance: number;
  coins: number;
  bestCombo: number;
  newBest: boolean;
}

export interface GameControls {
  moveLeft(): void;
  moveRight(): void;
  jump(): void;
  slide(): void;
  togglePause(): void;
  toggleMute(): void;
}
