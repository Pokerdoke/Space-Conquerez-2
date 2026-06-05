import React, { useMemo } from 'react';
import type { GameState, Alliance } from '../types';
import { X, ShieldX, Check, XCircle, Send, Clock } from 'lucide-react';
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

function relationBetween(alliances: Alliance[] | undefined, playerA: string, playerB: string): Alliance | undefined {
  return (alliances || []).find(a => a.playerIds.includes(playerA) && a.playerIds.includes(playerB));
}

export const DiplomacyPanel: React.FC<DiplomacyPanelProps> = ({ gameState, myPlayerId, onClose, onUpdateState }) => {
  const me = gameState.players.find(p => p.id === myPlayerId);
  const isMyTurn = gameState.players[gameState.activePlayerIndex]?.id === myPlayerId;
  const opponents = gameState.players.filter(p => p.id !== myPlayerId);

  const pendingBreakIds = useMemo(() => new Set((gameState.alliances || [])
    .filter(a => a.status === 'breaking' && a.playerIds.includes(myPlayerId))
    .map(a => a.playerIds.find(id => id !== myPlayerId) || '')), [gameState.alliances, myPlayerId]);

  const incomingRequests = useMemo(() => (gameState.alliances || [])
    .filter(a => a.status === 'pending' && a.playerIds.includes(myPlayerId) && a.requestedBy !== myPlayerId),
    [gameState.alliances, myPlayerId]
  );

  const writeDiplomacyState = async (nextAlliances: Alliance[], log: string[], lastAction: string) => {
    await onUpdateState({
      ...gameState,
      alliances: nextAlliances,
      actionLog: [...gameState.actionLog, ...log],
      lastAction,
      lastActionAt: new Date().toISOString()
    });
  };

  const sendRequest = async (otherId: string) => {
    if (!me) return;
    audio.playBeep(650, 0.06);
    const other = gameState.players.find(p => p.id === otherId);
    const now = new Date().toISOString();
    const alliances = [...(gameState.alliances || [])];
    const existing = relationBetween(alliances, myPlayerId, otherId);

    if (existing?.status === 'active' || existing?.status === 'breaking') return;

    const nextAlliances = alliances.filter(a => !(a.playerIds.includes(myPlayerId) && a.playerIds.includes(otherId)));
    nextAlliances.push({
      id: generateId(),
      playerIds: [myPlayerId, otherId],
      status: 'pending',
      requestedBy: myPlayerId,
      requestedAt: now
    });

    await writeDiplomacyState(
      nextAlliances,
      [`${me.name} sent an alliance request to ${other?.name || 'another empire'}. Effects begin only if they accept.`],
      'alliance_request_sent'
    );
  };

  const respondToRequest = async (request: Alliance, accepted: boolean) => {
    if (!me || request.status !== 'pending' || request.requestedBy === myPlayerId) return;
    audio.playBeep(accepted ? 850 : 220, 0.08);
    const requesterId = request.requestedBy || request.playerIds.find(id => id !== myPlayerId);
    const requester = gameState.players.find(p => p.id === requesterId);
    const now = new Date().toISOString();

    const nextAlliances = (gameState.alliances || []).map(a => {
      if (a.id !== request.id) return a;
      return {
        ...a,
        status: accepted ? 'active' : 'declined',
        respondedBy: myPlayerId,
        respondedAt: now
      } as Alliance;
    });

    await writeDiplomacyState(
      nextAlliances,
      accepted
        ? [`${me.name} accepted ${requester?.name || 'another empire'}'s alliance request. Alliance effects are now active.`]
        : [`${me.name} declined ${requester?.name || 'another empire'}'s alliance request.`],
      accepted ? 'alliance_request_accepted' : 'alliance_request_declined'
    );
  };

  const breakAlliance = async (otherId: string) => {
    if (!me) return;
    audio.playBeep(420, 0.06);
    const other = gameState.players.find(p => p.id === otherId);
    const alliances = [...(gameState.alliances || [])];
    const existing = relationBetween(alliances, myPlayerId, otherId);
    if (!existing || existing.status !== 'active') return;

    const nextAlliances: Alliance[] = alliances.map(a => a.id === existing.id ? {
      ...a,
      status: 'breaking' as const,
      breakRequestedBy: myPlayerId,
      breakEffectiveAfterPlayerId: myPlayerId
    } : a);

    await writeDiplomacyState(
      nextAlliances,
      [`${me.name} will break alliance with ${other?.name || 'another empire'} after their action phase ends.`],
      'alliance_break_requested'
    );
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

        <div className="p-4 space-y-3 max-h-[75vh] overflow-y-auto">
          <p className="text-xs text-slate-400 leading-relaxed">
            Send alliance offers, then wait for the other empire to accept. Alliance effects do not activate while a request is pending. Accepted allies can pass each other's FTL inhibitors and cannot invade or fire on each other. Breaking an alliance takes effect after the breaker's Action phase ends.
          </p>
          {!isMyTurn && <div className="text-[10px] text-slate-500 bg-slate-900 border border-slate-800 rounded p-2">Diplomacy requests and responses can be handled outside your turn. Combat/movement actions are still locked to the active player.</div>}

          {incomingRequests.length > 0 && (
            <div className="space-y-2 p-3 rounded border border-cyan-500/40 bg-cyan-950/20">
              <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-300">Incoming Requests</div>
              {incomingRequests.map(req => {
                const requester = gameState.players.find(p => p.id === req.requestedBy);
                return (
                  <div key={req.id} className="flex items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 rounded p-2">
                    <div>
                      <div className="text-xs text-white font-bold">{requester?.name || 'Unknown Empire'}</div>
                      <div className="text-[10px] text-slate-400">wants an alliance</div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => respondToRequest(req, true)} className="min-h-[44px] px-3 py-2 text-xs font-bold uppercase rounded border border-emerald-500/50 bg-emerald-950/30 text-emerald-300 flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" /> Accept
                      </button>
                      <button onClick={() => respondToRequest(req, false)} className="min-h-[44px] px-3 py-2 text-xs font-bold uppercase rounded border border-rose-500/50 bg-rose-950/30 text-rose-300 flex items-center gap-1">
                        <XCircle className="h-3.5 w-3.5" /> Decline
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {opponents.map(player => {
            const alliance = relationBetween(gameState.alliances, myPlayerId, player.id);
            const allied = isAllied(gameState, myPlayerId, player.id);
            const pendingBreak = pendingBreakIds.has(player.id);
            const incoming = alliance?.status === 'pending' && alliance.requestedBy === player.id;
            const outgoing = alliance?.status === 'pending' && alliance.requestedBy === myPlayerId;
            const declinedByOther = alliance?.status === 'declined' && alliance.requestedBy === myPlayerId && alliance.respondedBy === player.id;
            const declinedByMe = alliance?.status === 'declined' && alliance.requestedBy === player.id && alliance.respondedBy === myPlayerId;
            return (
              <div key={player.id} className={`p-3 rounded border ${colorClass[player.color]} flex items-center justify-between gap-3`}>
                <div>
                  <div className="font-bold text-sm">{player.name}</div>
                  <div className="text-[10px] font-mono opacity-80">
                    {pendingBreak
                      ? 'Break pending after your action phase'
                      : allied
                        ? 'Alliance active'
                        : incoming
                          ? 'Alliance request received'
                          : outgoing
                            ? 'Request sent — waiting for response'
                            : declinedByOther
                              ? 'Your request was declined'
                              : declinedByMe
                                ? 'You declined their request'
                                : 'No alliance'}
                  </div>
                </div>
                {allied || pendingBreak ? (
                  <button
                    disabled={pendingBreak}
                    onClick={() => breakAlliance(player.id)}
                    className="min-h-[44px] px-3 py-2 text-xs font-bold uppercase rounded border border-rose-500/50 bg-rose-950/30 text-rose-300 disabled:opacity-40 flex items-center gap-1"
                  >
                    <ShieldX className="h-3.5 w-3.5" /> Break
                  </button>
                ) : incoming && alliance ? (
                  <div className="flex gap-1">
                    <button onClick={() => respondToRequest(alliance, true)} className="min-h-[44px] px-2 py-2 text-xs font-bold uppercase rounded border border-emerald-500/50 bg-emerald-950/30 text-emerald-300 flex items-center gap-1">
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => respondToRequest(alliance, false)} className="min-h-[44px] px-2 py-2 text-xs font-bold uppercase rounded border border-rose-500/50 bg-rose-950/30 text-rose-300 flex items-center gap-1">
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : outgoing ? (
                  <button disabled className="min-h-[44px] px-3 py-2 text-xs font-bold uppercase rounded border border-slate-600 bg-slate-900/70 text-slate-400 disabled:opacity-60 flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" /> Pending
                  </button>
                ) : (
                  <button
                    onClick={() => sendRequest(player.id)}
                    className="min-h-[44px] px-3 py-2 text-xs font-bold uppercase rounded border border-emerald-500/50 bg-emerald-950/30 text-emerald-300 flex items-center gap-1"
                  >
                    <Send className="h-3.5 w-3.5" /> Request
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
