(() => {
  'use strict';
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const android = /Android/i.test(ua);
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const manual = new URL(location.href).searchParams.get('install') === '1';
  // Installed iOS PWAs should never be asked to install again.
  if ((!ios && !android) || (ios && standalone())) return;
  const apiBase = self.HSI_WEB_CONFIG.apiBase;
  let release = null;
  let busy = false;
  let previousFocus;
  const invite = document.createElement('aside');
  invite.id = 'hsi-install-invite'; invite.hidden = false;
  invite.setAttribute('aria-label', 'Installer HSI Manager');
  invite.innerHTML = `<div class="invite-row"><img src="icons/Icon-192.png" alt=""><div><strong>HSI Manager</strong><p>${ios ? 'Sur votre écran d’accueil' : 'Votre application Android'}</p></div></div><button class="hsi-install-button" data-open>Installer</button>`;
  const dialog = document.createElement('dialog');
  dialog.id = 'hsi-install-dialog'; dialog.setAttribute('aria-labelledby', 'hsi-install-title');
  dialog.innerHTML = `
    <header class="install-cover">
      <span class="install-brand">HSI <span>APPLICATION</span></span>
      <button type="button" class="install-close" aria-label="Fermer la fiche d’installation" autofocus>×</button>
      <p>Votre espace.<br><strong>Toujours avec vous.</strong></p>
      <span class="install-cover-caption">HAMED SERVICES INTERNATIONAL</span>
    </header>
    <div class="install-body">
      <div class="install-identity">
        <img class="install-logo" src="icons/Icon-192.png" alt="Logo HSI">
        <div><h2 id="hsi-install-title">HSI Manager</h2><p class="install-publisher">Hamed Services International</p><span class="install-platform">${ios ? 'Application web · iOS / iPadOS' : 'Application Android · APK'}</span></div>
      </div>
      <div class="install-features"><div><strong>Gratuit</strong>À installer</div><div><strong>${ios ? 'iPhone / iPad' : 'Android'}</strong>Plateforme</div><div><strong>HSI</strong>Éditeur</div></div>
      <div class="install-cta">
        <button class="hsi-install-button install-action" data-install>${ios ? 'Ajouter à mon écran d’accueil' : 'Chargement de la version…'}</button>
        <p class="install-caption">${ios ? 'Installation depuis Safari, en quelques gestes.' : 'Téléchargez l’APK, puis confirmez l’installation sur votre téléphone.'}</p>
        <p class="install-status" role="status" aria-live="polite"></p>
      </div>
      <section aria-labelledby="install-about"><h3 id="install-about">Tout votre HSI, à portée de main</h3><p class="install-intro">Un accès direct à vos échanges, vos services et votre espace personnel.</p>
        <div class="install-highlights">
          <article><span aria-hidden="true">↗</span><strong>Vos services</strong><p>Retrouvez votre espace HSI.</p></article>
          <article><span aria-hidden="true">☏</span><strong>Vos échanges</strong><p>Gardez le contact où que vous soyez.</p></article>
          <article><span aria-hidden="true">⌂</span><strong>Votre accès</strong><p>Une icône sur votre écran d’accueil.</p></article>
        </div>
      </section>
      <section class="install-guide" aria-labelledby="install-steps"><span class="install-eyebrow">PRISE EN MAIN</span><h3 id="install-steps">${ios ? 'Votre application en trois gestes' : 'De votre navigateur à votre téléphone'}</h3>
        <ol>${ios ? '<li><strong>Ouvrez cette page dans Safari</strong>Si vous utilisez un autre navigateur, copiez cette adresse et ouvrez-la dans Safari.</li><li><strong>Touchez le bouton Partager</strong>Repérez le carré avec une flèche vers le haut dans le menu du navigateur.</li><li><strong>Ajoutez HSI à l’écran d’accueil</strong>Choisissez « Sur l’écran d’accueil » ou « Ajouter à l’écran d’accueil ». Activez « Ouvrir comme app » si proposé, puis touchez « Ajouter ».</li>' : '<li><strong>Téléchargez HSI Manager</strong>Touchez le bouton de téléchargement ci-dessus pour récupérer le fichier APK.</li><li><strong>Ouvrez le fichier téléchargé</strong>Retrouvez-le dans la notification ou dans le dossier Téléchargements de votre navigateur.</li><li><strong>Confirmez l’installation Android</strong>Si Android le demande, autorisez ce navigateur à installer cette application, puis touchez « Installer ». Vous pourrez ensuite ouvrir HSI.</li>'}</ol>
      </section>
      <div class="install-note">${ios ? 'HSI s’installe comme application web (PWA). Ouvrez ensuite HSI depuis son icône sur l’accueil. Les notifications s’activent séparément.' : 'L’installation finale est confirmée par Android. Un téléchargement ne signifie pas que l’application est déjà installée.'}</div>
      <button class="install-continue">Continuer sur le site</button>
      <p class="install-footer">HSI Manager · Hamed Services International</p>
    </div>`;
  document.body.append(invite, dialog);
  document.documentElement.classList.add('hsi-install-visible');
  // Reserve the banner's actual height, including accessibility text scaling.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      document.documentElement.style.setProperty('--hsi-invite-height', invite.getBoundingClientRect().height + 'px');
    }).observe(invite);
  }
  const action = dialog.querySelector('[data-install]');
  const status = dialog.querySelector('.install-status');
  function close() { dialog.close(); invite.hidden = false; previousFocus?.focus?.(); }
  dialog.querySelector('.install-close').addEventListener('click', close);
  dialog.querySelector('.install-continue').addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  function downloadUrl(data) {
    const raw = data.download_url || data.update_url;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const url = new URL(raw, apiBase + '/');
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    return url;
  }
  async function loadRelease() {
    if (busy) return;
    busy = true; release = null; action.disabled = true;
    action.textContent = 'Recherche de la version…'; status.textContent = '';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(apiBase + '/api/app/status/?version=0&version_code=0', {cache:'no-store', credentials:'omit', signal:controller.signal});
      if (!response.ok) throw Error('status');
      const data = await response.json();
      if (data.maintenance) throw Error('maintenance');
      const url = downloadUrl(data);
      if (!url) throw Error('missing');
      release = url;
      const size = Number(data.apk_size || 0);
      const version = typeof data.latest_version === 'string' ? data.latest_version : '';
      status.textContent = [version ? 'Version ' + version : '', size > 0 ? (size / 1048576).toFixed(1) + ' Mo' : '', 'Source : ' + url.hostname].filter(Boolean).join(' · ');
      action.textContent = 'Télécharger pour Android';
    } catch (_) {
      status.textContent = 'Le téléchargement est indisponible pour le moment. Réessayez lorsque vous êtes connecté.';
      action.textContent = 'Réessayer';
    } finally { clearTimeout(timeout); busy = false; action.disabled = false; }
  }
  function open() {
    previousFocus = document.activeElement; invite.hidden = false;
    if (!dialog.open) dialog.showModal();
    if (android) loadRelease();
  }
  invite.querySelector('[data-open]').addEventListener('click', open);
  action.addEventListener('click', () => {
    if (ios) { dialog.querySelector('ol').scrollIntoView({block:'nearest', behavior:matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'}); return; }
    if (!release) { loadRelease(); return; }
    // A real user gesture starts a normal browser download, without pop-up windows.
    const link = document.createElement('a'); link.href = release.href; link.rel = 'noopener';
    document.body.append(link); link.click(); link.remove();
    action.textContent = 'Télécharger à nouveau';
    status.textContent = 'Téléchargement demandé. Ouvrez ensuite le fichier depuis les téléchargements de votre navigateur.';
  });
  if (manual) open();
})();
