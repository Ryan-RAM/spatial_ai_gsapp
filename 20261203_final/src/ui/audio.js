// Sound (ROADMAP M9.1), synthesized with the Web Audio API like week 20261103 (no files): the wind
// from the record, a low drone and a heartbeat that rise as the creature gets near the followed
// survivor, and the creak of roots when that survivor hears it. Off until the user turns it on
// (browsers only allow sound after a click); suspended while the page is hidden.
export function makeAudio() {
  let ac = null; let master = null; let wind = null; let windBp = null; let drone = null; let on = false; let nextBeat = 0; let beatGap = 0;
  const noise = (sec = 3) => { const b = ac.createBuffer(1, ac.sampleRate * sec, ac.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; return b; };
  function init() {
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ac = new AC(); master = ac.createGain(); master.gain.value = 0.7; master.connect(ac.destination);
    const src = ac.createBufferSource(); src.buffer = noise(4); src.loop = true;
    windBp = ac.createBiquadFilter(); windBp.type = 'bandpass'; windBp.frequency.value = 420; windBp.Q.value = 0.6;
    const lfo = ac.createOscillator(); lfo.frequency.value = 0.07; const lg = ac.createGain(); lg.gain.value = 240; lfo.connect(lg).connect(windBp.frequency);
    wind = ac.createGain(); wind.gain.value = 0; src.connect(windBp).connect(wind).connect(master); src.start(); lfo.start();
    const o1 = ac.createOscillator(); const o2 = ac.createOscillator(); o1.type = o2.type = 'sawtooth'; o1.frequency.value = 43; o2.frequency.value = 43.7;
    const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150; drone = ac.createGain(); drone.gain.value = 0;
    o1.connect(lp); o2.connect(lp); lp.connect(drone).connect(master); o1.start(); o2.start();
    document.addEventListener('visibilitychange', () => { if (!ac) return; if (document.hidden) ac.suspend(); else if (on) ac.resume(); });
    return true;
  }
  function thump(t, f, peak) {
    const o = ac.createOscillator(); const g = ac.createGain(); o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.3);
  }
  return {
    get on() { return on; },
    toggle() { if (!ac && !init()) return false; on = !on; if (on) ac.resume(); else ac.suspend(); return on; },
    // windMs from the record; danger 0..1 (the creature's closeness to the followed survivor)
    update(windMs, danger) {
      if (!ac || !on) return; const t = ac.currentTime;
      wind.gain.setTargetAtTime(0.03 + Math.min(1, windMs / 12) * 0.12, t, 0.5); windBp.Q.setTargetAtTime(0.4 + Math.min(1, windMs / 12), t, 0.5);
      drone.gain.setTargetAtTime(0.12 * danger * danger, t, 0.4);
      beatGap = danger > 0.15 ? 1.1 - 0.65 * danger : 0;
      if (beatGap && t >= nextBeat) { thump(t, 52, 0.5 * danger + 0.15); thump(t + 0.16, 46, 0.35 * danger + 0.1); nextBeat = t + beatGap; }
    },
    creak() {
      if (!ac || !on) return; const t = ac.currentTime; const s = ac.createBufferSource(); s.buffer = noise(0.6);
      const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 9; f.frequency.setValueAtTime(260, t); f.frequency.linearRampToValueAtTime(140, t + 0.5);
      const g = ac.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
      s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + 0.6);
    },
  };
}
