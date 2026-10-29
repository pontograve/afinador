/* Real-time pitch detection from the microphone using time-domain autocorrelation
 * with parabolic interpolation for sub-sample accuracy. Runs independently of the
 * metronome's audio scheduler via requestAnimationFrame, so both work at once. */

const PitchDetector = (() => {
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  // Menos sensível a barulho (10/2026): portão de volume que se adapta ao ruído do ambiente,
  // filtro na faixa do baixo, exigência de nota "limpa" (clareza) e mediana das últimas leituras.
  const RMS_MIN = 0.015;        // volume mínimo absoluto
  const PORTAO_X_RUIDO = 3;     // a nota precisa estar 3× acima do ruído medido do ambiente
  const CLAREZA_MIN = 0.88;     // 0 a 1: quanto o sinal se parece com uma nota periódica (voz e barulho ficam abaixo)
  const MIN_FREQ = 28;          // Si grave do baixo de 5 cordas ≈ 30,9 Hz
  const MAX_FREQ = 1000;        // harmônicos e notas agudas do baixo cabem; o resto é ruído
  let ruido = 0.005;            // média do ruído quando não há nota
  const ultimas = [];           // últimas frequências válidas (mediana)

  let audioCtx = null;
  let analyser = null;
  let mediaStream = null;
  let source = null;
  let buffer = null;
  let metade = null;   // a janela reduzida pela metade (média de 2 em 2): mesma conta de antes, janela 2× mais longa
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
    analyser.fftSize = 4096;   // janela de ~85 ms: o Mi grave (41 Hz) cabe com folga e a medida fica precisa
    // só a faixa do baixo chega ao detector: corta ronco abaixo de ~25 Hz e chiado acima de ~1,2 kHz
    const passaAlta = audioCtx.createBiquadFilter(); passaAlta.type = 'highpass'; passaAlta.frequency.value = 25;
    const passaBaixa = audioCtx.createBiquadFilter(); passaBaixa.type = 'lowpass'; passaBaixa.frequency.value = 1200;
    source.connect(passaAlta).connect(passaBaixa).connect(analyser);
    ruido = 0.005; ultimas.length = 0;
    buffer = new Float32Array(analyser.fftSize);
    metade = new Float32Array(analyser.fftSize / 2);
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
    for (let i = 0; i < metade.length; i++) metade[i] = (buffer[2 * i] + buffer[2 * i + 1]) / 2;
    const bruto = autoCorrelate(metade, audioCtx.sampleRate / 2);
    let result = null;
    if (bruto) {
      // mediana das últimas 5 leituras: um pico solto de barulho não mexe o ponteiro
      ultimas.push(bruto); if (ultimas.length > 5) ultimas.shift();
      const ord = [...ultimas].sort((a, b) => a - b);
      if (ultimas.length >= 3) result = freqToNote(ord[Math.floor(ord.length / 2)]);
    } else if (ultimas.length) ultimas.shift();   // silêncio: esvazia aos poucos
    if (onUpdate) onUpdate(result);
  }

  function autoCorrelate(buf, sampleRate) {
    const size = buf.length;

    let rms = 0;
    for (let i = 0; i < size; i++) rms += buf[i] * buf[i];
    rms = Math.sqrt(rms / size);
    // portão adaptativo: aprende o ruído do ambiente enquanto ninguém toca
    if (rms < Math.max(RMS_MIN, ruido * PORTAO_X_RUIDO)) { ruido = ruido * 0.95 + rms * 0.05; return null; }

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
    // clareza: correlação normalizada no período encontrado (nota limpa ≈ 1; voz, ruído e batidas ficam abaixo).
    // Normaliza pela energia dos dois trechos que se sobrepõem, senão as notas graves (período longo) sairiam sempre baixas.
    let e1 = 0, e2 = 0;
    for (let j = 0; j < n - maxPos; j++) { e1 += trimmed[j] * trimmed[j]; e2 += trimmed[j + maxPos] * trimmed[j + maxPos]; }
    if (e1 <= 0 || e2 <= 0 || maxVal / Math.sqrt(e1 * e2) < CLAREZA_MIN) return null;

    let t0 = maxPos;
    const x1 = c[t0 - 1] || 0;
    const x2 = c[t0] || 0;
    const x3 = t0 + 1 < n ? c[t0 + 1] : 0;
    const a = (x1 + x3 - 2 * x2) / 2;
    const b = (x3 - x1) / 2;
    if (a !== 0) t0 = t0 - b / (2 * a);

    const freq = sampleRate / t0;
    if (!isFinite(freq) || freq < MIN_FREQ || freq > MAX_FREQ) return null;

    return freq;
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
