import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Room } from '@colyseus/sdk';
import confetti from 'canvas-confetti';
import posthog from 'posthog-js';
import { Timer, Hash, LogOut, Activity, Loader2, Users } from 'lucide-react';
import { Howl } from 'howler';
import { animate, stagger } from 'animejs';
import Matter from 'matter-js';
import type { GameSettings } from './Lobby';
import type { Player } from './App';

type GuessStatus = 'correct' | 'present' | 'absent' | 'empty';

interface WordleUIProps {
  settings: GameSettings;
  room: Room;
  roomId: string;
  players: Player[];
  localUserId: string;
  onReturnToLobby: () => void; 
}

const BGM_TRACKS = ['/audio/bgm1.mp3', '/audio/bgm2.mp3', '/audio/bgm3.mp3'];
const WIN_TRACKS = ['/audio/win1.mp3', '/audio/win2.mp3'];
const LOSE_TRACKS = ['/audio/lose1.mp3', '/audio/lose2.mp3'];

export default function WordleUI({ settings, room, roomId, players, localUserId, onReturnToLobby }: WordleUIProps) {
  const [board, setBoard] = useState<string[][]>(Array.from({ length: 6 }, () => Array(5).fill('')));
  const [statuses, setStatuses] = useState<GuessStatus[][]>(Array.from({ length: 6 }, () => Array(5).fill('empty')));
  const [keyboardStatuses, setKeyboardStatuses] = useState<Record<string, GuessStatus>>({});
  
  const [currentRow, setCurrentRow] = useState<number>(0);
  const [currentCol, setCurrentCol] = useState<number>(0);
  const [isWaiting, setIsWaiting] = useState<boolean>(false); 
  const [gameOver, setGameOver] = useState<{ isOver: boolean; message: string; word: string }>({ isOver: false, message: '', word: '' });

  const [timeRemaining, setTimeRemaining] = useState<number>(settings.timeLimit);

  // Safely access current row and players inside socket listeners without triggering re-renders
  const currentRowRef = useRef(currentRow);
  useEffect(() => { currentRowRef.current = currentRow; }, [currentRow]);

  const playersRef = useRef(players);
  useEffect(() => { playersRef.current = players; }, [players]);

  const sounds = useMemo(() => {
    // eslint-disable-next-line
    const randomBgm = BGM_TRACKS[Math.floor(Math.random() * BGM_TRACKS.length)] || '/audio/bgm.mp3';
    // eslint-disable-next-line
    const randomWin = WIN_TRACKS[Math.floor(Math.random() * WIN_TRACKS.length)] || '/audio/win.mp3';
    // eslint-disable-next-line
    const randomLose = LOSE_TRACKS[Math.floor(Math.random() * LOSE_TRACKS.length)] || '/audio/lose.mp3';

    return {
      bgm: new Howl({ src: [randomBgm], loop: true }),
      type: new Howl({ src: ['/audio/type.mp3'] }),
      enter: new Howl({ src: ['/audio/enter.mp3'] }),
      del: new Howl({ src: ['/audio/delete.mp3'] }),
      pop: new Howl({ src: ['/audio/pop.mp3'] }),
      clack: new Howl({ src: ['/audio/clack.mp3'] }),
      win: new Howl({ src: [randomWin] }),
      lose: new Howl({ src: [randomLose] }),
    };
  }, []);

  useEffect(() => {
    animate('.local-board .row', { y: [30, 0], opacity: [0, 1], delay: stagger(80), duration: 600, ease: 'outBack' });
    animate('.keyboard-row .key', { scale: [0, 1], opacity: [0, 1], delay: stagger(15, { from: 'center' }), duration: 400, ease: 'outBack' });
    sounds.bgm.play();
    return () => { sounds.bgm.stop(); };
  }, [sounds.bgm]);

  useEffect(() => {
    if (settings.timeLimit <= 0 || gameOver.isOver) return;
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          room.send('time_up'); 
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [settings.timeLimit, gameOver.isOver, room]);

  useEffect(() => {
    if (settings.timeLimit > 0 && timeRemaining <= 30 && timeRemaining > 0) {
      const newRate = 1.0 + ((30 - timeRemaining) / 30) * 0.5;
      sounds.bgm.rate(newRate);
    } else if (timeRemaining === 0) {
      sounds.bgm.stop();
    }
    
    if (settings.timeLimit > 0 && timeRemaining <= 10 && timeRemaining > 0 && !gameOver.isOver) {
      animate('.countdown-flash', { opacity: [0, 0.25, 0], scale: [0.6, 1.2, 0.9], duration: 1000, ease: 'outElastic(1, .8)' });
    }
  }, [timeRemaining, settings.timeLimit, gameOver.isOver, sounds.bgm]);

  useEffect(() => {
    if (!gameOver.isOver) return;

    const timer = setTimeout(() => {
      const engine = Matter.Engine.create();
      const cells = Array.from(document.querySelectorAll('.local-board .cell')) as HTMLElement[];
      const bodies: { body: Matter.Body; el: HTMLElement; width: number; height: number }[] = [];
      const centerX = window.innerWidth / 2;
      const centerY = window.innerHeight / 2;

      cells.forEach((cell) => {
        const rect = cell.getBoundingClientRect();
        const body = Matter.Bodies.rectangle(rect.left + rect.width / 2, rect.top + rect.height / 2, rect.width, rect.height, { 
          restitution: 0.6, friction: 0.1, density: 0.05, chamfer: { radius: 8 } 
        });
        
        const forceX = (body.position.x - centerX) * 0.00005;
        const forceY = (body.position.y - centerY) * 0.00005 - 0.02;
        Matter.Body.applyForce(body, body.position, { x: forceX, y: forceY });
        Matter.Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.3);
        bodies.push({ body, el: cell, width: rect.width, height: rect.height });
      });

      bodies.forEach(({ el, width, height }) => {
        el.style.width = `${width}px`; el.style.height = `${height}px`;
        el.style.position = 'fixed'; el.style.margin = '0';
        el.style.zIndex = '50'; el.style.transition = 'none';
      });

      const ground = Matter.Bodies.rectangle(window.innerWidth / 2, window.innerHeight + 50, window.innerWidth * 2, 100, { isStatic: true });
      const leftWall = Matter.Bodies.rectangle(-50, window.innerHeight / 2, 100, window.innerHeight * 2, { isStatic: true });
      const rightWall = Matter.Bodies.rectangle(window.innerWidth + 50, window.innerHeight / 2, 100, window.innerHeight * 2, { isStatic: true });

      Matter.World.add(engine.world, [...bodies.map(b => b.body), ground, leftWall, rightWall]);

      Matter.Events.on(engine, 'collisionStart', (event) => {
        event.pairs.forEach((pair) => {
          const impact = pair.collision.depth;
          if (impact > 1.5) {
            sounds.clack.volume(Math.min(impact / 10, 1.0));
            sounds.clack.play();
          }
        });
      });

      let animationFrameId: number;
      const update = () => {
        Matter.Engine.update(engine, 1000 / 60);
        bodies.forEach(({ body, el, width, height }) => {
          el.style.left = `${body.position.x - width / 2}px`;
          el.style.top = `${body.position.y - height / 2}px`;
          el.style.transform = `rotate(${body.angle}rad)`;
        });
        animationFrameId = requestAnimationFrame(update);
      };
      update();

      return () => { cancelAnimationFrame(animationFrameId); Matter.Engine.clear(engine); };
    }, 2500);

    return () => clearTimeout(timer);
  }, [gameOver.isOver, sounds]);

  const [opponents, setOpponents] = useState<Player[]>(
    players.filter(p => p.id !== localUserId).map(p => ({
      ...p, guesses: p.guesses && p.guesses.length > 0 ? p.guesses : Array.from({ length: 6 }, () => Array(5).fill('empty'))
    }))
  );

  const keyboardRows = [['Q','W','E','R','T','Y','U','I','O','P'], ['A','S','D','F','G','H','J','K','L'], ['ENTER','Z','X','C','V','B','N','M','BACKSPACE']];

  const updateKeyboard = useCallback((guessString: string, newRowStatuses: GuessStatus[]) => {
    setKeyboardStatuses((prev) => {
      const newKeyStatuses = { ...prev };
      guessString.split('').forEach((letter, i) => {
        const currentStatus = newKeyStatuses[letter];
        const newStatus = newRowStatuses[i];
        if (currentStatus === 'correct') return; 
        if (currentStatus === 'present' && newStatus === 'absent') return; 
        newKeyStatuses[letter] = newStatus;
      });
      return newKeyStatuses;
    });
  }, []);

  // --- BULLETPROOF NETWORK LISTENERS ---
  useEffect(() => {
    if (!room) return;

    const unsubGuess = room.onMessage('guess_result', ({ guessString, statuses: newRowStatuses }) => {
      const row = currentRowRef.current;
      setStatuses(prev => {
        const newStatuses = prev.map(r => [...r]);
        newStatuses[row] = newRowStatuses;
        return newStatuses;
      });
      updateKeyboard(guessString, newRowStatuses);
      
      animate(`#row-${row} .cell`, { rotateX: [-90, 0], scale: [0.8, 1], opacity: [0, 1], duration: 600, delay: stagger(150), ease: 'outBack' });
      for (let i = 0; i < 5; i++) setTimeout(() => sounds.pop.play(), i * 150);

      setCurrentRow(prev => prev + 1); 
      setCurrentCol(0); 
      setIsWaiting(false);
    });

    const unsubCoopSync = room.onMessage('coop_sync', ({ board: serverBoard, currentRow: serverRow, currentCol: serverCol }) => {
      setBoard(serverBoard); setCurrentRow(serverRow); setCurrentCol(serverCol);
    });

    const unsubCoopGuess = room.onMessage('coop_guess_result', ({ statuses: serverStatuses, currentRow: serverRow, currentCol: serverCol, guessString }) => {
      setStatuses(serverStatuses); updateKeyboard(guessString, serverStatuses[serverRow - 1]); 
      
      animate(`#row-${serverRow - 1} .cell`, { rotateX: [-90, 0], scale: [0.8, 1], opacity: [0, 1], duration: 600, delay: stagger(150), ease: 'outBack' });
      for (let i = 0; i < 5; i++) setTimeout(() => sounds.pop.play(), i * 150);

      setCurrentRow(serverRow); setCurrentCol(serverCol); setIsWaiting(false);
    });

    const unsubOpponent = room.onMessage('opponent_guessed', ({ playerId, statuses: newRowStatuses }) => {
      setOpponents((prev) => prev.map(opp => {
        if (opp.id === playerId) {
          const updatedGuesses = [...opp.guesses];
          const emptyRowIndex = updatedGuesses.findIndex(r => r[0] === 'empty');
          if (emptyRowIndex !== -1) updatedGuesses[emptyRowIndex] = newRowStatuses;
          return { ...opp, guesses: updatedGuesses };
        }
        return opp;
      }));
    });

    const unsubInvalid = room.onMessage('invalid_word', () => {
      const row = currentRowRef.current;
      animate(`#row-${row}`, { x: [-12, 12, -8, 8, -4, 4, 0], duration: 500, ease: 'outElastic(1, .5)' });
      setIsWaiting(false);
    });

    const unsubGameOver = room.onMessage('game_over', ({ winnerId, word }) => {
      setIsWaiting(true); sounds.bgm.stop(); 
      let msg = "";
      const row = currentRowRef.current;
      
      posthog.capture('match_completed', { winner: winnerId, mode: settings.mode, rows_used: row + 1, was_time_up: winnerId === 'time_up' });
      
      if (winnerId === 'time_up') {
        msg = "TIME'S UP!"; sounds.lose.play();
      } else if (winnerId === localUserId || settings.mode === 'coop') {
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 }, colors: ['#5865F2', '#57F287', '#FEE75C'] });
        msg = settings.mode === 'coop' ? "TEAM VICTORY!" : "VICTORY!";
        sounds.win.play();
        setTimeout(() => { animate(`#row-${row - 1} .cell`, { y: [0, -25, 0], duration: 500, delay: stagger(100), ease: 'outQuad' }); }, 800);
      } else {
        const winner = playersRef.current.find(p => p.id === winnerId);
        msg = `${winner?.name?.toUpperCase() || 'SOMEONE'} WON!`;
        sounds.lose.play(); 
      }
      setTimeout(() => setGameOver({ isOver: true, message: msg, word: word }), 1500);
    });

    return () => { 
      unsubGuess();
      unsubCoopSync();
      unsubCoopGuess();
      unsubOpponent();
      unsubInvalid();
      unsubGameOver();
    };
  }, [room, updateKeyboard, localUserId, settings.mode, sounds]);

  const handleInput = useCallback((key: string) => {
    if (currentRow > 5 || isWaiting || gameOver.isOver) return;

    animate(`#key-${key}`, { scale: [0.85, 1], duration: 250, ease: 'outQuad' });

    if (key === 'ENTER') {
      if (currentCol !== 5) {
        animate(`#row-${currentRow}`, { x: [-5, 5, -5, 5, 0], duration: 300, ease: 'outQuad' });
        return;
      }
      sounds.enter.play(); setIsWaiting(true);
      room.send('submit_guess', { guessString: board[currentRow].join('') });
      return;
    }

    if (key === 'BACKSPACE') {
      if (currentCol === 0) return; 
      sounds.del.play();
      animate(`#cell-${currentRow}-${currentCol - 1}`, { scale: [0.8, 1], duration: 200, ease: 'outQuad' });
      
      const newBoard = board.map(row => [...row]);
      newBoard[currentRow][currentCol - 1] = '';
      setBoard(newBoard); setCurrentCol(prev => prev - 1);
      if (settings.mode === 'coop') room.send('coop_input', { key });
      return;
    }

    if (/^[A-Z]$/.test(key)) {
      if (currentCol >= 5) return; 
      sounds.type.play();
      animate(`#cell-${currentRow}-${currentCol}`, { scale: [1.25, 1], duration: 300, ease: 'outElastic(1, .6)' });
      
      const newBoard = board.map(row => [...row]);
      newBoard[currentRow][currentCol] = key;
      setBoard(newBoard); setCurrentCol(prev => prev + 1);
      if (settings.mode === 'coop') room.send('coop_input', { key });
    }
  }, [board, currentRow, currentCol, isWaiting, room, settings.mode, gameOver.isOver, sounds]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.toUpperCase();
      if (key === 'BACKSPACE' || key === 'ENTER' || /^[A-Z]$/.test(key)) handleInput(key);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleInput]);

  return (
    <div className="game-container fade-in">
      {settings.timeLimit > 0 && timeRemaining <= 10 && timeRemaining > 0 && !gameOver.isOver && (
        <div className="countdown-flash">{timeRemaining}</div>
      )}

      {gameOver.isOver && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2 style={{ color: gameOver.message.includes("VICTORY") ? '#57F287' : '#ED4245' }}>{gameOver.message}</h2>
            <p className="modal-subtext">The secret word was:</p>
            <div className="secret-word">{gameOver.word}</div>
            <button className="btn-primary" onClick={onReturnToLobby} style={{ marginTop: '30px' }}>
              <LogOut size={20} style={{ marginRight: '8px' }}/> RETURN TO LOBBY
            </button>
          </div>
        </div>
      )}

      {/* --- CENTERED HEADER --- */}
      <div className="header">
        <div className="header-left">
          <button className="btn-quit" onClick={onReturnToLobby}>
            <LogOut size={16} /> QUIT MATCH
          </button>
        </div>

        <div className="header-center">
          <div className={`header-badge time-badge ${timeRemaining <= 10 && settings.timeLimit > 0 ? 'pulse-danger' : ''}`} 
              style={{ color: timeRemaining <= 30 && settings.timeLimit > 0 ? '#ED4245' : '#57F287', 
                      borderColor: timeRemaining <= 30 && settings.timeLimit > 0 ? 'rgba(237,66,69,0.2)' : 'rgba(87,242,135,0.2)'}}>
            <Timer size={18} />
            <span>{settings.timeLimit ? `${Math.floor(timeRemaining / 60)}:${(timeRemaining % 60).toString().padStart(2, '0')}` : 'UNLIMITED'}</span>
          </div>
          <div className="header-badge mode-badge">
            <Activity size={18} />
            <span>{settings.mode.replace('-', ' ')}</span>
          </div>
        </div>

        <div className="header-right">
          <div className="header-badge room-badge">
            <Hash size={18} />
            <span>{roomId.substring(0, 6)}</span>
          </div>
        </div>
      </div>

      {/* --- MAIN CONTENT (3-COLUMN GRID) --- */}
      <div className="main-content">
        <div className="board-wrapper">
          <div className="local-board">
            {board.map((row, rowIndex) => (
              <div key={rowIndex} id={`row-${rowIndex}`} className="row">
                {row.map((letter, colIndex) => {
                  const status = statuses[rowIndex][colIndex];
                  const isFilled = letter !== '';
                  return (
                    <div 
                      key={colIndex} id={`cell-${rowIndex}-${colIndex}`}
                      className={`cell ${status !== 'empty' ? status : ''} ${isFilled && status === 'empty' ? 'filled' : ''}`}
                    >
                      {letter}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          
          <div className="keyboard">
            <div className={`evaluating-text ${isWaiting && !gameOver.isOver ? 'visible' : ''}`}>
              <Loader2 size={14} className="spin-anim" style={{ marginRight: '6px' }}/> EVALUATING
            </div>
            
            {keyboardRows.map((row, i) => (
              <div key={i} className="keyboard-row">
                {row.map((key) => (
                  <button key={key} id={`key-${key}`} onClick={() => handleInput(key)} className={`key ${key.length > 1 ? 'wide' : ''} ${keyboardStatuses[key] || ''}`} disabled={isWaiting || gameOver.isOver}>
                    {key === 'BACKSPACE' ? '⌫' : key}
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {settings.mode !== 'coop' && (
          <div className="opponents-panel">
            <h3 className="panel-title"><Users size={16} /> OPPONENTS</h3>
            <div className="opponents-grid">
              {opponents.map((opp) => (
                <div key={opp.id} className="mini-player">
                  <span className="mini-name">{opp.name}</span>
                  <div className="mini-board">
                    {opp.guesses.map((row, rIndex) => (
                      <div key={rIndex} className="mini-row">
                        {row.map((status, cIndex) => <div key={cIndex} className={`mini-cell ${status}`}></div>)}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}