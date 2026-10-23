(() => {
  'use strict';
  const params = new URLSearchParams(window.location.search);
  if (!params.has('join')) return;
  const token = params.get('join') || '';
  const valid = /^[A-Za-z0-9_-]{43}$/.test(token) &&
    params.getAll('join').length === 1 && !params.has('share') && !params.has('daily');
  const messages = {
    tr: ['Tur / plan daveti', 'Davet ayrıntılarını NomadX’te incele. Giriş yap veya hesap oluştur, ardından “Kabul et ve katıl” seçeneğini kullan. Bağlantıyı açmak otomatik katılım sağlamaz.', 'NomadX’te daveti aç', 'App Store’dan indir', 'Google Play’den indir', 'Uygulamayı yükledikten ve e-postanı doğruladıktan sonra bu bağlantıya geri dön. Davet ayrıntıları yalnız giriş yaptıktan sonra gösterilir.', 'Bu davet bağlantısı geçersiz.'],
    en: ['Tour / plan invitation', 'Review this invitation in NomadX. Sign in or create an account, then choose “Accept and join”. Opening this link never joins automatically.', 'Open invitation in NomadX', 'Download on the App Store', 'Get it on Google Play', 'After installing the app and verifying your email, return to this link. Invitation details are shown only after sign-in.', 'This invitation link is invalid.'],
    de: ['Tour- / Planeinladung', 'Prüfe die Einladung in NomadX. Melde dich an oder erstelle ein Konto und wähle „Annehmen und beitreten“. Das Öffnen des Links bewirkt keinen automatischen Beitritt.', 'Einladung in NomadX öffnen', 'Im App Store laden', 'Bei Google Play laden', 'Kehre nach der Installation und E-Mail-Bestätigung zu diesem Link zurück. Details erscheinen erst nach der Anmeldung.', 'Dieser Einladungslink ist ungültig.'],
    es: ['Invitación al tour / plan', 'Revisa la invitación en NomadX. Inicia sesión o crea una cuenta y elige «Aceptar y unirme». Abrir el enlace no te une automáticamente.', 'Abrir invitación en NomadX', 'Descargar en App Store', 'Descargar en Google Play', 'Tras instalar la app y verificar tu correo, vuelve a este enlace. Los detalles solo se muestran después de iniciar sesión.', 'Este enlace de invitación no es válido.'],
    fr: ['Invitation au circuit / programme', 'Consulte l’invitation dans NomadX. Connecte-toi ou crée un compte, puis choisis « Accepter et participer ». Ouvrir ce lien ne te fait jamais participer automatiquement.', 'Ouvrir l’invitation dans NomadX', 'Télécharger dans l’App Store', 'Télécharger sur Google Play', 'Après installation et vérification de ton e-mail, reviens à ce lien. Les détails s’affichent uniquement après connexion.', 'Ce lien d’invitation est invalide.'],
  };
  const language = (navigator.language || 'en').slice(0, 2).toLowerCase();
  const t = messages[language] || messages.en;
  document.documentElement.lang = messages[language] ? language : 'en';
  document.title = `${t[0]} · NomadX`;
  document.getElementById('loading').hidden = true;
  document.getElementById('tour').hidden = true;
  const error = document.getElementById('error');
  if (!valid) {
    error.hidden = false;
    document.getElementById('error-title').textContent = t[6];
    document.getElementById('error-copy').textContent = '';
    document.querySelectorAll('[data-open-app]').forEach(link => { link.hidden = true; });
    return;
  }
  error.hidden = true;
  const query = `join=${encodeURIComponent(token)}`;
  const scheme = `com.turgayyucel.nomadxai://tour?${query}`;
  const store = 'https://play.google.com/store/apps/details?id=com.turgayyucel.nomadxai';
  const app = /Android/i.test(navigator.userAgent)
    ? `intent://tour?${query}#Intent;scheme=com.turgayyucel.nomadxai;package=com.turgayyucel.nomadxai;S.browser_fallback_url=${encodeURIComponent(store)};end`
    : scheme;
  document.querySelectorAll('[data-open-app]').forEach(link => { link.href = app; link.textContent = t[2]; });
  const card = document.createElement('section');
  card.className = 'state-card';
  const title = document.createElement('h1'); title.textContent = t[0]; card.append(title);
  const copy = document.createElement('p'); copy.textContent = t[1]; card.append(copy);
  function link(label, href, primary) {
    const el = document.createElement('a'); el.textContent = label; el.href = href;
    el.className = primary ? 'primary-action' : 'secondary-action';
    el.style.margin = '8px'; card.append(el);
  }
  link(t[2], app, true);
  link(t[3], 'https://apps.apple.com/app/id6797188085', false);
  link(t[4], store, false);
  const note = document.createElement('p'); note.textContent = t[5]; card.append(note);
  document.querySelector('main').append(card);
  // No fetch, auto-redirect, analytics, storage, token logging or auto-accept.
})();
