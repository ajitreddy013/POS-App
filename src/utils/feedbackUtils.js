// Web Audio API feedback utility to play sounds and vibrations
const playTone = (frequency, type, duration) => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, ctx.currentTime);

    // Smooth envelope to prevent popping sounds
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + duration);
  } catch (err) {
    // Silent fail if AudioContext is blocked or unsupported
  }
};

export const playSuccessFeedback = () => {
  // Play double chime: high C tone followed by a higher E tone
  playTone(523.25, "sine", 0.15); // C5
  setTimeout(() => {
    playTone(659.25, "sine", 0.20); // E5
  }, 100);

  // Vibrate: two short pulses
  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100]);
  }
};

export const playErrorFeedback = () => {
  // Play buzzer tone
  playTone(150, "sawtooth", 0.40);

  // Vibrate: one long buzz or multiple heavy buzzes
  if (navigator.vibrate) {
    navigator.vibrate([300, 100, 300]);
  }
};

export const playIncomingOrderChime = () => {
  // Play a pleasant triple notification chime: D5 -> E5 -> A5
  playTone(587.33, "sine", 0.12);
  setTimeout(() => {
    playTone(659.25, "sine", 0.12);
  }, 100);
  setTimeout(() => {
    playTone(880.00, "sine", 0.22);
  }, 200);

  if (navigator.vibrate) {
    navigator.vibrate([100, 50, 100, 50, 150]);
  }
};
