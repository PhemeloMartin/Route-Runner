/** Tiny synthesized sound effects (WebAudio) - no audio files, works offline. */
let ctx: AudioContext | null = null;
let enabled = true;

export function setSound(on: boolean) {
  enabled = on;
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', gain = 0.08) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + dur);
  o.connect(g).connect(ctx.destination);
  o.start(ctx.currentTime + start);
  o.stop(ctx.currentTime + start + dur + 0.02);
}

export function sfx(kind: 'xp' | 'correct' | 'wrong' | 'level' | 'achievement' | 'open' | 'click' | 'hit') {
  if (!enabled) return;
  try {
    ctx ??= new AudioContext();
    switch (kind) {
      case 'click':
        return tone(660, 0, 0.05, 'square', 0.03);
      case 'open':
        return tone(520, 0, 0.08, 'triangle', 0.04);
      case 'correct':
        tone(660, 0, 0.1);
        return tone(990, 0.08, 0.15);
      case 'wrong':
        return tone(180, 0, 0.25, 'sawtooth', 0.05);
      case 'hit':
        return tone(120, 0, 0.15, 'square', 0.06);
      case 'xp':
        tone(880, 0, 0.08);
        return tone(1320, 0.06, 0.12);
      case 'achievement':
        [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.2, 'triangle'));
        return;
      case 'level':
        [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.08, 0.25, 'triangle', 0.07));
        return;
    }
  } catch {
    /* audio not available */
  }
}

/** Read text aloud with the OS voices (works offline on Windows). */
export function speak(text: string, voiceName?: string) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[*_#`|>]/g, ''));
  const voices = window.speechSynthesis.getVoices();
  const v = voices.find((x) => x.name === voiceName) ?? voices.find((x) => /en-ZA|en-GB|en-US/.test(x.lang));
  if (v) u.voice = v;
  u.rate = 0.98;
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
