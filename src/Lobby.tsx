import { useState, useEffect } from 'react';
import { Crown, Users, Gamepad2, Clock, Play } from 'lucide-react';
import { animate, stagger } from 'animejs';
import type { Player } from './App';

export type GameMode = 'timed-pvp' | 'custom-pvp' | 'coop';
export interface GameSettings { mode: GameMode; timeLimit: number; }

interface LobbyProps { onStartGame: (settings: GameSettings) => void; isHost: boolean; players: Player[]; }

export default function Lobby({ onStartGame, isHost, players }: LobbyProps) {
  const [selectedMode, setSelectedMode] = useState<GameMode>('timed-pvp');
  const [selectedTime, setSelectedTime] = useState<number>(180);

  useEffect(() => {
    animate('.lobby-card', { y: [40, 0], opacity: [0, 1], duration: 800, ease: 'outExpo' });
    animate('.player-slot', { scale: [0.8, 1], opacity: [0, 1], delay: stagger(100, { start: 200 }), duration: 600, ease: 'outBack' });
  }, []);

  return (
    <div className="lobby-card">
      <h1 className="lobby-title">WORDLE WITH FRIENDS</h1>

      <div className="settings-group">
        <label className="flex-label"><Users size={16} /> Players Waiting ({players.length}/8)</label>
        <div className="player-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`player-slot ${!players[i] ? 'empty pulsing' : 'filled'}`}>
              {players[i] ? (
                <div className="player-info">
                  {i === 0 && <Crown size={14} color="#FEE75C" className="host-crown" />}
                  <span>{players[i].name}</span>
                </div>
              ) : ( <span className="empty-text">Empty Slot</span> )}
            </div>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <label className="flex-label"><Gamepad2 size={16} /> Game Mode</label>
        <div className="select-wrapper">
          <select value={selectedMode} onChange={(e) => setSelectedMode(e.target.value as GameMode)} disabled={!isHost}>
            <option value="timed-pvp">Timed PvP (Random Word)</option>
            <option value="custom-pvp">Custom PvP (Set & Swap)</option>
            <option value="coop">Co-op (Play Together)</option>
          </select>
        </div>
      </div>

      <div className="settings-group">
        <label className="flex-label"><Clock size={16} /> Time Limit</label>
        <div className="select-wrapper">
          <select value={selectedTime} onChange={(e) => setSelectedTime(Number(e.target.value))} disabled={!isHost}>
            <option value={60}>1 Minute</option>
            <option value={180}>3 Minutes</option>
            <option value={300}>5 Minutes</option>
            <option value={0}>Unlimited</option>
          </select>
        </div>
      </div>

      <button className="btn-primary" style={{ marginTop: '20px' }} onClick={() => onStartGame({ mode: selectedMode, timeLimit: selectedTime })} disabled={!isHost}>
        {isHost ? ( <><Play size={20} style={{ marginRight: '8px' }}/> START MATCH</> ) : ( 'WAITING FOR HOST...' )}
      </button>
    </div>
  );
}
