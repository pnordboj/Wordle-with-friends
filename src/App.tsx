import { useState, useEffect } from 'react';
import { DiscordSDK } from '@discord/embedded-app-sdk';
import { Client, Room } from "@colyseus/sdk"; // <-- FIXED: Added Room import
import posthog from 'posthog-js';
import { Loader2, Volume2, VolumeX } from 'lucide-react'; 
import { Howler } from 'howler';
import Lobby, { type GameSettings } from './Lobby';
import WordleUI from './WordleUI';
import './App.css';

posthog.init(import.meta.env.VITE_PUBLIC_POSTHOG_KEY, { api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST, person_profiles: 'identified_only' });

const queryParams = new URLSearchParams(window.location.search);
const isDiscord = queryParams.get('frame_id') != null;
const urlRoomCode = queryParams.get('room');

let discordSdk: DiscordSDK | null = null;
if (isDiscord) discordSdk = new DiscordSDK('1481898488500326462'); 

const backendUrl = window.location.hostname === 'localhost' ? 'ws://localhost:3001' : 'wss://wordle-with-friends-backend-qxjh.onrender.com'; 
const client = new Client(backendUrl);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface Player { id: string; discordId: string; name: string; guesses: any[][]; }

export default function App() {
  const [appPhase, setAppPhase] = useState<'loading' | 'lobby' | 'playing'>('loading');
  const [gameSettings, setGameSettings] = useState<GameSettings>({ mode: 'timed-pvp', timeLimit: 180 });
  const [discordUser, setDiscordUser] = useState<{ id: string, username: string } | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [roomId, setRoomId] = useState<string>('test-room');
  
  // <-- FIXED: Changed client.Room to Room
  const [room, setRoom] = useState<Room | null>(null);
  const [volume, setVolume] = useState<number>(0.5);

  useEffect(() => { Howler.volume(volume); }, [volume]);

  useEffect(() => {
    async function setupApp() {
      let currentRoomId = 'test-room';
      let mockUser = { id: 'unknown', username: 'Unknown Player' };

      if (!isDiscord || !discordSdk) {
        let username = sessionStorage.getItem('webUsername');
        if (!username) {
          username = prompt("Welcome to Wordle With Friends! Enter your username:") || `Player${Math.floor(Math.random() * 1000)}`;
          sessionStorage.setItem('webUsername', username);
        }

        let mockId = sessionStorage.getItem('mockDiscordId');
        if (!mockId) {
          mockId = `web-${Math.floor(Math.random() * 10000)}`;
          sessionStorage.setItem('mockDiscordId', mockId);
        }

        currentRoomId = urlRoomCode || Math.random().toString(36).substring(2, 7).toUpperCase();
        if (!urlRoomCode) window.history.replaceState(null, '', `?room=${currentRoomId}`);
        mockUser = { id: mockId, username: username };
      } 
      else {
        try {
          await discordSdk.ready();
          currentRoomId = discordSdk.channelId || 'local-dev-room';
          let mockId = sessionStorage.getItem('mockDiscordId');
          if (!mockId) {
            mockId = `discord-${Math.floor(Math.random() * 10000)}`;
            sessionStorage.setItem('mockDiscordId', mockId);
          }
          mockUser = { id: mockId, username: `DiscordUser_${mockId.split('-')[1]}` };
        } catch (error) { 
          console.error("Discord SDK Error:", error); 
          alert("Failed to initialize Discord SDK. Please try refreshing the page."); 
          return; 
        }
      }

      setRoomId(currentRoomId);
      setDiscordUser(mockUser);
      
      posthog.identify(mockUser.id, { username: mockUser.username, platform: isDiscord ? 'discord' : 'web' });

      try {
        const joinedRoom = await client.joinOrCreate("wordle", { roomId: currentRoomId, user: mockUser });
        setRoom(joinedRoom);

        joinedRoom.onMessage('room_state_update', (roomData) => {
          setPlayers(roomData.players); 
          setGameSettings(roomData.settings);
          if (roomData.phase === 'lobby') setAppPhase('lobby');
        });
        
        joinedRoom.onMessage('settings_updated', (newSettings) => setGameSettings(newSettings));
        
        joinedRoom.onMessage('game_started', (finalSettings) => {
          setGameSettings(finalSettings); 
          setAppPhase('playing');
        });
        
        setAppPhase('lobby');
      } catch (e) { 
        console.error("Colyseus Join Error:", e); 
      }
    } 

    setupApp();

    return () => { if (room) room.leave(true); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStartGame = (settings: GameSettings) => {
    setGameSettings(settings);
    room?.send('start_game'); 
    posthog.capture('match_started', { mode: settings.mode, time_limit: settings.timeLimit, players: players.length });
  };

  const handleReturnToLobby = () => room?.send('return_to_lobby');

    if (appPhase === 'loading' || !room) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        
        {/* The New 3D Wordle Wave Loader */}
        <div className="loader-row">
          {['L', 'O', 'A', 'D', 'I', 'N', 'G'].map((letter, i) => (
            <div key={i} className="loader-tile">
              {letter}
            </div>
          ))}
        </div>
        
        <div className="loader-text">Connecting</div>
      </div>
    );
  }

  const isHost = players.length > 0 && players[0].discordId === discordUser?.id;

  return (
    <div className="app-container">

      <div className="audio-widget">
        {volume === 0 ? <VolumeX size={20} color="#ED4245" /> : <Volume2 size={20} color="#57F287" />}
        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))} />
      </div>

      {appPhase === 'lobby' && <Lobby onStartGame={handleStartGame} isHost={isHost} players={players} />}
      {appPhase === 'playing' && <WordleUI settings={gameSettings} room={room} roomId={roomId} players={players} localUserId={room.sessionId} onReturnToLobby={handleReturnToLobby} />}
    </div>
  );
}
