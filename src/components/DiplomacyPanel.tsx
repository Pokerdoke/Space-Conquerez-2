import React, { useMemo } from 'react';
import type { GameState, Alliance } from '../types';
import { X, Handshake, ShieldX } from 'lucide-react';
import { generateId, isAllied } from '../services/gameLogic';
import { audio } from '../services/audio';

interface DiplomacyPanelProps {
  gameState: GameState;
  myPlayerId: string;
  onClose: () => void;
  onUpdateState: (newState: GameState) => void | Promise<void>;
}

const colorClass = {
  green: 'text-emerald-400 border-emerald-500/40 bg-emerald-950/20',
  blue: 'text-blue-400 border-blue-500/40 bg-blue-950/20',
  purple: 'text-violet-400 border-violet-500/40 bg-violet-950/20',
  yellow: 'text-amber-400 border-amber-500/40 bg-amber-950/20'
};

export const DiplomacyPanel: React.FC<DiplomacyPanelProps> = ({ gameState, myPlayerId, onClose, onUpdateState }) => {
  const me = gameState.players.find(p => p.id === myPlayerId);
  const isMyTurn = gameState.players[gameState.activePlayerIndex]?.id === myPlayerId;
  const opponents = gameState.players.filter(p => p.id !== myPlayerId);

  const pendingBreakIds = useMemo(() => new Set((gameState.alliances || [])
    .filter(a => a.status === 'breaking' && a.playerIds.includes(myPlayerId))
    .map(a => a.playerIds.find(id => id !== myPlayerId) || '')), [gameState.alliances, myPlayerId]);

  const updateAlliance = async (otherId: string, action: 'form' | 'break') => {
    if (!me) return;
    audio.playBeep(650, 0.06);
    const other = gameState.players.find(p => p.id === otherId);
    const alliances = [...(gameState.alliances || [])];
    let nextAlliances: Alliance[] = alliances;
    const existing = alliances.find(a => a.playerIds.includes(myPlayerId) && a.playerIds.includes(otherId));
    const log: string[] = [];

    if (action === 'form') {
      if (existing?.status === 'active') return;
      nextAlliances = alliances.filter(a => !(a.playerIds.includes(myPlayerId) && a.playerIds.includes(otherId)));
      nextAlliances.push({ id: generateId(), playerIds: [myPlayerId, otherId], status: 'active' });
      log.push(`${me.name} formed an alliance with ${other?.name || 'another empire'}. FTL inhibitors are now friendly and combat is blocked between them.`);
    } else {
      if (!existing || existing.status === 'breaking') return;
      nextAlliances = alliances.map(a => a.id === existing.id ? {
        ...a,
        status: 'breaking',
        breakRequestedBy: myPlayerId,
        breakEffectiveAfterPlayerId: myPlayerId
      } : a);
      log.push(`${me.name} will break alliance with ${other?.name || 'another empire'} after their action phase ends.`);
    }

    await onUpdateState({
      ...gameState,
      alliances: nextAlliances,
      actionLog: [...gameState.actionLog, ...log],
      lastAction: action === 'form' ? 'alliance_formed' : 'alliance_break_requested',
      lastActionAt: new Date().toISOString()
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-950 border border-slate-800 rounded-lg shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-slate-900/70">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-[0.25em] text-cyan-400">Empire Diplomacy</div>
            <h2 className="text-lg font-bold text-white">Alliances</h2>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        <div className="p-4 space-y-3">
          <p className="text-xs text-slate-400 leading-relaxed">
            Allies can pass through each other's FTL inhibitors and cannot invade or fire on each other. Breaking an alliance takes effect after your Attack/Action phase ends.
          </p>
          {!isMyTurn && <div className="text-[10px] text-slate-500 bg-slate-900 border border-slate-800 rounded p-2">Diplomacy changes are safest during your active turn.</div>}
          {opponents.map(player => {
            const allied = isAllied(gameState, myPlayerId, player.id);
            const pendingBreak = pendingBreakIds.has(player.id);
            return (
              <div key={player.id} className={`p-3 rounded border ${colorClass[player.color]} flex items-center justify-between gap-3`}>
                <div>
                  <div className="font-bold text-sm">{player.name}</div>
                  <div className="text-[10px] font-mono opacity-80">
                    {pendingBreak ? 'Break pending after your action phase' : allied ? 'Alliance active' : 'No alliance'}
                  </div>
                </div>
                {allied || pendingBreak ? (
                  <button
                    disabled={pendingBreak}
                    onClick={() => updateAlliance(player.id, 'break')}
                    className="min-h-[44px] px-3 py-2 text-xs font-bold uppercase rounded border border-rose-500/50 bg-rose-950/30 text-rose-300 disabled:opacity-40 flex items-center gap-1"
                  >
                    <ShieldX className="h-3.5 w-3.5" /> Break
                  </button>
                ) : (
                  <button
                    onClick={() => updateAlliance(player.id, 'form')}
                    className="min-h-[44px] px-3 py-2 text-xs font-bold uppercase rounded border border-emerald-500/50 bg-emerald-950/30 text-emerald-300 flex items-center gap-1"
                  >
                    <Handshake className="h-3.5 w-3.5" /> Ally
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
