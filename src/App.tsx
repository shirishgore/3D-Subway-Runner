/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, RotateCcw, Trophy, User } from 'lucide-react';
import GameCanvas from './components/GameCanvas';

type GameState = 'MENU' | 'PLAYING' | 'GAMEOVER';

export default function App() {
  const [gameState, setGameState] = useState<GameState>('MENU');
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(() => {
    const saved = localStorage.getItem('subwayRunner_highScore');
    return saved ? parseInt(saved, 10) : 0;
  });

  const handleStart = () => {
    setScore(0);
    setGameState('PLAYING');
  };

  const handleGameOver = useCallback((finalScore: number) => {
    setGameState('GAMEOVER');
    if (finalScore > highScore) {
      setHighScore(finalScore);
      localStorage.setItem('subwayRunner_highScore', finalScore.toString());
    }
  }, [highScore]);

  const handleUpdateScore = useCallback((newScore: number) => {
    setScore(newScore);
  }, []);

  return (
    <div className="relative w-full h-screen overflow-hidden bg-neutral-900 font-sans text-white">
      {/* 3D Game Canvas */}
      {gameState !== 'MENU' && (
        <div className="absolute inset-0">
          <GameCanvas 
            onGameOver={handleGameOver} 
            onUpdateScore={handleUpdateScore}
            isPaused={gameState === 'GAMEOVER'}
          />
        </div>
      )}

      {/* VIGNETTE GRADIENTS (Theme Aesthetic) */}
      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="absolute top-0 left-0 w-full h-48 bg-gradient-to-b from-black/80 to-transparent"></div>
        <div className="absolute bottom-0 left-0 w-full h-64 bg-gradient-to-t from-black/80 to-transparent"></div>
      </div>

      {/* HUD - Score Display (Theme Styled) */}
      <AnimatePresence>
        {gameState === 'PLAYING' && (
          <>
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-12 left-12 z-20 flex flex-col gap-1 pointer-events-none"
            >
              <div className="text-xs font-black tracking-[0.3em] text-brand-cyan uppercase">METRO-09</div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-yellow rounded-full border-4 border-black flex items-center justify-center font-black text-black shadow-lg">R</div>
                <div className="text-4xl font-black italic tracking-tighter leading-none">
                  {Math.floor(score / 10).toLocaleString()}
                </div>
              </div>
            </motion.div>

            <motion.div 
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-12 right-12 z-20 text-right flex flex-col gap-0 items-end pointer-events-none"
            >
              <div className="text-[10px] font-black tracking-[0.4em] text-brand-pink uppercase leading-none mb-2">RUN SCORE</div>
              <div className="text-[120px] font-black italic tracking-tighter leading-[0.75] mb-4 drop-shadow-2xl">
                {score.toLocaleString()}
              </div>
              <div className="bg-white text-black px-8 py-2 flex items-baseline gap-2 skew-x-[-15deg] shadow-xl">
                <span className="text-[10px] font-black uppercase tracking-widest">Multiplier</span>
                <span className="text-4xl font-black italic">X{(1 + Math.floor(score / 500)).toString()}</span>
              </div>
            </motion.div>

            {/* Watermark text */}
            <div className="absolute bottom-[-20px] left-[-20px] text-[200px] font-black text-white/5 leading-none pointer-events-none italic tracking-tighter uppercase z-0">
              RUNNER
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Main Menu overlay */}
      <AnimatePresence>
        {gameState === 'MENU' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-neutral-900 z-50 px-6"
            id="menu-overlay"
          >
            <div className="absolute inset-0 z-0 bg-gradient-to-b from-blue-900/40 via-black to-black opacity-60"></div>
            <div className="absolute inset-0 opacity-20 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

            <motion.div
              initial={{ y: -50, scale: 0.9 }}
              animate={{ y: 0, scale: 1 }}
              className="text-center mb-16 relative z-10"
            >
              <h1 className="text-[100px] md:text-[140px] font-extrabold text-white italic tracking-tighter leading-[0.8] drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]">
                SUBWAY<br/>RUNNER
              </h1>
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 bg-brand-cyan text-black px-6 py-2 font-black italic skew-x-[-20deg] text-xl shadow-xl">
                3D INFINITE ARCADE
              </div>
            </motion.div>

            <motion.button
              whileHover={{ scale: 1.05, skewX: -12 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleStart}
              className="group relative flex items-center justify-center bg-white px-20 py-8 rounded-none skew-x-[-15deg] shadow-[0_0_50px_rgba(255,255,255,0.2)] hover:bg-brand-yellow transition-all"
              id="play-button"
            >
              <span className="text-4xl font-black text-black tracking-tighter italic">START RUN</span>
            </motion.button>

            <div className="mt-20 flex gap-12 items-center relative z-10">
               <div className="flex flex-col items-center gap-2">
                  <div className="text-[10px] font-black text-brand-cyan tracking-widest uppercase opacity-60">Personal Best</div>
                  <div className="text-3xl font-black italic tracking-tighter">{highScore.toLocaleString()} pts</div>
               </div>
               <div className="w-px h-12 bg-white/10" />
               <div className="flex flex-col items-center gap-1 opacity-40 italic">
                  <div className="text-xs font-bold uppercase tracking-widest">Controls: W/A/D</div>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Game Over overlay */}
      <AnimatePresence>
        {gameState === 'GAMEOVER' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 backdrop-blur-xl z-50 px-6"
            id="gameover-overlay"
          >
            <motion.div
              initial={{ scale: 0.9, rotate: -2 }}
              animate={{ scale: 1, rotate: 0 }}
              className="relative flex flex-col items-center max-w-lg w-full"
            >
              <div className="absolute -top-12 -left-12 text-[140px] font-black text-white/5 italic leading-none select-none">BUSTED</div>
              
              <h2 className="text-8xl font-black text-white italic tracking-tighter mb-8 drop-shadow-2xl">CRASHED!</h2>
              
              <div className="flex flex-col gap-6 w-full mb-12">
                <div className="bg-white text-black p-8 skew-x-[-10deg] shadow-2xl relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-2 h-full bg-brand-pink"></div>
                  <span className="text-xs font-black text-neutral-400 uppercase tracking-widest mb-2 block">Final Distance</span>
                  <span className="text-6xl font-black italic tracking-tighter leading-none">{score.toLocaleString()}</span>
                </div>

                <div className="bg-neutral-800 text-white p-6 skew-x-[-5deg] border-l-8 border-brand-yellow">
                  <span className="text-xs font-black text-brand-yellow uppercase tracking-widest mb-1 block">Your Best Record</span>
                  <span className="text-3xl font-black italic">{highScore.toLocaleString()}</span>
                </div>
              </div>

              <div className="flex flex-col w-full gap-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleStart}
                  className="w-full bg-brand-cyan text-black py-6 font-black text-2xl skew-x-[-10deg] shadow-[0_10px_40px_rgba(6,182,212,0.3)] hover:bg-white transition-all capitalize"
                  id="restart-button"
                >
                  respawn now
                </motion.button>
                
                <button 
                  onClick={() => setGameState('MENU')}
                  className="mt-6 text-white tracking-[0.4em] font-black text-xs uppercase opacity-30 hover:opacity-100 transition-all"
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

