import React, { useState } from 'react';
import { audio } from '../services/audio';
import { Volume2, VolumeX } from 'lucide-react';

export const SoundToggle: React.FC = () => {
  const [enabled, setEnabled] = useState(() => audio.isEnabled());

  const handleToggle = () => {
    const nextVal = !enabled;
    audio.setEnabled(nextVal);
    setEnabled(nextVal);
    if (nextVal) {
      audio.playBeep(600, 0.05);
    }
  };

  return (
    <button
      onClick={handleToggle}
      title={enabled ? 'Mute Sounds' : 'Unmute Sounds'}
      className="fixed right-4 bottom-20 z-20 flex items-center justify-center p-2.5 bg-slate-900/90 border border-slate-800 rounded-full shadow-lg hover:border-indigo-500 text-slate-300 hover:text-white transition-all duration-200"
    >
      {enabled ? <Volume2 className="h-4.5 w-4.5" /> : <VolumeX className="h-4.5 w-4.5 text-slate-500" />}
    </button>
  );
};
