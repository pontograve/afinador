/* Precise audio-clock scheduler ("lookahead scheduling" pattern) so the beat
 * never drifts, even if the tab is backgrounded or the main thread stalls briefly. */

const MetronomeEngine = (() => {
  // No celular o navegador às vezes segura o JavaScript por mais de 100 ms (coleta de lixo, rolagem,
  // economia de bateria); com folga de 0,25 s as batidas já estão agendadas no relógio de áudio.
  const SCHEDULE_AHEAD_SEC = 0.25;
  const LOOKAHEAD_MS = 25;

  let audioCtx = null;
  let timerId = null;
  let currentStep = 0;
  let nextStepTime = 0;
  let bpm = 90;
  let pattern = null;
  let playing = false;
  let onStep = null;

  function stepDuration() {
    return 60 / bpm / pattern.subdivision;
  }

  function scheduler() {
    // Se o app ficou parado (tela apagada, aba em segundo plano), não toca as batidas atrasadas
    // todas de uma vez: pula para a próxima batida no tempo certo.
    if (nextStepTime < audioCtx.currentTime - 0.05) {
      const passos = Math.ceil((audioCtx.currentTime - nextStepTime) / stepDuration());
      nextStepTime += passos * stepDuration();
      currentStep = (currentStep + passos) % pattern.steps.length;
    }
    while (nextStepTime < audioCtx.currentTime + SCHEDULE_AHEAD_SEC) {
      scheduleStep(currentStep, nextStepTime);
      nextStepTime += stepDuration();
      currentStep = (currentStep + 1) % pattern.steps.length;
    }
  }

  function scheduleStep(stepIndex, time) {
    const hits = pattern.steps[stepIndex] || [];
    for (const hit of hits) {
      SoundBank.play(hit.sound, time, hit.vol);
    }
    if (onStep) {
      // a bolinha acende quando o som chega ao ouvido: soma o atraso da saída (no Bluetooth, 0,1 a 0,3 s)
      const atraso = (audioCtx.outputLatency || 0) + (audioCtx.baseLatency || 0);
      const delayMs = Math.max(0, (time + atraso - audioCtx.currentTime) * 1000);
      setTimeout(() => {
        if (playing) onStep(stepIndex, pattern.steps.length);
      }, delayMs);
    }
  }

  function start(ctx, ptn, bpmValue, stepCallback) {
    audioCtx = ctx;
    pattern = ptn;
    bpm = bpmValue;
    onStep = stepCallback;
    currentStep = 0;
    nextStepTime = audioCtx.currentTime + 0.05;
    playing = true;
    timerId = setInterval(scheduler, LOOKAHEAD_MS);
    manterTelaAcesa(true);
  }

  // Tela acesa enquanto o metrônomo toca (com a tela apagada o celular congela o app)
  let wakeLock = null;
  async function manterTelaAcesa(sim) {
    try {
      if (sim && "wakeLock" in navigator && !wakeLock) {
        wakeLock = await navigator.wakeLock.request("screen");
        wakeLock.addEventListener("release", () => { wakeLock = null; });
      } else if (!sim && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) { wakeLock = null; }
  }
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && playing) {
      if (audioCtx.state === "suspended") audioCtx.resume();
      manterTelaAcesa(true);   // o navegador solta o bloqueio quando a aba sai da frente
    }
  });

  function stop() {
    playing = false;
    if (timerId) clearInterval(timerId);
    timerId = null;
    manterTelaAcesa(false);
  }

  function setBpm(value) {
    bpm = value;
  }

  function setPattern(ptn) {
    pattern = ptn;
    currentStep = 0;
  }

  return {
    start,
    stop,
    setBpm,
    setPattern,
    get isPlaying() {
      return playing;
    },
  };
})();
