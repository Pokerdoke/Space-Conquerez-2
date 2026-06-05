import React, { useState, useEffect } from 'react';
import { getSupabaseConfig, saveSupabaseConfig } from '../services/supabaseClient';
import { getDbMode, setDbMode } from '../services/database';
import type { DbMode } from '../services/database';
import { Database, Wifi, WifiOff, X, Check, Copy } from 'lucide-react';
import { audio } from '../services/audio';

interface SettingsDialogProps {
  onClose: () => void;
  onModeChanged?: () => void;
}

export const SettingsDialog: React.FC<SettingsDialogProps> = ({ onClose, onModeChanged }) => {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [mode, setMode] = useState<DbMode>('local');
  const [copied, setCopied] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const config = getSupabaseConfig();
    setUrl(config.url);
    setKey(config.key);
    setMode(getDbMode());
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    audio.playBuild();
    saveSupabaseConfig(url, key);
    setDbMode(mode);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      if (onModeChanged) onModeChanged();
      onClose();
    }, 1000);
  };

  const copySqlSchema = () => {
    const sql = `-- Void Empires multiplayer schema
create table if not exists public.games (
  id text primary key,
  state jsonb not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  status text default 'lobby' check (status in ('lobby', 'active', 'finished'))
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  game_id text references public.games(id) on delete cascade,
  display_name text not null,
  player_number int check (player_number between 1 and 4),
  joined_at timestamptz default now(),
  is_ready boolean default false
);

alter table public.games enable row level security;
alter table public.players enable row level security;
create policy "allow all games" on public.games for all using (true) with check (true);
create policy "allow all players" on public.players for all using (true) with check (true);
alter publication supabase_realtime add table public.games;
alter publication supabase_realtime add table public.players;`;

    navigator.clipboard.writeText(sql);
    setCopied(true);
    audio.playBeep(800, 0.05);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md border border-slate-700 bg-slate-900/95 p-6 shadow-2xl rounded-lg glass-panel">
        
        {/* Close Button */}
        <button 
          onClick={() => { audio.playBeep(); onClose(); }}
          className="absolute right-4 top-4 text-slate-400 hover:text-white"
        >
          <X className="h-6 w-6" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <Database className="h-6 w-6 text-blue-400" />
          <h2 className="text-xl font-bold uppercase tracking-wider text-blue-400">Database Engine Settings</h2>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          {/* Mode Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Sync Mode</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { audio.playBeep(); setMode('local'); }}
                className={`flex items-center justify-center p-3 border font-semibold text-sm transition-all duration-200 rounded-md ${
                  mode === 'local'
                    ? 'border-emerald-500 bg-emerald-950/30 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.2)]'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                }`}
              >
                <WifiOff className="h-4 w-4 mr-2" />
                Local Sandbox
              </button>
              <button
                type="button"
                onClick={() => { audio.playBeep(); setMode('supabase'); }}
                className={`flex items-center justify-center p-3 border font-semibold text-sm transition-all duration-200 rounded-md ${
                  mode === 'supabase'
                    ? 'border-blue-500 bg-blue-950/30 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.2)]'
                    : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700'
                }`}
              >
                <Wifi className="h-4 w-4 mr-2" />
                Supabase Cloud
              </button>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              {mode === 'local' 
                ? 'Syncs rooms in real time across browser tabs/windows on this machine via BroadcastChannel.' 
                : 'Syncs globally using a remote Supabase Postgres DB & Realtime publication.'}
            </p>
          </div>

          {/* Supabase Inputs */}
          {mode === 'supabase' && (
            <div className="space-y-4 border-t border-slate-800 pt-4 animate-slideDown">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Supabase Project URL</label>
                <input
                  type="url"
                  required
                  placeholder="https://your-project.supabase.co"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">Supabase Anon Key API Key</label>
                <input
                  type="password"
                  required
                  placeholder="eyJhbGciOi..."
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* SQL setup copy helper */}
              <div className="bg-slate-950/50 border border-slate-800 rounded p-3 text-xs">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-semibold text-slate-300">Required Postgres SQL Schema:</span>
                  <button
                    type="button"
                    onClick={copySqlSchema}
                    className="flex items-center text-blue-400 hover:text-blue-300"
                  >
                    {copied ? <Check className="h-3 w-3 mr-1" /> : <Copy className="h-3 w-3 mr-1" />}
                    {copied ? 'Copied' : 'Copy SQL'}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 leading-normal">
                  You must create the <code className="text-slate-400">games</code> and <code className="text-slate-400">players</code> tables and enable Realtime. The full version is also in supabase_schema.sql.
                </p>
              </div>
            </div>
          )}

          {/* Form Actions */}
          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={() => { audio.playBeep(); onClose(); }}
              className="w-1/3 scifi-btn hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`w-2/3 scifi-btn scifi-btn-primary flex items-center justify-center`}
            >
              {saveSuccess ? 'Saved Config!' : 'Apply Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
