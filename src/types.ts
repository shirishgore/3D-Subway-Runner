/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum Lane {
  LEFT = -1,
  CENTER = 0,
  RIGHT = 1
}

export interface GameState {
  score: number;
  multiplier: number;
  isGameOver: boolean;
  distance: number;
  speed: number;
}

export const LANE_WIDTH = 4;
export const INITIAL_SPEED = 20;
export const SPEED_INCREMENT = 0.001;
export const MAX_SPEED = 50;
