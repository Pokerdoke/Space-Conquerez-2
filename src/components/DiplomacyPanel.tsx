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
  yellow: 'text-amber-400 border-amber-500/40 bg-amber-950/20',
  red: 'text-red-400 border-red-500/40 bg-red-950/20',
  cyan: 'text-cyan-400 border-cyan-500/40 bg-cyan-950/20',
  orange: 'text-orange-400 border-orange-500/40 bg-orange-950/20',
  pink: 'text-pink-400 border-pink-500/40 bg-pink-950/20'
};

export const DiplomacyPanel: React.FC<DiplomacyPanelProps> = ({ gameState, myPlayerId, onClose, onUpdateState }) => {
  const me = gameState.players.find(p => p.id === myPlayerId);
  const opponents = gameState.players.filter(p => p.id !== myPlayerId);

  const pendingBreakIds = useMemo(() => new Set((gameState.alliances || [])
    .filter(a => a.status === 'breaking' && a.playerIds.includes(myPlayerId))
    .map(a => a.playerIds.find(id => id !== myPlayerId) || '')), [gameState.alliances, myPlayerId]);

  const updateAlliance = async (otherId: string, action: 'request' | 'accept' | 'cancel' | 'decline' | 'break') => {
    if (!me) return;
    audio.playBeep(650, 0.06);
    const other = gameState.players.find(p => p.id === otherId);
    const alliances = [...(gameState.alliances || [])];
    const existing = alliances.find(a => a.playerIds.includes(myPlayerId) && a.playerIds.includes(otherId));
    let nextAlliances: Alliance[] = alliances;
    const log: string[] = [];

    if (action === 'request') {
      if (existing) return;
      nextAlliances = [...alliances, { id: generateId(), playerIds: [myPlayerId, otherId], status: 'requested', requestedBy: myPlayerId }];
      log.push(`${me.name} sent an alliance request to ${other?.name || 'another empire'}.`);
    } else if (action === 'accept') {
      if (!existing || existing.status !== 'requested' || existing.requestedBy === myPlayerId) return;
      nextAlliances = alliances.map(a => a.id === existing.id ? { ...a, status: 'active', requestedBy: undefined } : a);
      log.push(`${me.name} accepted ${other?.name || 'another empire'}'s alliance request. FTL inhibitors are friendly and combat is blocked between allies.`);
    } else if (action === 'cancel' || action === 'decline') {
      if (!existing || existing.status !== 'requested') return;
      nextAlliances = alliances.filter(a => a.id !== existing.id);
      log.push(action === 'decline'
        ? `${me.name} declined ${other?.name || 'another empire'}'s alliance request.`
        : `${me.name} cancelled the alliance request with ${other?.name || 'another empire'}.`);
    } else {
      if (!existing || existing.status !== 'active') return;
      nextAlliances = alliances.filter(a => a.id !== existing.id);
      log.push(`${me.name} ended the alliance with ${other?.name || 'another empire'}.`);
    }

    await onUpdateState({
      ...gameState,
      alliances: nextAlliances,
      actionLog: [...gameState.actionLog, ...log],
      lastAction: action === 'request' ? 'alliance_requested' : action === 'accept' ? 'alliance_accepted' : action === 'decline' ? 'alliance_declined' : action === 'cancel' ? 'alliance_request_cancelled' : 'alliance_ended',
      lastActionAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
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
            Send an alliance request first. The other commander must accept it before alliance rules activate.
          </p>
          {opponents.map(player => {
            const alliance = (gameState.alliances || []).find(a => a.playerIds.includes(myPlayerId) && a.playerIds.includes(player.id));
            const allied = isAllied(gameState, myPlayerId, player.id);
            const pendingBreak = pendingBreakIds.has(player.id);
            const requestFromMe = alliance?.status === 'requested' && alliance.requestedBy === myPlayerId;
            const requestToMe = alliance?.status === 'requested' && alliance.requestedBy !== myPlayerId;
            return (
              <div key={player.id} className={`p-3 rounded border ${colorClass[player.color]} flex items-center justify-between gap-3`}>
                <div>
                  <div className="font-bold text-sm">{player.name}</div>
                  <div className="text-[10px] font-mono opacity-80">
                    {pendingBreak ? 'Alliance ending' : allied ? 'Alliance active' : requestFromMe ? 'Request sent' : requestToMe ? 'Request received' : 'No alliance'}
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
                ) : requestToMe ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => updateAlliance(player.id, 'decline')}
                      className="min-h-[44px] px-3 py-2 text-xs font-bold uppercase rounded border border-rose-500/50 bg-rose-950/30 text-rose-300 flex items-center gap-1"
                    >
                      Decline
                    </button>
                    <button
                      onClick={() => updateAlliance(player.id, 'accept')}
                      className="min-h-[44px] px-3 py-2 text-xs font-bold uppercase rounded border border-emerald-500/50 bg-emerald-950/30 text-emerald-300 flex items-center gap-1"
                    >
                      <Handshake className="h-3.5 w-3.5" /> Accept
                    </button>
                  </div>
                ) : requestFromMe ? (
                  <button
                    onClick={() => updateAlliance(player.id, 'cancel')}
                    className="min-h-[44px] px-3 py-2 text-xs font-bold uppercase rounded border border-slate-600 bg-slate-900/60 text-slate-300 flex items-center gap-1"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    onClick={() => updateAlliance(player.id, 'request')}
                    className="min-h-[44px] px-3 py-2 text-xs font-bold uppercase rounded border border-emerald-500/50 bg-emerald-950/30 text-emerald-300 flex items-center gap-1"
                  >
                    <Handshake className="h-3.5 w-3.5" /> Request
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
