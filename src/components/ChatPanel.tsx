import React, { useState, useRef, useEffect } from 'react';
import type { GameState } from '../types';
import { sendRoomChatMessage } from '../services/database';
import { audio } from '../services/audio';
import { MessageSquare, Send, X } from 'lucide-react';

interface ChatPanelProps {
  code: string;
  gameState: GameState;
  myPlayerId: string;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ code, gameState, myPlayerId }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [msgText, setMsgText] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  
  const me = gameState.players.find(p => p.id === myPlayerId);

  useEffect(() => {
    if (isOpen) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [gameState.chat, isOpen]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!msgText.trim() || !me) return;

    audio.playBuild();
    const textToSend = msgText.trim();
    setMsgText('');
    
    try {
      await sendRoomChatMessage(code, me, textToSend);
    } catch (err) {
      console.error('Chat error:', err);
    }
  };

  const colors = {
    green: 'text-emerald-400',
    blue: 'text-blue-400',
    purple: 'text-violet-400',
    yellow: 'text-amber-400'
  };

  return (
    <>
      {/* Floating Chat Trigger button */}
      {!isOpen && (
        <button
          onClick={() => { audio.playBeep(); setIsOpen(true); }}
          className="fixed left-4 bottom-20 z-20 flex items-center space-x-1.5 px-3 py-2 bg-slate-900/90 border border-slate-800 rounded-full shadow-lg hover:border-indigo-500 text-slate-300 hover:text-white transition-all duration-200"
        >
          <MessageSquare className="h-4.5 w-4.5" />
          <span className="text-xs font-bold uppercase tracking-wider font-mono">Chat ({gameState.chat.length})</span>
        </button>
      )}

      {/* Slide-out Chat Panel Drawer */}
      {isOpen && (
        <div className="fixed inset-y-0 left-0 w-80 max-w-full z-40 bg-slate-900/95 border-r border-slate-800 glass-panel shadow-2xl flex flex-col animate-slideRight">
          
          {/* Drawer Header */}
          <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/40">
            <div className="flex items-center space-x-2 text-indigo-400 font-bold uppercase tracking-wider text-sm font-mono">
              <MessageSquare className="h-4 w-4" />
              <span>Tactical Comms Link</span>
            </div>
            <button
              onClick={() => { audio.playBeep(); setIsOpen(false); }}
              className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Messages List Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 font-mono text-[11px]">
            {gameState.chat.length === 0 ? (
              <div className="text-slate-600 italic text-center py-8">
                Transmission link established. Send a secure encrypted message...
              </div>
            ) : (
              gameState.chat.map((msg) => (
                <div key={msg.id} className="space-y-0.5 break-all">
                  <div className="flex justify-between items-center text-[9px] text-slate-500">
                    <span className={`font-bold ${colors[msg.playerColor as keyof typeof colors] || 'text-indigo-400'}`}>
                      {msg.playerName}
                    </span>
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <p className="text-slate-200 leading-normal bg-slate-950/40 border border-slate-900/40 p-2 rounded">
                    {msg.text}
                  </p>
                </div>
              ))
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Message Input Footer Form */}
          <form onSubmit={handleSend} className="p-3 border-t border-slate-800 bg-slate-950/30 flex space-x-2">
            <input
              type="text"
              placeholder="Encrypt message..."
              value={msgText}
              onChange={(e) => setMsgText(e.target.value)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="p-2 bg-indigo-950/50 border border-indigo-500/50 text-indigo-400 hover:bg-indigo-900/40 rounded transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>

        </div>
      )}
    </>
  );
};
