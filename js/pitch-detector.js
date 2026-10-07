/* Real-time pitch detection from the microphone using time-domain autocorrelation
 * with parabolic interpolation for sub-sample accuracy. Runs independently of the
 * metronome's audio scheduler via requestAnimationFrame, so both work at once. */

const PitchDetector = (() => {
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const RMS_THRESHOLD = 0.01;
  const MIN_FREQ = 40;
  const MAX_FREQ = 2000;

  let audioCtx = null;
  let analyser = null;
  let mediaStream = null;
  let source = null;
  let buffer = null;
  let rafId = null;
  let onUpdate = null;
  let running = false;
  let a4 = 440;

  function setA4(freq) {
    a4 = freq;
  }

  async function start(ctx, updateCallback) {
    audioCtx = ctx;
    onUpdate = updateCallback;
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    source = audioCtx.createMediaStreamSource(mediaStream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    buffer = new Float32Array(analyser.fftSize);
    running = true;
    loop();
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
    if (source) source.disconnect();
    mediaStream = null;
    source = null;
    analyser = null;
  }

  // A autocorrelação é pesada (2048 × 1024 contas): 20 vezes por segundo basta para o ponteiro
  // e deixa o celular livre para o metrônomo não atrasar.
  const INTERVALO_MS = 50;
  let ultimo = 0;
  function loop(agora) {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    if (agora && agora - ultimo < INTERVALO_MS) return;
    ultimo = agora || 0;
    analyser.getFloatTimeDomainData(buffer);
    const result = autoCorrelate(buffer, audioCtx.sampleRate);
    if (onUpdate) onUpdate(result);
  }

  function autoCorrelate(buf, sampleRate) {
    const size = buf.length;

    let rms = 0;
    for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    if (rms < RMS_THRESHOLD) return null;

    const threshold = 0.2;
    let r1 = 0;
    let r2 = size - 1;
    for (let i = 0; i < size / 2; i++) {
      if (Math.abs(buf[i]) < threshold) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < size / 2; i++) {
      if (Math.abs(buf[size - i]) < threshold) {
        r2 = size - i;
        break;
      }
    }

    const trimmed = buf.slice(r1, r2);
    const n = trimmed.length;
    if (n < 8) return null;

    const c = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let j = 0; j < n - i; j++) sum += trimmed[j] * trimmed[j + i];
      c[i] = sum;
    }

    let d = 0;
    while (d < n - 1 && c[d] > c[d + 1]) d++;

    let maxVal = -1;
    let maxPos = -1;
    for (let i = d; i < n; i++) {
      if (c[i] > maxVal) {
        maxVal = c[i];
        maxPos = i;
      }
    }
    if (maxPos <= 0) return null;

    let t0 = maxPos;
    const x1 = c[t0 - 1] || 0;
    const x2 = c[t0] || 0;
    const x3 = t0 + 1 < n ? c[t0 + 1] : 0;
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a !== 0) t0 = t0 - b / (2 * a);

    const freq = sampleRate / t0;
    if (!isFinite(freq) || freq < MIN_FREQ || freq > MAX_FREQ) return null;

    return freqToNote(freq);
  }

  function freqToNote(freq) {
    const semitoneOffset = 12 * (Math.log(freq / a4) / Math.log(2));
    const midi = Math.round(semitoneOffset) + 69;
    const name = NOTE_NAMES[((midi % 12) + 12) % 12];
    const octave = Math.floor(midi / 12) - 1;
    const noteFreq = a4 * Math.pow(2, (midi - 69) / 12);
    const cents = Math.round(1200 * (Math.log(freq / noteFreq) / Math.log(2)));
    return { frequency: freq, note: name, octave, cents };
  }

  return {
    start,
    stop,
    setA4,
    get isRunning() {
      return running;
    },
  };
})();
