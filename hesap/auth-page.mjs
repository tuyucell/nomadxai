// This isolated page deliberately has no SDK, analytics, network fetch or storage.
export const AUTH_ORIGIN = 'https://mewpnmaoihjksorvayjh.supabase.co';
const CALLBACKS = Object.freeze({
  signup: 'com.turgayyucel.nomadxai://login-callback',
  recovery: 'com.turgayyucel.nomadxai://reset-password',
});
const LANGUAGES = new Set(['tr', 'en', 'de', 'es', 'fr']);
const COPY = {
  tr: ['E-posta adresini doğrula', 'Şifreni sıfırla', 'E-posta adresini doğrulamak ve NomadX’e dönmek için devam et.', 'Yeni şifreni NomadX uygulamasında oluşturmak için devam et.', 'Doğrula ve uygulamayı aç', 'Şifremi sıfırla', 'Bu bağlantı eksik veya geçersiz. NomadX uygulamasından yeni bir e-posta iste.', 'Bu işlemi sen başlatmadıysan sayfayı kapatabilirsin. Bağlantıyı kimseyle paylaşma.', 'Bağlantı gönderimden itibaren 4 saat geçerlidir ve tek kullanımlıktır.', 'Uygulamaya yönlendiriliyorsun. Uygulama açılmazsa e-postayı NomadX’i kullandığın telefonda aç.', 'NomadX ana sayfası'],
  en: ['Verify your email', 'Reset your password', 'Continue to verify your email and return to NomadX.', 'Continue to create a new password in the NomadX app.', 'Verify and open the app', 'Reset my password', 'This link is incomplete or invalid. Request a new email in the NomadX app.', 'If you did not request this, you can close this page. Do not share this link.', 'The link is valid for 4 hours from sending and can only be used once.', 'Opening the app. If it does not open, open this email on the phone where you use NomadX.', 'NomadX home'],
  de: ['E-Mail-Adresse bestätigen', 'Passwort zurücksetzen', 'Fahre fort, um deine E-Mail-Adresse zu bestätigen und zu NomadX zurückzukehren.', 'Fahre fort, um in der NomadX-App ein neues Passwort festzulegen.', 'Bestätigen und App öffnen', 'Passwort zurücksetzen', 'Dieser Link ist unvollständig oder ungültig. Fordere in der NomadX-App eine neue E-Mail an.', 'Wenn du dies nicht angefordert hast, kannst du diese Seite schließen. Teile diesen Link nicht.', 'Der Link gilt ab Versand 4 Stunden und kann nur einmal verwendet werden.', 'Die App wird geöffnet. Falls sie nicht startet, öffne diese E-Mail auf deinem NomadX-Telefon.', 'NomadX-Startseite'],
  es: ['Verifica tu correo', 'Restablece tu contraseña', 'Continúa para verificar tu correo y volver a NomadX.', 'Continúa para crear una nueva contraseña en la app NomadX.', 'Verificar y abrir la app', 'Restablecer mi contraseña', 'Este enlace está incompleto o no es válido. Solicita otro correo desde la app NomadX.', 'Si no lo solicitaste, puedes cerrar esta página. No compartas este enlace.', 'El enlace es válido durante 4 horas desde el envío y solo se puede usar una vez.', 'Abriendo la app. Si no se abre, abre este correo en el teléfono donde utilizas NomadX.', 'Inicio de NomadX'],
  fr: ['Vérifie ton adresse e-mail', 'Réinitialise ton mot de passe', 'Continue pour vérifier ton adresse e-mail et revenir à NomadX.', 'Continue pour créer un nouveau mot de passe dans l’application NomadX.', 'Vérifier et ouvrir l’application', 'Réinitialiser mon mot de passe', 'Ce lien est incomplet ou invalide. Demande un nouvel e-mail dans l’application NomadX.', 'Si tu n’as pas fait cette demande, tu peux fermer cette page. Ne partage pas ce lien.', 'Le lien est valable 4 heures après l’envoi et ne peut être utilisé qu’une fois.', 'Ouverture de l’application. Si elle ne s’ouvre pas, ouvre cet e-mail sur ton téléphone NomadX.', 'Accueil NomadX'],
};

export function parseLink(fragment, flow) {
  const params = new URLSearchParams(fragment.replace(/^#/, ''));
  const rawLanguage = (params.get('lang') || 'en').toLowerCase().split(/[-_]/)[0];
  const lang = LANGUAGES.has(rawLanguage) ? rawLanguage : 'en';
  const token = params.get('token_hash') || '';
  const valid = Object.hasOwn(CALLBACKS, flow)
    && [...params.keys()].every(key => ['token_hash', 'lang'].includes(key))
    && params.getAll('token_hash').length === 1
    && params.getAll('lang').length <= 1
    && /^(?:pkce_)?[a-f0-9]{40,128}$/.test(token);
  return { lang, flow, token: valid ? token : null };
}

export function verificationUrl(link) {
  if (!link?.token || !Object.hasOwn(CALLBACKS, link.flow)
      || !/^(?:pkce_)?[a-f0-9]{40,128}$/.test(link.token)) {
    throw new Error('Invalid verification link');
  }
  const url = new URL('/auth/v1/verify', AUTH_ORIGIN);
  url.searchParams.set('token', link.token);
  url.searchParams.set('type', link.flow);
  url.searchParams.set('redirect_to', CALLBACKS[link.flow]);
  return url.href;
}

export function mountPage(window, document) {
  const link = parseLink(window.location.hash, document.body.dataset.flow);
  // Remove the one-time value from the address bar before interacting with UI.
  window.history.replaceState(null, '', window.location.pathname);
  const copy = COPY[link.lang];
  const recovery = link.flow === 'recovery';
  document.documentElement.lang = link.lang;
  const put = (id, text) => { document.getElementById(id).textContent = text; };
  document.title = `${copy[recovery ? 1 : 0]} — NomadX`;
  put('title', copy[recovery ? 1 : 0]);
  put('description', link.token ? copy[recovery ? 3 : 2] : copy[6]);
  put('security', copy[7]);
  put('expiry', copy[8]);
  put('home', copy[10]);
  const button = document.getElementById('continue');
  button.textContent = copy[recovery ? 5 : 4];
  button.hidden = !link.token;
  if (!link.token) return;
  // No fetch or token consumption on page load / mail scanner prefetch.
  button.addEventListener('click', () => {
    button.disabled = true;
    put('status', copy[9]);
    window.location.assign(verificationUrl(link));
  }, { once: true });
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  mountPage(window, document);
}
