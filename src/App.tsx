/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  Coins,
  Home,
  Magnet,
  Pause,
  Play,
  RotateCcw,
  Trophy,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import GameCanvas from './components/GameCanvas';
import type { GameControls, GameStats, HudState } from './types';

type GameState = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAMEOVER';

const HIGH_SCORE_KEY = 'subwayRunner_highScore';

const INITIAL_HUD: HudState = {
  score: 0,
  coins: 0,
  distance: 0,
  speed: 0,
  multiplier: 1,
  combo: 0,
  bestCombo: 0,
  powerUps: [],
  paused: false,
  muted: false,
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [hud, setHud] = useState<HudState>(INITIAL_HUD);
  const [stats, setStats] = useState<GameStats | null>(null);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem(HIGH_SCORE_KEY);
    return saved ? parseInt(saved, 10) : 0;
  });
  const [runId, setRunId] = useState(0);
  const controlsRef = useRef<GameControls | null>(null);

  const handleStart = useCallback(() => {
    setStats(null);
    setHud(INITIAL_HUD);
    setRunId((id) => id + 1);
    setGameState('PLAYING');
  }, []);

  const handleGameOver = useCallback(
    (finalStats: GameStats) => {
      setStats((prev) => {
        if (prev) return prev;
        return finalStats;
      });
      setGameState((current) => {
        if (current === 'GAMEOVER') return current;
        return 'GAMEOVER';
      });
      setHighScore((prevHigh) => {
        if (finalStats.score > prevHigh) {
          localStorage.setItem(HIGH_SCORE_KEY, finalStats.score.toString());
          return finalStats.score;
        }
        return prevHigh;
      });
    },
    [],
  );

  const handleHud = useCallback((next: HudState) => {
    setHud(next);
  }, []);

  const handleRequestPause = useCallback(() => {
    setGameState((current) => {
      if (current === 'PLAYING') return 'PAUSED';
      if (current === 'PAUSED') return 'PLAYING';
      return current;
    });
  }, []);

  const handleResume = useCallback(() => setGameState('PLAYING'), []);
  const handleMenu = useCallback(() => setGameState('MENU'), []);

  const newBest = stats !== null && stats.score > 0 && stats.score >= highScore;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-neutral-900 font-sans text-white">
      {/* 3D Game Canvas */}
      {gameState !== 'MENU' && (
        <div className="absolute inset-0">
          <GameCanvas
            key={runId}
            onGameOver={handleGameOver}
            onHud={handleHud}
            onRequestPause={handleRequestPause}
            paused={gameState === 'PAUSED' || gameState === 'GAMEOVER'}
            controlsRef={controlsRef}
          />
        </div>
      )}

      {/* VIGNETTE GRADIENTS (Theme Aesthetic) */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="absolute top-0 left-0 h-48 w-full bg-gradient-to-b from-black/80 to-transparent"></div>
        <div className="absolute bottom-0 left-0 h-64 w-full bg-gradient-to-t from-black/80 to-transparent"></div>
      </div>

      {/* HUD */}
      <AnimatePresence>
        {(gameState === 'PLAYING' || gameState === 'PAUSED') && (
          <>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute top-6 left-6 z-20 flex flex-col gap-1 md:top-12 md:left-12"
            >
              <div className="text-xs font-black tracking-[0.3em] text-brand-cyan uppercase">
                METRO-09
              </div>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full border-4 border-black bg-brand-yellow font-black text-black shadow-lg">
                  R
                </div>
                <div className="text-4xl leading-none font-black tracking-tighter italic">
                  {Math.floor(hud.score / 10).toLocaleString()}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 backdrop-blur-sm">
                  <Coins className="h-4 w-4 text-brand-yellow" />
                  <span className="text-lg leading-none font-black italic">
                    {hud.coins}
                  </span>
                </div>
                {hud.combo >= 8 && (
                  <div className="rounded-full bg-brand-pink px-3 py-1.5 text-sm leading-none font-black tracking-wider italic">
                    COMBO x{hud.combo}
                  </div>
                )}
              </div>
              <div className="text-[11px] font-bold tracking-widest text-white/50 uppercase">
                {hud.distance.toLocaleString()} m · {Math.round(hud.speed)} km/h
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute top-6 right-6 z-20 flex flex-col items-end gap-0 text-right md:top-12 md:right-12"
            >
              <div className="mb-2 text-[10px] leading-none font-black tracking-[0.4em] text-brand-pink uppercase">
                RUN SCORE
              </div>
              <div className="mb-3 text-6xl leading-[0.75] font-black tracking-tighter italic drop-shadow-2xl md:text-[120px]">
                {hud.score.toLocaleString()}
              </div>
              <div className="flex items-baseline gap-2 bg-white px-6 py-2 text-black shadow-xl md:px-8">
                <span className="skew-x-[-15deg] text-[10px] font-black tracking-widest uppercase">
                  Multiplier
                </span>
                <span className="text-3xl font-black italic md:text-4xl">
                  X{hud.multiplier}
                </span>
              </div>
              {hud.powerUps.map((p) => (
                <div key={p.type} className="mt-2 w-48 md:w-56">
                  <div
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black tracking-wider uppercase ${
                      p.type === 'score2x'
                        ? 'bg-brand-pink text-white'
                        : 'bg-brand-cyan text-black'
                    }`}
                  >
                    {p.type === 'score2x' ? (
                      <Zap className="h-4 w-4" />
                    ) : (
                      <Magnet className="h-4 w-4" />
                    )}
                    {p.type === 'score2x' ? '2X SCORE' : 'COIN MAGNET'} ·{' '}
                    {Math.ceil(p.timeLeft)}s
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                    <div
                      className={`h-full rounded-full ${
                        p.type === 'score2x' ? 'bg-brand-pink' : 'bg-brand-cyan'
                      }`}
                      style={{ width: `${(p.timeLeft / p.duration) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </motion.div>

            {/* Pause + mute buttons */}
            <div className="absolute top-6 left-1/2 z-30 flex -translate-x-1/2 gap-2 md:top-12">
              <button
                onClick={() => controlsRef.current?.togglePause()}
                aria-label={gameState === 'PAUSED' ? 'Resume' : 'Pause'}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-brand-cyan hover:text-black"
              >
                {gameState === 'PAUSED' ? (
                  <Play className="h-5 w-5" />
                ) : (
                  <Pause className="h-5 w-5" />
                )}
              </button>
              <button
                onClick={() => controlsRef.current?.toggleMute()}
                aria-label={hud.muted ? 'Unmute' : 'Mute'}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-brand-cyan hover:text-black"
              >
                {hud.muted ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </button>
            </div>

            {/* Mobile touch controls */}
            {gameState === 'PLAYING' && (
              <div className="absolute right-4 bottom-6 left-4 z-30 flex items-end justify-between md:hidden">
                <div className="flex gap-3">
                  <button
                    aria-label="Move left"
                    onPointerDown={() => controlsRef.current?.moveLeft()}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm active:bg-brand-cyan active:text-black"
                  >
                    <ChevronLeft className="h-8 w-8" />
                  </button>
                  <button
                    aria-label="Move right"
                    onPointerDown={() => controlsRef.current?.moveRight()}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm active:bg-brand-cyan active:text-black"
                  >
                    <ChevronRight className="h-8 w-8" />
                  </button>
                </div>
                <div className="flex gap-3">
                  <button
                    aria-label="Slide"
                    onPointerDown={() => controlsRef.current?.slide()}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-sm active:bg-brand-pink"
                  >
                    <ArrowDown className="h-8 w-8" />
                  </button>
                  <button
                    aria-label="Jump"
                    onPointerDown={() => controlsRef.current?.jump()}
                    className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-yellow text-black backdrop-blur-sm active:bg-white"
                  >
                    <ArrowUp className="h-8 w-8" />
                  </button>
                </div>
              </div>
            )}

            {/* Watermark text */}
            <div className="pointer-events-none absolute bottom-[-20px] left-[-20px] z-0 text-[200px] leading-none font-black tracking-tighter text-white/5 italic uppercase">
              RUNNER
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Pause overlay */}
      <AnimatePresence>
        {gameState === 'PAUSED' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center overflow-y-auto bg-black/70 px-6 py-8 backdrop-blur-md"
            id="pause-overlay"
          >
            <div className="my-auto flex flex-col items-center">
            <h2 className="mb-2 text-5xl font-black tracking-tighter text-white italic md:text-7xl">
              PAUSED
            </h2>
            <p className="mb-10 text-sm font-bold tracking-[0.3em] text-white/50 uppercase">
              Score {hud.score.toLocaleString()} · {hud.distance.toLocaleString()} m
            </p>
            <div className="flex w-full max-w-xs flex-col gap-4">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleResume}
                className="flex w-full items-center justify-center gap-3 bg-brand-cyan py-5 text-2xl font-black text-black capitalize shadow-[0_10px_40px_rgba(6,182,212,0.3)] transition-all hover:bg-white"
                id="resume-button"
              >
                <Play className="h-6 w-6" /> Resume
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleStart}
                className="flex w-full items-center justify-center gap-3 bg-white py-4 text-xl font-black text-black capitalize transition-all hover:bg-brand-yellow"
                id="pause-restart-button"
              >
                <RotateCcw className="h-5 w-5" /> Restart
              </motion.button>
              <button
                onClick={handleMenu}
                className="mt-2 flex items-center justify-center gap-2 text-xs font-black tracking-[0.4em] text-white uppercase opacity-50 transition-all hover:opacity-100"
              >
                <Home className="h-4 w-4" /> Main Menu
              </button>
            </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Menu overlay */}
      <AnimatePresence>
        {gameState === 'MENU' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-neutral-900 px-6"
            id="menu-overlay"
          >
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-blue-900/40 via-black to-black opacity-60"></div>
            <div
              className="pointer-events-none absolute inset-0 opacity-20"
              style={{
                backgroundImage:
                  'radial-gradient(#ffffff 1px, transparent 1px)',
                backgroundSize: '40px 40px',
              }}
            ></div>

            <motion.div
              initial={{ y: -50, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              className="relative z-10 mb-16 text-center"
            >
              <h1 className="text-[100px] leading-[0.8] font-extrabold tracking-tighter text-white italic drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)] md:text-[140px]">
                SUBWAY
                <br />
                RUNNER
              </h1>
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-brand-cyan px-6 py-2 text-xl font-black text-black italic shadow-xl">
                3D INFINITE ARCADE
              </div>
            </motion.div>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleStart}
              className="group relative z-10 flex items-center justify-center rounded-none bg-white px-20 py-8 shadow-[0_0_50px_rgba(255,255,255,0.2)] transition-all hover:bg-brand-yellow"
              id="play-button"
            >
              <span className="text-4xl font-black tracking-tighter text-black italic">
                START RUN
              </span>
            </motion.button>

            <div className="relative z-10 mt-20 flex items-center gap-12">
              <div className="flex flex-col items-center gap-2">
                <div className="text-[10px] font-black tracking-widest text-brand-cyan uppercase opacity-60">
                  Personal Best
                </div>
                <div className="text-3xl font-black tracking-tighter italic">
                  {highScore.toLocaleString()} pts
                </div>
              </div>
              <div className="h-12 w-px bg-white/10" />
              <div className="flex flex-col items-start gap-1 text-xs font-bold tracking-widest text-white/60 uppercase">
                <div>← → / A D — switch lane</div>
                <div>Space / W / ↑ — jump</div>
                <div>S / ↓ — slide · P — pause</div>
                <div className="text-white/35 normal-case">
                  Swipe on touch screens
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over overlay */}
      <AnimatePresence>
        {gameState === 'GAMEOVER' && stats && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center overflow-y-auto bg-black/90 px-6 py-8 backdrop-blur-xl"
            id="gameover-overlay"
          >
            <motion.div
              initial={{ scale: 0.9, rotate: -2 }}
              animate={{ scale: 1, rotate: 0 }}
              className="relative my-auto flex w-full max-w-lg flex-col items-center"
            >
              <div className="absolute -top-12 -left-12 text-[140px] leading-none font-black text-white/5 italic select-none">
                BUSTED
              </div>

              <h2 className="mb-6 text-5xl font-black tracking-tighter text-white italic drop-shadow-2xl md:text-8xl">
                CRASHED!
              </h2>

              {newBest && (
                <motion.div
                  initial={{ scale: 0, rotate: -8 }}
                  animate={{ scale: 1, rotate: -3 }}
                  className="mb-6 flex items-center gap-2 rounded-full bg-brand-yellow px-5 py-2 text-sm font-black tracking-widest text-black uppercase shadow-xl"
                >
                  <Trophy className="h-4 w-4" /> New Best!
                </motion.div>
              )}

              <div className="mb-8 flex w-full flex-col gap-4">
                <div className="relative overflow-hidden bg-white p-6 text-black shadow-2xl md:p-8">
                  <div className="absolute top-0 right-0 h-full w-2 bg-brand-pink"></div>
                  <span className="mb-2 block text-xs font-black tracking-widest text-neutral-400 uppercase">
                    Final Score
                  </span>
                  <span className="text-5xl leading-none font-black tracking-tighter italic md:text-6xl">
                    {stats.score.toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="border-l-8 border-brand-cyan bg-neutral-800 p-4 text-white">
                    <span className="mb-1 block text-[10px] font-black tracking-widest text-brand-cyan uppercase">
                      Distance
                    </span>
                    <span className="text-2xl font-black italic">
                      {stats.distance.toLocaleString()} m
                    </span>
                  </div>
                  <div className="border-l-8 border-brand-yellow bg-neutral-800 p-4 text-white">
                    <span className="mb-1 block text-[10px] font-black tracking-widest text-brand-yellow uppercase">
                      Coins
                    </span>
                    <span className="text-2xl font-black italic">
                      {stats.coins}
                    </span>
                  </div>
                  <div className="border-l-8 border-brand-pink bg-neutral-800 p-4 text-white">
                    <span className="mb-1 block text-[10px] font-black tracking-widest text-brand-pink uppercase">
                      Best Combo
                    </span>
                    <span className="text-2xl font-black italic">
                      x{stats.bestCombo}
                    </span>
                  </div>
                </div>

                <div className="border-l-8 border-white/30 bg-neutral-800 p-4 text-white">
                  <span className="mb-1 block text-xs font-black tracking-widest text-white/50 uppercase">
                    Your Best Record
                  </span>
                  <span className="text-3xl font-black italic">
                    {highScore.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="flex w-full flex-col gap-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleStart}
                  className="w-full bg-brand-cyan py-6 text-2xl font-black text-black capitalize shadow-[0_10px_40px_rgba(6,182,212,0.3)] transition-all hover:bg-white"
                  id="restart-button"
                >
                  respawn now
                </motion.button>

                <button
                  onClick={handleMenu}
                  className="mt-6 text-xs font-black tracking-[0.4em] text-white uppercase opacity-30 transition-all hover:opacity-100"
                  id="menu-button"
                >
                  Return to Base
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
