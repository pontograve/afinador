// Medição de uso (Google Analytics 4, a mesma propriedade do site pontograve.com.br). Versão 4.0 do app (23/11/2026).
// Só eventos de uso, sem dado pessoal. LGPD: começa com analytics_storage negado (contagem anônima, sem cookie);
// só grava cookie se a pessoa tocar em "Aceitar". Escolha guardada em localStorage "pg-cookies" (mesma chave do site).
// Sem internet, nada é enviado e o app funciona normalmente.
(function () {
  var GA_ID = 'G-DQKNDTQTC2';
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;
  var escolha = null;
  try { escolha = localStorage.getItem('pg-cookies'); } catch (e) {}
  gtag('consent', 'default', { analytics_storage: escolha === 'sim' ? 'granted' : 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  var instalado = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  gtag('js', new Date());
  gtag('config', GA_ID, { app_modo: instalado ? 'instalado' : 'navegador' });
  var s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
  document.head.appendChild(s);

  function evento(nome, params) { try { gtag('event', nome, Object.assign({ app: 'afinador', app_modo: instalado ? 'instalado' : 'navegador' }, params || {})); } catch (e) {} }
  window.pgEvento = evento;

  var pagina = (location.pathname.split('/').pop() || 'index.html').replace('.html', '') || 'index';
  if (instalado) evento('app_aberto_instalado', { pagina: pagina });
  window.addEventListener('appinstalled', function () { evento('app_instalado'); });
  window.addEventListener('beforeprint', function () { evento('imprimir', { pagina: pagina }); });

  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('button, a');
    if (!el) return;
    if (el.id === 'btn-mic') evento('microfone_ativado');
    else if (el.id === 'btn-play') { var r = document.querySelector('.rhythm-chip.active'); evento('ritmo_tocado', { ritmo: r ? r.getAttribute('data-id') : '' }); }
    else if (el.id === 'btn-install' || el.id === 'btn-banner-install' || el.id === 'btn-install-now') evento('instalar_clique');
    else if (el.classList.contains('livro-card')) evento('livro_clique');
    else if (el.tagName === 'A' && /\.html/.test(el.getAttribute('href') || '')) evento('abrir_material', { material: (el.getAttribute('href') || '').replace('.html', '') });
  }, true);

  // Aviso de cookies discreto (só aparece até a pessoa escolher)
  if (escolha) return;
  function aviso() {
    var d = document.createElement('div');
    d.setAttribute('role', 'dialog');
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:9999;max-width:520px;margin:0 auto;background:#1A1714;color:#F2ECE2;border:1px solid #2E2923;border-radius:14px;padding:12px 14px;font:13px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.4);display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    d.innerHTML = '<span style="flex:1;min-width:200px">Usamos cookies só para contar o uso do app (sem anúncios). <a href="https://pontograve.com.br/privacidade/" target="_blank" rel="noopener" style="color:#E2B45E">Saiba mais</a></span>' +
      '<button data-c="nao" style="background:none;border:1px solid #6B6259;color:#F2ECE2;border-radius:20px;padding:6px 12px;cursor:pointer">Recusar</button>' +
      '<button data-c="sim" style="background:#E2B45E;border:0;color:#151210;font-weight:700;border-radius:20px;padding:6px 14px;cursor:pointer">Aceitar</button>';
    d.addEventListener('click', function (e) {
      var c = e.target.getAttribute && e.target.getAttribute('data-c'); if (!c) return;
      try { localStorage.setItem('pg-cookies', c); } catch (x) {}
      if (c === 'sim') gtag('consent', 'update', { analytics_storage: 'granted' });
      d.remove();
    });
    document.body.appendChild(d);
  }
  if (document.body) aviso(); else document.addEventListener('DOMContentLoaded', aviso);
})();
