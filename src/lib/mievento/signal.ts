const SOUND_KEY = "mievento-sound";

export function signalEnabled(): boolean {
  if (typeof localStorage === "undefined") return true;
  return localStorage.getItem(SOUND_KEY) !== "0";
}

export function setSignalEnabled(on: boolean) {
  localStorage.setItem(SOUND_KEY, on ? "1" : "0");
}

export function playSignal(ok: boolean) {
  if (!signalEnabled()) return;
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctx) {
      const ctx = new Ctx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = ok ? 880 : 196;
      gain.gain.value = 0.045;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + (ok ? 0.12 : 0.32));
      osc.onended = () => void ctx.close();
    }
  } catch {
    /* audio optional */
  }
  try {
    navigator.vibrate?.(ok ? 35 : [28, 40, 28]);
  } catch {
    /* vibration optional */
  }
}
