import React, { useEffect, useState } from 'react';
import type { GameState } from '../types';
import {
  createGameRoom,
  joinGameRoom,
  updateRoomState,
  updateLobbySettings,
  getSavedPlayerName,
  listPublicGameRooms,
  subscribeToPublicGameRooms,
  type PublicGameSummary
} from '../services/database';
import { generateMap } from '../services/gameLogic';
import {
  Users,
  Copy,
  Check,
  ShieldAlert,
  Play,
  ArrowRight,
  Settings,
  GraduationCap,
  Globe2,
  RefreshCw,
  SlidersHorizontal,
  Lock,
  Unlock
} from 'lucide-react';
import { Tutorial } from './Tutorial';
import type { TutorialScenarioId } from '../services/tutorialScenarios';
import { audio } from '../services/audio';

interface LobbyProps {
  onGameStart: (code: string, myPlayerId: string) => void;
  onOpenSettings: () => void;
  dbMode: 'local' | 'supabase';
  onStartTutorialScenario: (scenarioId: TutorialScenarioId) => void;
}

type LobbyView = 'welcome' | 'create' | 'join' | 'public' | 'waiting' | 'tutorial';

export const Lobby: React.FC<LobbyProps> = ({ onGameStart, onOpenSettings, dbMode, onStartTutorialScenario }) => {
  const [view, setView] = useState<LobbyView>('welcome');
  const [playerName, setPlayerName] = useState(() => getSavedPlayerName());
  const [roomCode, setRoomCode] = useState('');
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(2);
  const [mapSize, setMapSize] = useState<GameState['mapSize']>('small');
  const [npcCount, setNpcCount] = useState<3 | 5 | 7>(3);
  const [isPublic, setIsPublic] = useState(true);

  // Active Lobby State
  const [currentCode, setCurrentCode] = useState('');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [myPlayerId, setMyPlayerId] = useState('');
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [subscription, setSubscription] = useState<{ unsubscribe: () => void } | null>(null);

  // Public game browser
  const [publicGames, setPublicGames] = useState<PublicGameSummary[]>([]);
  const [publicLoading, setPublicLoading] = useState(false);

  const savePlayerName = (name: string) => {
    setPlayerName(name);
    localStorage.setItem('void_empires_player_name', name);
  };

  const findMyPlayerId = (state: GameState, fallbackName: string) => {
    const savedId = localStorage.getItem('void_empires_player_id');
    return (
      state.players.find(p => p.id === savedId)?.id ||
      state.players.find(p => p.name.trim().toLowerCase() === fallbackName.trim().toLowerCase())?.id ||
      state.players[state.players.length - 1]?.id ||
      ''
    );
  };

  useEffect(() => {
    const code = localStorage.getItem('void_empires_active_game');
    const savedId = localStorage.getItem('void_empires_player_id');
    if (!code || !savedId) return;
    let cancelled = false;
    setLoading(true);
    joinGameRoom(code, getSavedPlayerName())
      .then((state) => {
        if (cancelled) return;
        const player = state.players.find(p => p.id === savedId);
        if (!player) {
          localStorage.removeItem('void_empires_active_game');
          return;
        }
        setCurrentCode(code);
        setGameState(state);
        setMyPlayerId(player.id);
        if (state.status === 'playing') {
          onGameStart(code, player.id);
        } else {
          setView('waiting');
          subscribeLobby(code, player.id);
        }
      })
      .catch(() => {
        localStorage.removeItem('void_empires_active_game');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
    // run only once on app launch
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (view !== 'public') return;
    setPublicLoading(true);
    const unsub = subscribeToPublicGameRooms((rooms) => {
      setPublicGames(rooms);
      setPublicLoading(false);
    });
    return unsub;
  }, [view]);

  const handleCreateLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setErrorMsg('Please enter your name');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    audio.playBuild();
    
    try {
      savePlayerName(playerName);
      const { code, state } = await createGameRoom(playerName.trim(), maxPlayers, mapSize, npcCount, isPublic);
      
      setCurrentCode(code);
      setGameState(state);
      setMyPlayerId(state.players[0].id);
      setView('waiting');
      subscribeLobby(code, state.players[0].id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create room.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinState = (code: string, state: GameState) => {
    const myId = findMyPlayerId(state, playerName);
    setCurrentCode(code);
    setGameState(state);
    setMyPlayerId(myId);
    setView('waiting');
    subscribeLobby(code, myId);
  };

  const handleJoinLobby = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) {
      setErrorMsg('Please enter your name');
      return;
    }
    if (!roomCode.trim()) {
      setErrorMsg('Please enter a room code');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    audio.playBuild();

    try {
      savePlayerName(playerName);
      const code = roomCode.trim().toUpperCase();
      const state = await joinGameRoom(code, playerName.trim());
      handleJoinState(code, state);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to join room.');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinPublicGame = async (code: string) => {
    if (!playerName.trim()) {
      setErrorMsg('Please enter your name before joining a public game.');
      return;
    }
    setErrorMsg('');
    setLoading(true);
    audio.playBuild();
    try {
      savePlayerName(playerName);
      const state = await joinGameRoom(code, playerName.trim());
      handleJoinState(code, state);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to join public game.');
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshPublicGames = async () => {
    setPublicLoading(true);
    audio.playBeep();
    try {
      setPublicGames(await listPublicGameRooms());
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not refresh public games.');
    } finally {
      setPublicLoading(false);
    }
  };

  const subscribeLobby = (code: string, myId: string) => {
    if (subscription) {
      subscription.unsubscribe();
    }

    import('../services/database').then((db) => {
      const unsub = db.subscribeToRoom(code, (newState) => {
        setGameState(newState);
        if (newState.status === 'playing') {
          unsub();
          onGameStart(code, myId);
        }
      });
      setSubscription({ unsubscribe: unsub });
    });
  };

  const handleToggleReady = async () => {
    if (!gameState || !currentCode) return;
    audio.playBeep(400, 0.06);

    const updatedPlayers = gameState.players.map(p => {
      if (p.id === myPlayerId) {
        return { ...p, ready: !p.ready };
      }
      return p;
    });

    const updatedState: GameState = {
      ...gameState,
      players: updatedPlayers,
      actionLog: [
        ...gameState.actionLog,
        `${gameState.players.find(p => p.id === myPlayerId)?.name} is ${
          !gameState.players.find(p => p.id === myPlayerId)?.ready ? 'READY' : 'NOT READY'
        }`
      ],
      lastAction: 'ready_toggle',
      lastActionAt: new Date().toISOString()
    };

    setGameState(updatedState);
    await updateRoomState(currentCode, updatedState);
  };

  const handleHostSettingsChange = async (changes: Partial<Pick<GameState, 'maxPlayers' | 'mapSize' | 'npcCount' | 'isPublic'>>) => {
    if (!gameState || !currentCode || settingsSaving) return;
    setErrorMsg('');
    setSettingsSaving(true);
    audio.playBeep(600, 0.05);
    try {
      const updatedState = await updateLobbySettings(currentCode, gameState, myPlayerId, changes);
      setGameState(updatedState);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not update lobby settings.');
    } finally {
      setSettingsSaving(false);
    }
  };

  const handleStartGame = async () => {
    if (!gameState || !currentCode) return;
    audio.playVictory();

    const mapNodeCounts = {
      small: 30,
      medium: 60,
      large: 100
    };
    const nodeCount = mapNodeCounts[gameState.mapSize];
    const nodes = generateMap(nodeCount, gameState.players, gameState.npcCount);

    const updatedState: GameState = {
      ...gameState,
      status: 'playing',
      nodes,
      actionLog: [...gameState.actionLog, 'Game started by creator! Good luck commanders!'],
      turnStartedAt: new Date().toISOString(),
      lastAction: 'start_game',
      lastActionAt: new Date().toISOString()
    };

    setGameState(updatedState);
    await updateRoomState(currentCode, updatedState);
  };

  const copyRoomCode = () => {
    if (!currentCode) return;
    navigator.clipboard.writeText(currentCode);
    setCopied(true);
    audio.playBeep(800, 0.05);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeaveLobby = () => {
    audio.playBeep();
    if (subscription) {
      subscription.unsubscribe();
      setSubscription(null);
    }
    setView('welcome');
    setGameState(null);
    setCurrentCode('');
  };

  const playerColorHex = {
    green: 'text-emerald-400 border-emerald-500 bg-emerald-950/20',
    blue: 'text-blue-400 border-blue-500 bg-blue-950/20',
    purple: 'text-violet-400 border-violet-500 bg-violet-950/20',
    yellow: 'text-amber-400 border-amber-500 bg-amber-950/20'
  };

  const isHost = Boolean(gameState && myPlayerId === gameState.creatorId);
  const containerWidth = view === 'tutorial' ? 'max-w-5xl' : view === 'public' || view === 'waiting' ? 'max-w-2xl' : 'max-w-md';

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 text-slate-100 select-none relative overflow-hidden bg-slate-950">
      <div className="starfield" />
      
      <button 
        onClick={onOpenSettings}
        className="absolute top-4 right-4 flex items-center space-x-1 px-3 py-1.5 rounded bg-slate-900/80 border border-slate-800 text-xs text-slate-400 hover:text-white transition-all duration-200 z-10"
      >
        <Settings className="h-3.5 w-3.5" />
        <span>Settings</span>
        <span className={`inline-block w-2 h-2 rounded-full ml-1 ${dbMode === 'supabase' ? 'bg-blue-400 animate-pulse' : 'bg-emerald-400'}`} />
      </button>

      <div className={`w-full ${containerWidth} z-10`}>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-extrabold tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500 drop-shadow-[0_0_20px_rgba(99,102,241,0.6)] select-none uppercase">
            Space Conquererz 2
          </h1>
          <p className="text-xs uppercase tracking-wider text-slate-300 mt-2 font-mono">
            Real-time 4X Galactic Strategy
          </p>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 border border-rose-500/40 bg-rose-950/20 text-rose-300 rounded text-sm flex items-center space-x-2 animate-pulse">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {view === 'welcome' && (
          <div className="glass-panel p-6 space-y-6 rounded-lg border border-slate-800/80">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Commander Name</label>
              <input
                type="text"
                placeholder="Enter commander name..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={18}
                className="w-full bg-slate-950 border border-slate-800 rounded px-4 py-3 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors uppercase font-mono tracking-wider"
              />
            </div>

            <div className="space-y-3">
              <button
                onClick={() => { audio.playBeep(); setView('create'); }}
                className="w-full scifi-btn scifi-btn-primary py-3.5 flex items-center justify-center space-x-2 text-base"
              >
                <span>Found New Empire</span>
                <ArrowRight className="h-4 w-4" />
              </button>
              
              <button
                onClick={() => { audio.playBeep(); setView('public'); }}
                className="w-full scifi-btn py-3.5 flex items-center justify-center space-x-2 text-base border-emerald-500/40 text-emerald-300 bg-emerald-950/10 hover:border-emerald-400 hover:bg-emerald-950/30"
              >
                <Globe2 className="h-4 w-4" />
                <span>Browse Public Games</span>
              </button>

              <button
                onClick={() => { audio.playBeep(); setView('join'); }}
                className="w-full scifi-btn scifi-btn-secondary py-3.5 flex items-center justify-center space-x-2 text-base"
              >
                <span>Join by Room Code</span>
              </button>

              <button
                onClick={() => { audio.playBeep(); setView('tutorial'); }}
                className="w-full scifi-btn py-3.5 flex items-center justify-center space-x-2 text-base border-cyan-500/40 text-cyan-300 bg-cyan-950/10 hover:border-cyan-400 hover:bg-cyan-950/30"
              >
                <GraduationCap className="h-4 w-4" />
                <span>Tutorial Academy</span>
              </button>
            </div>
          </div>
        )}

        {view === 'tutorial' && (
          <Tutorial onExit={() => { audio.playBeep(); setView('welcome'); }} onStartScenario={onStartTutorialScenario} />
        )}

        {view === 'create' && (
          <form onSubmit={handleCreateLobby} className="glass-panel p-6 space-y-5 rounded-lg border border-slate-800/80">
            <h2 className="text-lg font-bold uppercase tracking-wider text-indigo-400 mb-2">Empire Setup</h2>
            
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Commander Name</label>
              <input
                type="text"
                placeholder="Enter commander name..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Players</label>
                <select
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value) as 2 | 3 | 4)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value={2}>2 Players</option>
                  <option value={3}>3 Players</option>
                  <option value={4}>4 Players</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">NPC Planets</label>
                <select
                  value={npcCount}
                  onChange={(e) => setNpcCount(Number(e.target.value) as 3 | 5 | 7)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
                >
                  <option value={3}>3 NPC Systems</option>
                  <option value={5}>5 NPC Systems</option>
                  <option value={7}>7 NPC Systems</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Map Size</label>
              <div className="grid grid-cols-3 gap-2">
                {(['small', 'medium', 'large'] as GameState['mapSize'][]).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => { audio.playBeep(); setMapSize(size); }}
                    className={`py-2 text-xs font-bold uppercase border rounded ${
                      mapSize === size
                        ? 'border-indigo-500 bg-indigo-950/20 text-indigo-400 shadow-[0_0_10px_rgba(99,102,241,0.2)]'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    {size}
                    <span className="block text-[8px] opacity-60 font-mono mt-0.5">
                      {size === 'small' ? '30 nodes' : size === 'medium' ? '60 nodes' : '100 nodes'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => { audio.playBeep(); setIsPublic(v => !v); }}
              className={`w-full flex items-center justify-between px-4 py-3 rounded border transition-all ${
                isPublic
                  ? 'border-emerald-500/50 bg-emerald-950/20 text-emerald-300'
                  : 'border-slate-700 bg-slate-950/70 text-slate-400'
              }`}
            >
              <span className="flex items-center space-x-2 text-sm font-bold uppercase tracking-wider">
                {isPublic ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                <span>{isPublic ? 'Public Game' : 'Private Game'}</span>
              </span>
              <span className="text-[10px] font-mono opacity-75">
                {isPublic ? 'Appears in browser' : 'Room code only'}
              </span>
            </button>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => { audio.playBeep(); setView('welcome'); }}
                className="w-1/3 scifi-btn hover:text-white"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 scifi-btn scifi-btn-primary"
              >
                {loading ? 'Generating...' : 'Form Lobby'}
              </button>
            </div>
          </form>
        )}

        {view === 'public' && (
          <div className="glass-panel p-6 space-y-5 rounded-lg border border-slate-800/80 max-h-[78vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-2">
                  <Globe2 className="h-5 w-5" /> Public Games
                </h2>
                <p className="text-xs text-slate-500 mt-1">Click Join to enter an open lobby. No room code needed.</p>
              </div>
              <button
                type="button"
                onClick={handleRefreshPublicGames}
                className="px-3 py-2 rounded bg-slate-950 border border-slate-800 text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${publicLoading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Commander Name</label>
              <input
                type="text"
                placeholder="Enter commander name..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                maxLength={18}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            {dbMode === 'local' && (
              <div className="p-3 rounded border border-amber-500/30 bg-amber-950/10 text-amber-300 text-xs">
                Local mode only shows lobbies from this browser. Use Supabase mode on Netlify for internet public games.
              </div>
            )}

            <div className="space-y-3">
              {publicLoading && publicGames.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-8 border border-dashed border-slate-800 rounded animate-pulse">
                  Scanning public sectors...
                </div>
              ) : publicGames.length === 0 ? (
                <div className="text-center text-sm text-slate-500 py-8 border border-dashed border-slate-800 rounded">
                  No public lobbies open right now. Create one and leave Public Game enabled.
                </div>
              ) : (
                publicGames.map(game => (
                  <div key={game.code} className="p-4 rounded-lg border border-slate-800 bg-slate-950/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-lg font-extrabold tracking-widest text-indigo-300">{game.code}</span>
                        <span className="text-[10px] uppercase px-2 py-0.5 rounded border border-emerald-500/30 bg-emerald-950/20 text-emerald-300">Public</span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        Host: <span className="text-slate-200 font-bold">{game.hostName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 font-mono uppercase">
                        {game.playerCount}/{game.maxPlayers} players • {game.mapSize} map • {game.npcCount} NPC systems
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={loading || game.playerCount >= game.maxPlayers}
                      onClick={() => handleJoinPublicGame(game.code)}
                      className="scifi-btn scifi-btn-secondary px-5 py-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Joining...' : 'Join'}
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="flex space-x-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                onClick={() => { audio.playBeep(); setView('welcome'); }}
                className="w-1/2 scifi-btn hover:text-white"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => { audio.playBeep(); setView('create'); }}
                className="w-1/2 scifi-btn scifi-btn-primary"
              >
                Host Public Game
              </button>
            </div>
          </div>
        )}

        {view === 'join' && (
          <form onSubmit={handleJoinLobby} className="glass-panel p-6 space-y-5 rounded-lg border border-slate-800/80">
            <h2 className="text-lg font-bold uppercase tracking-wider text-indigo-400 mb-2">Join Empire</h2>
            
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Commander Name</label>
              <input
                type="text"
                placeholder="Enter commander name..."
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Sector Room Code</label>
              <input
                type="text"
                placeholder="E.g. A4D82K"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                maxLength={6}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-3 text-center text-lg font-mono font-bold tracking-widest text-indigo-400 uppercase focus:outline-none focus:border-indigo-500"
              />
            </div>

            <button
              type="button"
              onClick={() => { audio.playBeep(); setView('public'); }}
              className="w-full scifi-btn border-emerald-500/40 text-emerald-300 bg-emerald-950/10 hover:border-emerald-400 hover:bg-emerald-950/30"
            >
              Browse Public Games Instead
            </button>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => { audio.playBeep(); setView('welcome'); }}
                className="w-1/3 scifi-btn hover:text-white"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="w-2/3 scifi-btn scifi-btn-secondary"
              >
                {loading ? 'Connecting...' : 'Connect Sector'}
              </button>
            </div>
          </form>
        )}

        {view === 'waiting' && gameState && (
          <div className="glass-panel p-6 space-y-6 rounded-lg border border-slate-800/80 max-h-[82vh] overflow-y-auto">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-500">Sector Code</span>
                <div className="text-2xl font-mono font-bold tracking-widest text-indigo-400">
                  {currentCode}
                </div>
              </div>
              <button
                onClick={copyRoomCode}
                className="flex items-center space-x-1 px-3 py-2 rounded bg-slate-950 border border-slate-800 text-xs font-semibold text-slate-400 hover:text-white transition-all duration-200 active:scale-95"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Code'}</span>
              </button>
            </div>

            {isHost && gameState.status === 'lobby' && (
              <div className="p-4 rounded-lg border border-indigo-500/30 bg-indigo-950/10 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-300 flex items-center gap-2">
                    <SlidersHorizontal className="h-4 w-4" /> Host Lobby Settings
                  </h3>
                  {settingsSaving && <span className="text-[10px] font-mono text-slate-400 animate-pulse">Saving...</span>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Players</label>
                    <select
                      value={gameState.maxPlayers}
                      disabled={settingsSaving}
                      onChange={(e) => handleHostSettingsChange({ maxPlayers: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    >
                      <option value={2}>2 Players</option>
                      <option value={3}>3 Players</option>
                      <option value={4}>4 Players</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">NPC Systems</label>
                    <select
                      value={gameState.npcCount}
                      disabled={settingsSaving}
                      onChange={(e) => handleHostSettingsChange({ npcCount: Number(e.target.value) })}
                      className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    >
                      <option value={3}>3 NPC</option>
                      <option value={5}>5 NPC</option>
                      <option value={7}>7 NPC</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    disabled={settingsSaving}
                    onClick={() => handleHostSettingsChange({ isPublic: !(gameState.isPublic !== false) })}
                    className={`px-3 py-2 rounded border text-xs font-bold uppercase flex items-center justify-center gap-2 disabled:opacity-50 ${
                      gameState.isPublic !== false
                        ? 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300'
                        : 'border-slate-700 bg-slate-950 text-slate-400'
                    }`}
                  >
                    {gameState.isPublic !== false ? <Unlock className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                    {gameState.isPublic !== false ? 'Public' : 'Private'}
                  </button>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 uppercase font-bold mb-1">Map Size</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['small', 'medium', 'large'] as GameState['mapSize'][]).map(size => (
                      <button
                        key={size}
                        type="button"
                        disabled={settingsSaving}
                        onClick={() => handleHostSettingsChange({ mapSize: size })}
                        className={`py-2 text-xs font-bold uppercase border rounded disabled:opacity-50 ${
                          gameState.mapSize === size
                            ? 'border-indigo-500 bg-indigo-950/30 text-indigo-300'
                            : 'border-slate-800 bg-slate-950 text-slate-500 hover:text-slate-200'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!isHost && gameState.status === 'lobby' && (
              <div className="p-3 rounded border border-slate-800 bg-slate-950/40 text-xs text-slate-400">
                The host can change map size, player slots, NPC systems, and public/private status before launch. Your screen updates live.
              </div>
            )}

            <div className="grid grid-cols-4 gap-2 text-center text-xs bg-slate-950/50 border border-slate-800/40 p-2.5 rounded font-mono">
              <div>
                <span className="text-[9px] text-slate-500 block">MAP SIZE</span>
                <span className="text-slate-300 font-bold uppercase">{gameState.mapSize}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 block">NPC</span>
                <span className="text-slate-300 font-bold">{gameState.npcCount}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 block">CAPACITY</span>
                <span className="text-slate-300 font-bold">{gameState.players.length}/{gameState.maxPlayers}</span>
              </div>
              <div>
                <span className="text-[9px] text-slate-500 block">VISIBILITY</span>
                <span className={`font-bold ${gameState.isPublic !== false ? 'text-emerald-300' : 'text-slate-400'}`}>{gameState.isPublic !== false ? 'PUBLIC' : 'PRIVATE'}</span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center">
                <Users className="h-3.5 w-3.5 mr-1.5" />
                <span>Sector Control Slots</span>
              </label>

              <div className="space-y-3">
                {Array.from({ length: gameState.maxPlayers }).map((_, idx) => {
                  const player = gameState.players[idx];
                  if (player) {
                    const isMe = player.id === myPlayerId;
                    return (
                      <div
                        key={player.id}
                        className={`flex justify-between items-center p-3 border rounded-lg transition-all duration-200 ${playerColorHex[player.color]}`}
                      >
                        <div className="flex items-center space-x-2.5">
                          <span className="text-[9px] font-mono border px-1.5 py-0.5 rounded opacity-75 uppercase">
                            P{idx + 1}
                          </span>
                          <span className="font-bold tracking-wide text-sm">
                            {player.name} {isMe && <span className="text-[10px] text-slate-400 font-normal ml-1">(You)</span>}
                          </span>
                        </div>
                        <div>
                          {isMe ? (
                            <button
                              type="button"
                              onClick={handleToggleReady}
                              className={`px-3 py-1 text-xs font-bold uppercase rounded border transition-all ${
                                player.ready
                                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                  : 'bg-slate-950 border-slate-700 text-slate-400 hover:border-slate-500'
                              }`}
                            >
                              {player.ready ? 'Ready' : 'Not Ready'}
                            </button>
                          ) : (
                            <span className={`text-xs font-bold uppercase px-2.5 py-1 rounded border ${
                              player.ready
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400'
                                : 'bg-slate-950/40 border-slate-900/60 text-slate-500'
                            }`}>
                              {player.ready ? 'Ready' : 'Joining...'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div
                      key={`empty-${idx}`}
                      className="flex justify-between items-center p-3 border border-dashed border-slate-800 bg-slate-950/20 rounded-lg text-slate-600 text-sm font-mono"
                    >
                      <span>Waiting for Commander...</span>
                      <span className="text-xs animate-pulse font-bold tracking-widest text-slate-700">LISTENING</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 space-y-3">
              {isHost ? (
                <button
                  type="button"
                  onClick={handleStartGame}
                  disabled={
                    gameState.players.length < gameState.maxPlayers ||
                    !gameState.players.every(p => p.ready)
                  }
                  className="w-full scifi-btn scifi-btn-primary py-3.5 flex items-center justify-center space-x-2 text-base disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Play className="h-4.5 w-4.5 fill-current" />
                  <span>Initialize Sector Map</span>
                </button>
              ) : (
                <div className="text-center text-xs font-mono text-slate-500 py-3 bg-slate-950/40 border border-slate-900 rounded animate-pulse">
                  Waiting for Sector Host to initiate warp sequence...
                </div>
              )}

              <button
                type="button"
                onClick={handleLeaveLobby}
                className="w-full scifi-btn hover:text-white py-2"
              >
                Disconnect & Return
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
