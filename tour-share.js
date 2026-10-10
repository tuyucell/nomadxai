(() => {
  'use strict';

  const API = 'https://mewpnmaoihjksorvayjh.supabase.co/functions/v1/regional-tour-public';
  const params = new URLSearchParams(window.location.search);
  const token = (params.get('share') || '').trim();
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const tourRoot = document.getElementById('tour');

  const strings = {
    tr: { loading: 'Paylaşılan tur yükleniyor…', unavailable: 'Bu bağlantı kullanılamıyor', unavailableCopy: 'Süresi dolmuş veya tur sahibi tarafından iptal edilmiş olabilir.', days: 'gün', readOnly: 'Salt okunur', itinerary: 'TUR PLANI', plan: 'Tur planın', expand: 'Tümünü aç', collapse: 'Tümünü kapat', direction: 'Yol tarifi', overnight: 'Bu günün sonunda geceleme planlanıyor', meals: 'YEMEK DURAKLARI' },
    en: { loading: 'Loading shared tour…', unavailable: 'This link is unavailable', unavailableCopy: 'It may have expired or been revoked by its owner.', days: 'days', readOnly: 'Read only', itinerary: 'ITINERARY', plan: 'Your tour plan', expand: 'Expand all', collapse: 'Collapse all', direction: 'Directions', overnight: 'An overnight stay is planned after this day', meals: 'MEAL STOPS' },
    de: { loading: 'Geteilte Tour wird geladen…', unavailable: 'Dieser Link ist nicht verfügbar', unavailableCopy: 'Er ist möglicherweise abgelaufen oder wurde widerrufen.', days: 'Tage', readOnly: 'Nur lesen', itinerary: 'REISEPLAN', plan: 'Dein Reiseplan', expand: 'Alle öffnen', collapse: 'Alle schließen', direction: 'Route', overnight: 'Nach diesem Tag ist eine Übernachtung geplant', meals: 'ESSENSSTOPPS' },
    es: { loading: 'Cargando el tour compartido…', unavailable: 'Este enlace no está disponible', unavailableCopy: 'Puede haber caducado o haber sido revocado.', days: 'días', readOnly: 'Solo lectura', itinerary: 'ITINERARIO', plan: 'Tu plan de viaje', expand: 'Abrir todo', collapse: 'Cerrar todo', direction: 'Cómo llegar', overnight: 'Hay una estancia nocturna prevista tras este día', meals: 'PARADAS PARA COMER' },
    fr: { loading: 'Chargement du circuit partagé…', unavailable: 'Ce lien est indisponible', unavailableCopy: 'Il a peut-être expiré ou été révoqué.', days: 'jours', readOnly: 'Lecture seule', itinerary: 'ITINÉRAIRE', plan: 'Votre circuit', expand: 'Tout ouvrir', collapse: 'Tout fermer', direction: 'Itinéraire', overnight: 'Une nuitée est prévue après cette journée', meals: 'PAUSES REPAS' },
  };
  let locale = (navigator.language || 'en').slice(0, 2);
  if (!strings[locale]) locale = 'en';
  let t = strings[locale];

  function text(id, value) {
    const node = document.getElementById(id);
    if (node) node.textContent = value || '';
  }

  function showError() {
    loading.hidden = true;
    tourRoot.hidden = true;
    error.hidden = false;
    text('error-title', t.unavailable);
    text('error-copy', t.unavailableCopy);
  }

  function appUrl() {
    const scheme = `com.turgayyucel.nomadxai://tour?share=${encodeURIComponent(token)}`;
    if (/Android/i.test(navigator.userAgent)) {
      const fallback = encodeURIComponent(window.location.href);
      return `intent://tour?share=${encodeURIComponent(token)}#Intent;scheme=com.turgayyucel.nomadxai;package=com.turgayyucel.nomadxai;S.browser_fallback_url=${fallback};end`;
    }
    return scheme;
  }

  function directionsUrl(place) {
    const hasCoordinates = Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
    const query = hasCoordinates
      ? `${place.latitude},${place.longitude}`
      : [place.name, place.address].filter(Boolean).join(', ');
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
  }

  function placeCard(place) {
    const card = document.createElement('article');
    card.className = 'place-card';
    const top = document.createElement('div');
    top.className = 'place-top';
    const copy = document.createElement('div');
    const time = document.createElement('div');
    time.className = 'place-time';
    time.textContent = place.scheduled_time || '';
    const title = document.createElement('h3');
    title.textContent = place.name || '';
    const category = document.createElement('p');
    category.className = 'place-category';
    category.textContent = place.category_key || '';
    copy.append(time, title, category);
    const link = document.createElement('a');
    link.className = 'directions';
    link.target = '_blank';
    link.rel = 'noopener';
    link.href = directionsUrl(place);
    link.textContent = t.direction;
    top.append(copy, link);
    card.append(top);
    if (place.address) {
      const address = document.createElement('p');
      address.className = 'place-address';
      address.textContent = place.address;
      card.append(address);
    }
    if (place.why) {
      const why = document.createElement('p');
      why.className = 'place-why';
      why.textContent = place.why;
      card.append(why);
    }
    return card;
  }

  function render(data) {
    const tour = data.tour || {};
    locale = strings[data.locale] ? data.locale : locale;
    t = strings[locale];
    document.documentElement.lang = locale;
    document.title = `${tour.title || 'Shared Tour'} · NomadX AI`;
    text('region', (tour.region_label || 'SHARED TOUR').toUpperCase());
    document.querySelector('.readonly-badge').textContent = t.readOnly;
    text('tour-title', tour.title);
    text('tour-summary', tour.summary);
    text('start-date', tour.start_date || '');
    text('day-count', `${tour.day_count || 0} ${t.days}`);
    text('transport', Array.isArray(tour.transport_modes) ? tour.transport_modes.join(' · ') : '');
    document.querySelector('.section-kicker').textContent = t.itinerary;
    document.querySelector('.section-heading h2').textContent = t.plan;
    const expandButton = document.getElementById('expand-all');
    expandButton.textContent = t.expand;
    document.querySelectorAll('[data-open-app]').forEach((link) => { link.href = appUrl(); });

    const daysRoot = document.getElementById('days');
    daysRoot.replaceChildren();
    (tour.days || []).forEach((day, index) => {
      const card = document.createElement('section');
      card.className = `day-card${index === 0 ? ' open' : ''}`;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'day-toggle';
      toggle.setAttribute('aria-expanded', index === 0 ? 'true' : 'false');
      const number = document.createElement('span');
      number.className = 'day-number';
      number.textContent = String(day.day_number || index + 1);
      const heading = document.createElement('span');
      heading.className = 'day-title';
      const strong = document.createElement('strong');
      strong.textContent = day.title || day.location?.name || '';
      const sub = document.createElement('span');
      sub.textContent = [day.date, day.location?.name].filter(Boolean).join(' · ');
      heading.append(strong, sub);
      const chevron = document.createElement('span');
      chevron.className = 'chevron';
      chevron.textContent = '⌄';
      toggle.append(number, heading, chevron);
      toggle.addEventListener('click', () => {
        card.classList.toggle('open');
        toggle.setAttribute('aria-expanded', card.classList.contains('open') ? 'true' : 'false');
      });
      const content = document.createElement('div');
      content.className = 'day-content';
      if (day.summary) {
        const summary = document.createElement('p');
        summary.className = 'day-summary';
        summary.textContent = day.summary;
        content.append(summary);
      }
      if (day.overnight_at_end) {
        const overnight = document.createElement('p');
        overnight.className = 'overnight';
        overnight.textContent = t.overnight;
        content.append(overnight);
      }
      const stops = document.createElement('div');
      stops.className = 'place-list';
      (day.stops || []).forEach((place) => stops.append(placeCard(place)));
      content.append(stops);
      if ((day.meals || []).length) {
        const mealLabel = document.createElement('p');
        mealLabel.className = 'meal-label';
        mealLabel.textContent = t.meals;
        content.append(mealLabel);
        const meals = document.createElement('div');
        meals.className = 'place-list';
        day.meals.forEach((place) => meals.append(placeCard(place)));
        content.append(meals);
      }
      card.append(toggle, content);
      daysRoot.append(card);
    });

    let expanded = false;
    expandButton.addEventListener('click', () => {
      expanded = !expanded;
      document.querySelectorAll('.day-card').forEach((card) => card.classList.toggle('open', expanded));
      document.querySelectorAll('.day-toggle').forEach((button) => button.setAttribute('aria-expanded', expanded ? 'true' : 'false'));
      expandButton.textContent = expanded ? t.collapse : t.expand;
    });
    loading.hidden = true;
    error.hidden = true;
    tourRoot.hidden = false;
  }

  if (!/^[A-Za-z0-9_-]{40,64}$/.test(token)) {
    showError();
    return;
  }

  fetch(`${API}?token=${encodeURIComponent(token)}`, { headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('not_found')))
    .then(render)
    .catch(showError);
})();
