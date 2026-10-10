(() => {
  'use strict';

  const API = 'https://mewpnmaoihjksorvayjh.supabase.co/functions/v1/regional-tour-public';
  const DAILY_API = 'https://mewpnmaoihjksorvayjh.supabase.co/functions/v1/daily-route-public';
  const APP_STORE = 'https://apps.apple.com/app/id6797188085';
  const params = new URLSearchParams(window.location.search);
  const token = (params.get('share') || '').trim();
  const dailyToken = (params.get('daily') || '').trim();
  const loading = document.getElementById('loading');
  const error = document.getElementById('error');
  const tourRoot = document.getElementById('tour');

  const strings = {
    tr: { loading: 'Paylaşılan tur yükleniyor…', unavailable: 'Bu bağlantı kullanılamıyor', unavailableCopy: 'Süresi dolmuş veya tur sahibi tarafından iptal edilmiş olabilir.', days: 'gün', readOnly: 'Salt okunur', demo: 'Örnek tur', itinerary: 'TUR PLANI', plan: 'Tur planın', dayPlan: 'AI GÜNLÜK PLAN', dailyPrivacy: 'Özel notlar, kişisel ilerleme, alternatif mekânlar ve canlı konum paylaşılmaz.', expand: 'Tümünü aç', collapse: 'Tümünü kapat', direction: 'Yol tarifi', overnight: 'Bu günün sonunda geceleme planlanıyor', meals: 'YEMEK DURAKLARI', getApp: 'Uygulamayı indir', downloadApp: 'NomadX’i indir', sample: 'Örnek turu görüntüle' },
    en: { loading: 'Loading shared tour…', unavailable: 'This link is unavailable', unavailableCopy: 'It may have expired or been revoked by its owner.', days: 'days', readOnly: 'Read only', demo: 'Sample tour', itinerary: 'ITINERARY', plan: 'Your tour plan', dayPlan: 'AI DAY PLAN', dailyPrivacy: 'Private notes, personal progress, alternative places and live location are not shared.', expand: 'Expand all', collapse: 'Collapse all', direction: 'Directions', overnight: 'An overnight stay is planned after this day', meals: 'MEAL STOPS', getApp: 'Get the app', downloadApp: 'Download NomadX', sample: 'View sample tour' },
    de: { loading: 'Geteilte Tour wird geladen…', unavailable: 'Dieser Link ist nicht verfügbar', unavailableCopy: 'Er ist möglicherweise abgelaufen oder wurde widerrufen.', days: 'Tage', readOnly: 'Nur lesen', demo: 'Beispieltour', itinerary: 'REISEPLAN', plan: 'Dein Reiseplan', dayPlan: 'AI-TAGESPLAN', dailyPrivacy: 'Private Notizen, Fortschritt, Alternativen und Live-Standort werden nicht geteilt.', expand: 'Alle öffnen', collapse: 'Alle schließen', direction: 'Route', overnight: 'Nach diesem Tag ist eine Übernachtung geplant', meals: 'ESSENSSTOPPS', getApp: 'App laden', downloadApp: 'NomadX laden', sample: 'Beispieltour ansehen' },
    es: { loading: 'Cargando el tour compartido…', unavailable: 'Este enlace no está disponible', unavailableCopy: 'Puede haber caducado o haber sido revocado.', days: 'días', readOnly: 'Solo lectura', demo: 'Tour de ejemplo', itinerary: 'ITINERARIO', plan: 'Tu plan de viaje', dayPlan: 'PLAN DIARIO IA', dailyPrivacy: 'No se comparten notas privadas, progreso, alternativas ni ubicación en vivo.', expand: 'Abrir todo', collapse: 'Cerrar todo', direction: 'Cómo llegar', overnight: 'Hay una estancia nocturna prevista tras este día', meals: 'PARADAS PARA COMER', getApp: 'Descargar app', downloadApp: 'Descargar NomadX', sample: 'Ver tour de ejemplo' },
    fr: { loading: 'Chargement du circuit partagé…', unavailable: 'Ce lien est indisponible', unavailableCopy: 'Il a peut-être expiré ou été révoqué.', days: 'jours', readOnly: 'Lecture seule', demo: 'Circuit exemple', itinerary: 'ITINÉRAIRE', plan: 'Votre circuit', dayPlan: 'PROGRAMME IA', dailyPrivacy: 'Les notes privées, la progression, les alternatives et la position en direct ne sont pas partagées.', expand: 'Tout ouvrir', collapse: 'Tout fermer', direction: 'Itinéraire', overnight: 'Une nuitée est prévue après cette journée', meals: 'PAUSES REPAS', getApp: 'Télécharger', downloadApp: 'Télécharger NomadX', sample: 'Voir un exemple' },
  };
  let locale = (navigator.language || 'en').slice(0, 2);
  if (!strings[locale]) locale = 'en';
  let t = strings[locale];

  function demoData() {
    const tr = locale === 'tr';
    return {
      locale,
      tour: {
        title: tr ? 'Ege Kıyıları: İzmir’den Fethiye’ye' : 'Aegean Coast: İzmir to Fethiye',
        summary: tr
          ? 'Tarihi durakları, yerel lezzetleri ve kıyı manzaralarını birleştiren üç günlük örnek NomadX turu.'
          : 'A three-day sample NomadX tour combining historic stops, local food and coastal views.',
        region_label: tr ? 'ÖRNEK EGE TURU' : 'SAMPLE AEGEAN TOUR',
        start_date: '2026-10-18',
        day_count: 3,
        transport_modes: [tr ? 'araba' : 'driving', tr ? 'yürüyüş' : 'walking'],
        days: [
          {
            day_number: 1,
            date: '2026-10-18',
            location: { name: 'İzmir' },
            title: tr ? 'İzmir: Kordon ve tarihi merkez' : 'İzmir: waterfront and old town',
            summary: tr ? 'Konak çevresinden başlayıp Kemeraltı ve Kordon’a uzanan dengeli bir şehir günü.' : 'A balanced city day from Konak through Kemeraltı to the waterfront.',
            overnight_at_end: true,
            stops: [
              { scheduled_time: '09:30', name: 'Tarihi Asansör', category_key: tr ? 'Manzara' : 'Viewpoint', address: 'Turgut Reis, Şehit Nihatbey Cd. 76/A, Konak/İzmir', latitude: 38.4086, longitude: 27.1170, why: tr ? 'Körfez manzarasıyla güne sakin bir başlangıç.' : 'A relaxed start with panoramic gulf views.' },
              { scheduled_time: '11:15', name: 'Kemeraltı Çarşısı', category_key: tr ? 'Tarihi bölge' : 'Historic district', address: 'Konak, İzmir', latitude: 38.4192, longitude: 27.1320, why: tr ? 'Yerel dükkânlar, hanlar ve sokak lezzetleri için.' : 'For local shops, historic inns and street food.' }
            ],
            meals: [
              { scheduled_time: '13:00', name: 'Hisarönü Şambalicisi', category_key: tr ? 'Yerel lezzet' : 'Local food', address: 'Kemeraltı, Konak/İzmir', latitude: 38.4203, longitude: 27.1327, why: tr ? 'İzmir’in klasik tatlı duraklarından biri.' : 'One of İzmir’s classic dessert stops.' }
            ]
          },
          {
            day_number: 2,
            date: '2026-10-19',
            location: { name: 'Selçuk' },
            title: tr ? 'Efes ve Şirince' : 'Ephesus and Şirince',
            summary: tr ? 'Sabah Efes antik kenti, öğleden sonra Şirince sokakları ve gün batımı.' : 'Ephesus in the morning, Şirince streets and sunset in the afternoon.',
            overnight_at_end: true,
            stops: [
              { scheduled_time: '09:00', name: 'Efes Antik Kenti', category_key: tr ? 'Tarihi yer' : 'Historic site', address: 'Atatürk, Uğur Mumcu Sevgi Yolu, Selçuk/İzmir', latitude: 37.9411, longitude: 27.3410, why: tr ? 'Yoğunluk ve sıcaklık artmadan ana yapıları gezmek için.' : 'To explore the main ruins before heat and crowds build.' },
              { scheduled_time: '15:30', name: 'Şirince Köyü', category_key: tr ? 'Köy ve manzara' : 'Village and views', address: 'Şirince, Selçuk/İzmir', latitude: 37.9446, longitude: 27.4311, why: tr ? 'Taş sokaklar ve vadi manzaralarıyla günü tamamlamak için.' : 'Stone streets and valley views to close the day.' }
            ],
            meals: []
          },
          {
            day_number: 3,
            date: '2026-10-20',
            location: { name: 'Fethiye' },
            title: tr ? 'Fethiye: Kayaköy ve gün batımı' : 'Fethiye: Kayaköy and sunset',
            summary: tr ? 'Kayaköy yürüyüşü, sahil molası ve gün batımıyla turun finali.' : 'A Kayaköy walk, waterfront break and sunset finale.',
            overnight_at_end: false,
            stops: [
              { scheduled_time: '10:00', name: 'Kayaköy', category_key: tr ? 'Tarihi yer' : 'Historic site', address: 'Kayaköy, Fethiye/Muğla', latitude: 36.5754, longitude: 29.0873, why: tr ? 'Tarihi taş yerleşimi serin sabah saatlerinde keşfetmek için.' : 'To explore the historic stone settlement in the cooler morning.' },
              { scheduled_time: '17:45', name: 'Çalış Plajı', category_key: tr ? 'Gün batımı' : 'Sunset', address: 'Foça, Fethiye/Muğla', latitude: 36.6584, longitude: 29.1011, why: tr ? 'Turun finalini sahilde gün batımıyla yapmak için.' : 'To finish the tour with sunset by the sea.' }
            ],
            meals: [
              { scheduled_time: '13:30', name: 'Fethiye Balık Pazarı', category_key: tr ? 'Öğle yemeği' : 'Lunch', address: 'Cumhuriyet, Fethiye/Muğla', latitude: 36.6219, longitude: 29.1153, why: tr ? 'Yerel ürünlerden kişisel bir menü oluşturmak için.' : 'For a flexible meal built around local seafood.' }
            ]
          }
        ]
      }
    };
  }

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
    const sampleLink = document.getElementById('sample-tour-link');
    if (sampleLink) sampleLink.textContent = t.sample;
  }

  function appUrl() {
    const query = dailyToken
      ? `daily=${encodeURIComponent(dailyToken)}`
      : `share=${encodeURIComponent(token)}`;
    const scheme = `com.turgayyucel.nomadxai://tour?${query}`;
    if (/Android/i.test(navigator.userAgent)) {
      const fallback = encodeURIComponent(window.location.href);
      return `intent://tour?${query}#Intent;scheme=com.turgayyucel.nomadxai;package=com.turgayyucel.nomadxai;S.browser_fallback_url=${fallback};end`;
    }
    return scheme;
  }

  function dailyDataToTour(data) {
    const route = data.route || {};
    return {
      kind: 'daily',
      locale: data.locale,
      tour: {
        title: route.title,
        summary: route.summary,
        region_label: t.dayPlan,
        start_date: route.route_date,
        day_count: 1,
        transport_modes: [route.transport_mode].filter(Boolean),
        days: [{
          day_number: 1,
          date: route.route_date,
          location: { name: route.location_label || '' },
          title: route.title,
          summary: [route.start_time && route.end_time ? `${route.start_time}–${route.end_time}` : '', route.summary || ''].filter(Boolean).join(' · '),
          overnight_at_end: false,
          stops: Array.isArray(route.stops) ? route.stops : [],
          meals: [],
        }],
      },
    };
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

  function render(data, { demo = false } = {}) {
    const tour = data.tour || {};
    locale = strings[data.locale] ? data.locale : locale;
    t = strings[locale];
    document.documentElement.lang = locale;
    document.title = `${tour.title || 'Shared Tour'} · NomadX AI`;
    text('region', (data.kind === 'daily' ? t.dayPlan : (tour.region_label || 'SHARED TOUR')).toUpperCase());
    if (data.kind === 'daily') document.querySelector('.privacy-note p').textContent = t.dailyPrivacy;
    document.querySelector('.readonly-badge').textContent = demo ? t.demo : t.readOnly;
    text('tour-title', tour.title);
    text('tour-summary', tour.summary);
    text('start-date', tour.start_date || '');
    text('day-count', `${tour.day_count || 0} ${t.days}`);
    text('transport', Array.isArray(tour.transport_modes) ? tour.transport_modes.join(' · ') : '');
    document.querySelector('.section-kicker').textContent = t.itinerary;
    document.querySelector('.section-heading h2').textContent = t.plan;
    const expandButton = document.getElementById('expand-all');
    expandButton.textContent = t.expand;
    document.querySelectorAll('[data-open-app]').forEach((link) => {
      link.href = demo ? APP_STORE : appUrl();
      if (demo) link.textContent = link.classList.contains('compact') ? t.getApp : t.downloadApp;
    });

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

  if ((!token && !dailyToken) || params.get('demo') === '1') {
    render(demoData(), { demo: true });
    return;
  }

  const activeToken = dailyToken || token;
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(activeToken)) {
    showError();
    return;
  }

  const endpoint = dailyToken ? DAILY_API : API;
  fetch(`${endpoint}?token=${encodeURIComponent(activeToken)}`, { headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('not_found')))
    .then((data) => render(dailyToken ? dailyDataToTour(data) : data))
    .catch(showError);
})();
