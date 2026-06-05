// Web Audio API synthesizer for retro-futuristic sci-fi sound effects

class AudioEngine {
  private ctx: AudioContext | null = null;
  private volume: number = 0.3; // Default volume (0.0 to 1.0)
  private enabled: boolean = true;

  constructor() {
    // Lazy initialize on first interaction to comply with browser autoplay policies
    const savedVolume = localStorage.getItem('void_empires_volume');
    if (savedVolume !== null) {
      this.volume = parseFloat(savedVolume);
    }
    const savedEnabled = localStorage.getItem('void_empires_audio_enabled');
    if (savedEnabled !== null) {
      this.enabled = savedEnabled === 'true';
    }
  }

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  setVolume(vol: number) {
    this.volume = Math.max(0, Math.min(1, vol));
    localStorage.setItem('void_empires_volume', this.volume.toString());
  }

  getVolume() {
    return this.volume;
  }

  setEnabled(val: boolean) {
    this.enabled = val;
    localStorage.setItem('void_empires_audio_enabled', val.toString());
    if (val) {
      this.initCtx();
    }
  }

  isEnabled() {
    return this.enabled;
  }

  private createGainNode(ctx: AudioContext, duration: number, customVolumeMult: number = 1.0) {
    const gain = ctx.createGain();
    const finalVolume = this.volume * customVolumeMult;
    gain.gain.setValueAtTime(finalVolume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
    gain.connect(ctx.destination);
    return gain;
  }

  // Play a simple crisp beep (button click, node selection)
  playBeep(freq = 600, duration = 0.08) {
    if (!this.enabled) return;
    try {
      const ctx = this.initCtx();
      const osc = ctx.createOscillator();
      const gain = this.createGainNode(ctx, duration, 0.4);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Play an action confirm sound (building or upgrading)
  playBuild() {
    if (!this.enabled) return;
    try {
      const ctx = this.initCtx();
      const duration = 0.3;
      const gain = this.createGainNode(ctx, duration, 0.6);

      const osc1 = ctx.createOscillator();
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(150, ctx.currentTime);
      osc1.frequency.linearRampToValueAtTime(400, ctx.currentTime + duration);

      osc1.connect(gain);
      osc1.start();
      osc1.stop(ctx.currentTime + duration);

      // Add a subtle high-frequency click at the start
      this.playBeep(800, 0.05);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Play movement sound (ship warp / jump)
  playMove() {
    if (!this.enabled) return;
    try {
      const ctx = this.initCtx();
      const duration = 0.5;
      const gain = this.createGainNode(ctx, duration, 0.5);

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      
      // Sweep down frequency for a thruster-like sound
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + duration);

      // Low-pass filter to make it warmer/bassier
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(500, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(150, ctx.currentTime + duration);

      osc.connect(filter);
      filter.connect(gain);

      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Play space laser combat sound
  playLaser() {
    if (!this.enabled) return;
    try {
      const ctx = this.initCtx();
      const duration = 0.25;
      const gain = this.createGainNode(ctx, duration, 0.5);

      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      
      // Fast sweeping frequency downwards (laser "pew")
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(220, ctx.currentTime + duration);

      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Play explosion sound (when a ship or ground unit dies)
  playExplosion() {
    if (!this.enabled) return;
    try {
      const ctx = this.initCtx();
      const duration = 0.6;
      const gain = this.createGainNode(ctx, duration, 0.8);

      // Create a buffer of white noise
      const bufferSize = ctx.sampleRate * duration;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noiseNode = ctx.createBufferSource();
      noiseNode.buffer = buffer;

      // Low-pass filter to sound like an explosion rather than static
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + duration);

      noiseNode.connect(filter);
      filter.connect(gain);

      noiseNode.start();
      noiseNode.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Play colony upgrade or colonize sound (ascending arpeggio)
  playColonize() {
    if (!this.enabled) return;
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
      
      notes.forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const duration = 0.25;
        const startTime = now + index * 0.08;

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, startTime);

        gain.gain.setValueAtTime(this.volume * 0.4, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + duration);
      });
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Play next phase sound
  playNextPhase() {
    if (!this.enabled) return;
    try {
      const ctx = this.initCtx();
      const duration = 0.4;
      const gain = this.createGainNode(ctx, duration, 0.4);

      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(220, ctx.currentTime + duration / 2);
      osc.frequency.linearRampToValueAtTime(200, ctx.currentTime + duration);

      osc.connect(gain);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }

  // Play game victory fanfare
  playVictory() {
    if (!this.enabled) return;
    try {
      const ctx = this.initCtx();
      const now = ctx.currentTime;
      
      // Simple arpeggio chords
      const notes = [
        // Chord 1 (Major 7th vibe)
        { f: 196.00, d: 0.8, delay: 0 },   // G3
        { f: 293.66, d: 0.8, delay: 0.1 }, // D4
        { f: 392.00, d: 0.8, delay: 0.2 }, // G4
        { f: 493.88, d: 0.8, delay: 0.3 }, // B4
        // High melody
        { f: 587.33, d: 1.5, delay: 0.55 }, // D5
        { f: 783.99, d: 2.0, delay: 0.75 }, // G5
      ];

      notes.forEach(note => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const startTime = now + note.delay;

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.f, startTime);

        gain.gain.setValueAtTime(this.volume * 0.4, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + note.d);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + note.d);
      });
    } catch (e) {
      console.warn('Audio play failed:', e);
    }
  }
}

export const audio = new AudioEngine();
