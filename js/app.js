/* App bootstrap: owns state, wires DOM events to the engine modules. */

(() => {
  const STORAGE_KEY = "afinador-ritmo-settings";

  const state = {
    bpm: 90,
    rhythmId: "simple",
    timeSigBeats: 4,
    playing: false,
    micActive: false,
    a4: 440,
    volume: 0.8,
    darkTheme: true,
  };

  let audioCtx = null;

  const TIME_SIGS = [
    { value: 2, label: "2/4" },
    { value: 3, label: "3/4" },
    { value: 4, label: "4/4" },
    { value: 5, label: "5/4" },
    { value: 6, label: "6/4" },
    { value: 7, label: "7/4" },
  ];

  function ensureAudioContext() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      SoundBank.init(audioCtx);
      SoundBank.setVolume(state.volume);
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function currentPattern() {
    const base = RhythmPatterns.get(state.rhythmId);
    return RhythmPatterns.withTimeSignature(base, state.timeSigBeats);
  }

  function refreshRhythmUI() {
    const pattern = currentPattern();
    UI.setTimeSigEnabled(!!pattern.editableTimeSig);
    const accents = RhythmPatterns.beatAccents(pattern.beatsPerBar, pattern.subdivision);
    UI.renderBeatDots(pattern.steps.length, accents);
    if (state.playing) {
      MetronomeEngine.setPattern(pattern);
    }
  }

  function selectRhythm(id) {
    state.rhythmId = id;
    UI.renderRhythmChips(RhythmPatterns.LIST, state.rhythmId, selectRhythm);
    refreshRhythmUI();
  }

  function handleStep(stepIndex) {
    UI.litBeatDot(stepIndex);
  }

  let ligando = false;
  async function togglePlay() {
    if (ligando) return;   // dois toques rápidos não abrem dois metrônomos
    const ctx = ensureAudioContext();
    // no celular o áudio começa "suspenso": espera ligar antes de marcar o tempo da 1ª batida
    if (!state.playing && ctx.state !== "running") {
      ligando = true;
      try { await ctx.resume(); } catch (e) {}
      ligando = false;
    }
    if (state.playing) {
      MetronomeEngine.stop();
      state.playing = false;
      UI.clearBeatDots();
    } else {
      const pattern = currentPattern();
      MetronomeEngine.start(ctx, pattern, state.bpm, handleStep);
      state.playing = true;
    }
    UI.setPlayButton(state.playing);
  }

  function setBpm(value) {
    state.bpm = Math.max(30, Math.min(300, Math.round(value)));
    UI.setBpm(state.bpm);
    MetronomeEngine.setBpm(state.bpm);
  }

  let tapTimes = [];
  function handleTap() {
    const now = performance.now();
    tapTimes = tapTimes.filter((t) => now - t < 2000);
    tapTimes.push(now);
    if (tapTimes.length >= 2) {
      const intervals = [];
      for (let i = 1; i < tapTimes.length; i++) intervals.push(tapTimes[i] - tapTimes[i - 1]);
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      setBpm(Math.round(60000 / avgMs));
    }
  }

  async function toggleMic() {
    if (state.micActive) {
      PitchDetector.stop();
      state.micActive = false;
      UI.setMicButton(false);
      UI.setTunerStatus('Toque em "Ativar microfone" para começar');
      UI.updateTuner(null);
      return;
    }
    try {
      const ctx = ensureAudioContext();
      UI.setTunerStatus("Solicitando acesso ao microfone…");
      await PitchDetector.start(ctx, (result) => {
        if (result) {
          UI.setTunerStatus("Escutando…");
          UI.updateTuner(result);
        } else {
          UI.setTunerStatus("Toque uma nota…");
          UI.updateTuner(null);
        }
      });
      state.micActive = true;
      UI.setMicButton(true);
    } catch (err) {
      UI.setTunerStatus("Não foi possível acessar o microfone. Verifique as permissões do navegador.");
      console.error("Microphone access failed", err);
    }
  }

  // Link com ritmo e andamento: ?ritmo=rock&bpm=80&compasso=4 prepara o metrônomo (a pessoa só aperta ▶).
  function applyUrlParams() {
    const p = new URLSearchParams(location.search);
    if (p.has("ritmo") || p.has("bpm")) {
      if (p.has("compasso")) state.timeSigBeats = Math.max(2, Math.min(7, Number(p.get("compasso")) || 4));
      if (p.has("ritmo") && RhythmPatterns.LIST.some((r) => r.id === p.get("ritmo"))) state.rhythmId = p.get("ritmo");
      if (p.has("bpm")) setBpm(Number(p.get("bpm")) || state.bpm);
      UI.populateTimeSignatures(TIME_SIGS, state.timeSigBeats);
      selectRhythm(state.rhythmId);
      document.querySelector(".rhythm-card").scrollIntoView({ block: "start" });
    }
  }

  // ---- Instalar o app (PWA) ----
  let installPrompt = null;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installPrompt = e;
    document.getElementById("btn-install-now").hidden = false;
  });
  const BANNER_KEY = "afinador-banner-fechado-em";
  const guardado = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };

  function showInstallTab(os) {
    document.querySelectorAll("#install-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.os === os));
    document.querySelectorAll(".install-steps").forEach((ol) => (ol.hidden = ol.dataset.os !== os));
  }

  function initInstall() {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone;
    const btn = document.getElementById("btn-install");
    const banner = document.getElementById("install-banner");
    if (standalone) { btn.hidden = true; banner.hidden = true; return; }
    const ua = navigator.userAgent;
    showInstallTab(/iPhone|iPad|iPod/i.test(ua) ? "iphone" : /Android/i.test(ua) ? "android" : "pc");
    const sheet = document.getElementById("install-sheet");
    // Um toque: onde o navegador permite (Android/Chrome/Edge), abre a instalação do sistema direto;
    // no iPhone, que não permite, mostra o passo a passo
    async function instalar() {
      if (installPrompt) {
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        return;
      }
      sheet.hidden = false;
    }
    btn.addEventListener("click", instalar);
    // Faixa de instalação: aparece de novo 7 dias depois de fechada
    const fechadoEm = Number(guardado(BANNER_KEY) || 0);
    banner.hidden = Date.now() - fechadoEm < 7 * 24 * 3600 * 1000;
    btn.hidden = !banner.hidden;   // um botão de instalar por vez: com a faixa visível, o do topo some
    document.getElementById("btn-banner-install").addEventListener("click", instalar);
    document.getElementById("btn-banner-close").addEventListener("click", () => { banner.hidden = true; btn.hidden = false; guardar(BANNER_KEY, String(Date.now())); });
    document.getElementById("btn-close-install").addEventListener("click", () => (sheet.hidden = true));
    document.getElementById("install-backdrop").addEventListener("click", () => (sheet.hidden = true));
    document.querySelectorAll("#install-tabs button").forEach((b) => b.addEventListener("click", () => showInstallTab(b.dataset.os)));
    document.getElementById("btn-install-now").addEventListener("click", async () => {
      if (!installPrompt) return;
      installPrompt.prompt();
      await installPrompt.userChoice;
      installPrompt = null;
      sheet.hidden = true;
    });
    window.addEventListener("appinstalled", () => { btn.hidden = true; sheet.hidden = true; banner.hidden = true; });
  }

  function loadSettings() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
      if (saved.a4) state.a4 = saved.a4;
      if (saved.darkTheme != null) state.darkTheme = saved.darkTheme;
      if (saved.volume != null) state.volume = saved.volume;
    } catch (e) {
      /* ignore malformed/blocked storage */
    }
  }

  function saveSettings() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ a4: state.a4, darkTheme: state.darkTheme, volume: state.volume })
      );
    } catch (e) {
      /* private browsing / storage blocked */
    }
  }

  function init() {
    loadSettings();

    UI.buildMeterTicks();
    UI.applyTheme(state.darkTheme);
    document.getElementById("theme-toggle").checked = state.darkTheme;
    document.getElementById("a4-input").value = state.a4;
    UI.el.volumeSlider.value = state.volume;
    PitchDetector.setA4(state.a4);

    UI.populateTimeSignatures(TIME_SIGS, state.timeSigBeats);
    UI.renderRhythmChips(RhythmPatterns.LIST, state.rhythmId, selectRhythm);
    refreshRhythmUI();
    UI.setBpm(state.bpm);
    UI.setPlayButton(false);
    UI.setMicButton(false);
    UI.updateTuner(null);

    UI.el.btnPlay.addEventListener("click", togglePlay);
    UI.el.btnMic.addEventListener("click", toggleMic);
    document.getElementById("btn-bpm-minus").addEventListener("click", () => setBpm(state.bpm - 1));
    document.getElementById("btn-bpm-plus").addEventListener("click", () => setBpm(state.bpm + 1));
    UI.el.bpmSlider.addEventListener("input", (e) => setBpm(Number(e.target.value)));
    document.getElementById("btn-tap").addEventListener("click", handleTap);
    UI.el.timeSigSelect.addEventListener("change", (e) => {
      state.timeSigBeats = Number(e.target.value);
      refreshRhythmUI();
    });
    UI.el.volumeSlider.addEventListener("input", (e) => {
      state.volume = Number(e.target.value);
      if (audioCtx) SoundBank.setVolume(state.volume);
      saveSettings();
    });

    document.getElementById("btn-settings").addEventListener("click", () => UI.toggleSettings(true));
    document.getElementById("btn-close-settings").addEventListener("click", () => UI.toggleSettings(false));
    document.getElementById("sheet-backdrop").addEventListener("click", () => UI.toggleSettings(false));
    document.getElementById("a4-input").addEventListener("change", (e) => {
      const val = Number(e.target.value);
      if (val >= 410 && val <= 470) {
        state.a4 = val;
        PitchDetector.setA4(val);
        saveSettings();
      }
    });
    document.getElementById("theme-toggle").addEventListener("change", (e) => {
      state.darkTheme = e.target.checked;
      UI.applyTheme(state.darkTheme);
      saveSettings();
    });

    applyUrlParams();
    initInstall();

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("service-worker.js").catch(() => {});
      });
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
