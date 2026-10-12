// Tactile and audible feedback for check-ins. Haptics are on unless the OS asks
// for reduced motion; the completion chime is opt-in.
const KEY = 'openhabit.feedback';

export interface FeedbackPrefs {
  sound: boolean;    // short chime when a habit is completed
  hideDone: boolean; // Today lists only what is still open
}

export function loadPrefs(): FeedbackPrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { sound: p.sound === true, hideDone: p.hideDone === true };
  } catch {
    return { sound: false, hideDone: false };
  }
}

export function savePrefs(p: FeedbackPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* private mode */ }
}

const reducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function haptic(pattern: number | number[]) {
  if (reducedMotion()) return;
  navigator.vibrate?.(pattern);
}

let ctx: AudioContext | null = null;

/** A soft two-note "done" chime (Web Audio, no asset to load). */
export function playDone() {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    const t0 = ctx.currentTime;
    [[659.25, 0], [987.77, 0.09]].forEach(([freq, at]) => {
      const osc = ctx!.createOscillator();
      const gain = ctx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.14, t0 + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.28);
      osc.connect(gain).connect(ctx!.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.3);
    });
  } catch { /* no audio available */ }
}
