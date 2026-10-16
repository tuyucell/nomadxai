export const notificationLanguages = ['tr', 'en', 'de', 'fr', 'es'];
export const notificationLanguageNames = {tr: 'Türkçe', en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español'};
export function notificationTranslationStatus(form, language) {
  const title = form.get(`title_${language}`)?.trim() || '';
  const body = form.get(`body_${language}`)?.trim() || '';
  return !title && !body ? 'empty' : title && body ? 'complete' : 'partial';
}
export function notificationDeliverySettingsInput(enabled, value) {
  if (typeof enabled !== 'boolean') throw new Error('Günlük sınır tercihi geçersiz.');
  if (!enabled) return {p_daily_limit_enabled: false, p_daily_limit: null};
  const text = String(value ?? '').trim();
  if (!/^[0-9]+$/.test(text) || Number(text) < 1 || Number(text) > 10000) {
    throw new Error('Günlük sınır için 1–10000 arasında tam sayı gir.');
  }
  return {p_daily_limit_enabled: true, p_daily_limit: Number(text)};
}
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const recipientIds = value => [...new Set((value || '').split(/[\s,;]+/)
  .filter(Boolean).map(id => id.toLowerCase()))];
export function notificationAudienceInput(form, {draft = false} = {}) {
  const mode = form.get('audience_mode') || 'selected';
  if (!['selected', 'all', 'countries'].includes(mode)) throw new Error('Geçerli bir hedef kitle seçin.');
  const recipients = mode === 'selected' ? recipientIds(form.get('recipients')) : [];
  const countries = mode === 'countries' ? [...new Set((form.get('country_codes') || '').split(/[\s,;]+/).filter(Boolean).map(code => code.toUpperCase()))].sort() : [];
  if (recipients.length > 100 || recipients.some(id => !userIdPattern.test(id)) ||
      (!draft && mode === 'selected' && !recipients.length)) throw new Error('En az bir kullanıcı seçin. Boş seçim herkese göndermez; tek tek seçim en fazla 100 kullanıcıdır.');
  if (countries.length > 250 || countries.some(code => !/^[A-Z]{2}$/.test(code)) ||
      (!draft && mode === 'countries' && !countries.length)) throw new Error('Ülkeye göre gönderim için en az bir ülke seçin.');
  return {p_mode: mode, p_recipient_ids: recipients, p_country_codes: countries};
}

export function notificationCampaignInput(form, {draft = false} = {}) {
  const titles = {}, bodies = {};
  for (const language of notificationLanguages) {
    titles[language] = form.get(`title_${language}`)?.trim() || '';
    bodies[language] = form.get(`body_${language}`)?.trim() || '';
    if (titles[language].length > 160 || bodies[language].length > 1000 ||
        (!draft && (!titles[language] || !bodies[language]))) {
      throw new Error('Scheduling requires a title and message in all five languages (160/1000 characters maximum).');
    }
  }
  const audience = notificationAudienceInput(form, {draft});
  const dateText = form.get('scheduled_at');
  const scheduled = dateText ? new Date(dateText) : null;
  if ((scheduled && !Number.isFinite(scheduled.getTime())) ||
      (!draft && (!scheduled || scheduled.getTime() < Date.now() - 120000 ||
        scheduled.getTime() > Date.now() + 365 * 86400000))) {
    throw new Error('Choose a valid time within the next 365 days.');
  }
  return {p_titles: titles, p_bodies: bodies, ...audience,
    p_scheduled_at: scheduled?.toISOString() ?? null};
}

export function notificationCampaignMutation(form, editing, draft) {
  return {...notificationCampaignInput(form, {draft}),
    p_id: editing?.id ?? null, p_expected_revision: editing?.revision ?? null,
    p_publish: !draft};
}

export function notificationCampaignOperation(input, previous, createId = () => crypto.randomUUID()) {
  const fingerprint = JSON.stringify(input);
  if (previous && previous.fingerprint !== fingerprint) {
    throw new Error('Previous save outcome is unknown. Retry the unchanged request, or refresh history and reopen the saved campaign before changing it.');
  }
  return previous || {fingerprint, id: createId()};
}

// Copy content and audience, never identity/revision/schedule/delivery state.
// Publishing the resulting form still requires a fresh audience preview and confirmation.
export function notificationCampaignCopy(item) {
  const mode = item.audience_mode || 'selected';
  if (!['selected', 'all', 'countries'].includes(mode)) throw new Error('Bu hedef kitle kopyalanamıyor.');
  const data = new Map([['audience_mode', mode], ['scheduled_at', ''],
    ['recipients', mode === 'selected' ? (item.recipient_ids || []).join('\n') : ''],
    ['country_codes', mode === 'countries' ? (item.audience_country_codes || []).join(',') : '']]);
  for (const language of notificationLanguages) {
    data.set(`title_${language}`, item.titles?.[language] || '');
    data.set(`body_${language}`, item.bodies?.[language] || '');
  }
  notificationCampaignInput(data, {draft: true});
  return data;
}

export function notificationCampaignStatus(item) {
  if (item.state === 'draft') return {label: 'Taslak', tone: 'neutral'};
  if (item.state === 'scheduled') return {label: 'Zamanlandı', tone: 'scheduled'};
  if (item.state === 'cancelled') return {label: 'İptal edildi', tone: 'neutral'};
  const counts = item.delivery_summary || {};
  if (['pending', 'leased', 'retry'].some(key => counts[key] > 0)) return {label: 'Gönderiliyor', tone: 'scheduled'};
  const errors = (counts.failed || 0) + (counts.invalid_token || 0);
  if (counts.accepted > 0) return {label: errors ? 'Kısmen kabul edildi' : 'FCM kabul etti', tone: errors ? 'warning' : 'accepted'};
  if (errors) return {label: 'Gönderim başarısız', tone: 'warning'};
  return {label: 'İşlendi', tone: 'neutral'};
}

export function mountNotifications(root, rpc, notify, adminUserId) {
  const el = (tag, text) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  };
  const field = (label, input) => {
    const wrapper = el('label', label); wrapper.append(input); return wrapper;
  };
  const button = (text, action, mutates = false) => {
    const node = el('button', text); node.type = 'button'; node.onclick = action;
    node.className = 'button button-secondary';
    if (mutates) node.dataset.mutatesCampaign = 'true';
    return node;
  };
  function confirmAction(message, label = 'Confirm', {broadAudience = false} = {}) {
    return new Promise(resolve => {
      const dialog = el('dialog'); dialog.className = 'notification-confirm';
      dialog.setAttribute('aria-label', 'Confirm campaign action');
      dialog.append(el('h3', 'Review campaign action'), el('p', message));
      let finished = false;
      const finish = accepted => {
        if (finished) return;
        finished = true; dialog.close(); dialog.remove(); pageTabs.get(activeView).focus(); resolve(accepted);
      };
      const confirm = button(label, () => finish(true));
      confirm.className = label === 'Confirm cancellation' ? 'button button-danger' : 'button button-primary';
      if (broadAudience) {
        const acknowledgement = el('input'); acknowledgement.type = 'checkbox';
        confirm.disabled = true;
        acknowledgement.onchange = () => { confirm.disabled = !acknowledgement.checked; };
        dialog.append(field('Seçili toplu hedef kitleye gönderim yapacağımı onaylıyorum.', acknowledgement));
      }
      dialog.append(button('Back', () => finish(false)), confirm);
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      root.append(dialog); dialog.showModal();
    });
  }
  let editing = null, dirty = false, busy = false, readOnly = false, refreshSequence = 0, lastAttempt = null;
  const labels = new Map();
  root.replaceChildren();
  root.append(el('h2', 'Push notifications'));
  root.append(el('p', 'Bildirimini hazırla, zamanla ve geçmişten takip et. Bu alan yalnız owner hesabına açıktır; uygulama içi duyuru banner’ından ayrıdır.'));
  const pageTablist = el('div'); pageTablist.className = 'notification-page-tabs';
  pageTablist.setAttribute('role', 'tablist'); pageTablist.setAttribute('aria-label', 'Bildirim yönetimi');
  const pageTabs = new Map(), pagePanels = new Map();
  let activeView = 'compose';
  for (const [key, title] of [['compose', 'Yeni bildirim'], ['history', 'Gönderim geçmişi']]) {
    const tab = button(title, () => selectView(key));
    tab.id = `notification-view-tab-${key}`; tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', `notification-view-${key}`);
    const panel = el('section'); panel.id = `notification-view-${key}`;
    panel.className = 'notification-page-panel'; panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', tab.id);
    pageTabs.set(key, tab); pagePanels.set(key, panel); pageTablist.append(tab);
    tab.onkeydown = event => {
      if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 'compose' : event.key === 'End' ? 'history' : key === 'compose' ? 'history' : 'compose';
      selectView(next); pageTabs.get(next).focus();
    };
  }
  function selectView(key) {
    activeView = key;
    for (const [name, panel] of pagePanels) {
      panel.hidden = name !== key; pageTabs.get(name).setAttribute('aria-selected', String(name === key));
      pageTabs.get(name).tabIndex = name === key ? 0 : -1;
    }
  }
  root.append(pageTablist, ...pagePanels.values()); selectView('compose');
  const composePanel = pagePanels.get('compose'), historyPanel = pagePanels.get('history');
  const settings = el('section'); settings.className = 'panel panel-card notification-delivery-settings';
  const settingsStatus = el('p', 'Gönderim ayarları yükleniyor…'); settingsStatus.setAttribute('aria-live', 'polite');
  const limitEnabled = el('input'); limitEnabled.type = 'checkbox'; limitEnabled.disabled = true;
  const limitValue = el('input'); limitValue.type = 'number'; limitValue.min = 1; limitValue.max = 10000;
  limitValue.step = 1; limitValue.placeholder = '1–10000'; limitValue.disabled = true;
  const settingsError = el('p'); settingsError.setAttribute('role', 'alert');
  const settingsSave = button('Ayarları kaydet', async () => {
    settingsError.textContent = '';
    try {
      const input = notificationDeliverySettingsInput(limitEnabled.checked, limitValue.value);
      if (!await confirmAction(input.p_daily_limit_enabled ?
        `Kişi başına günlük sınır ${input.p_daily_limit} bildirim olsun mu? Bugünkü mevcut gönderimler de sayılır.` :
        'Günlük sayı sınırı kapatılsın mı? İzinler, sessiz saatler ve güvenli kuyruk kontrolleri devam eder; bu işlem bildirim göndermez.', 'Ayarları onayla')) return;
      settingsSave.disabled = true; settingsReload.disabled = true; limitEnabled.disabled = true; limitValue.disabled = true;
      const result = await rpc('admin_update_notification_delivery_settings', input);
      renderSettings(result); notify('Bildirim ayarları kaydedildi.');
    } catch (failure) { settingsError.textContent = `Ayar kaydı doğrulanamadı: ${failure.message}. Mevcut değeri görmek için ayarları yenile.`; }
    finally { settingsSave.disabled = false; settingsReload.disabled = false; limitEnabled.disabled = false; limitValue.disabled = !limitEnabled.checked; }
  });
  const settingsReload = button('Ayarları yenile', () => loadSettings());
  settingsSave.disabled = true;
  function renderSettings(value) {
    limitEnabled.checked = value.daily_limit_enabled;
    limitValue.value = value.daily_limit_enabled ? value.daily_limit : '';
    limitEnabled.disabled = false; limitValue.disabled = !limitEnabled.checked; settingsSave.disabled = false;
    settingsStatus.textContent = `Push gönderimi ${value.push_enabled ? 'açık' : 'kapalı'} · ${value.daily_limit_enabled ? `Kişi başına günlük sınır: ${value.daily_limit}` : 'Günlük sayı sınırı yok'}`;
  }
  async function loadSettings() {
    settingsError.textContent = ''; settingsSave.disabled = true; settingsReload.disabled = true;
    limitEnabled.disabled = true; limitValue.disabled = true; settingsStatus.textContent = 'Gönderim ayarları yükleniyor…';
    try { renderSettings(await rpc('admin_get_notification_delivery_settings')); }
    catch (failure) { settingsStatus.textContent = `Ayarlar okunamadı: ${failure.message}. Sınır kapalı varsayılmadı; yeniden dene.`; }
    finally { settingsReload.disabled = false; }
  }
  limitEnabled.onchange = () => { limitValue.disabled = !limitEnabled.checked; };
  settings.append(el('h3', 'Bildirim gönderim ayarları'), settingsStatus,
    field('Kişi başına günlük sınır uygula', limitEnabled), field('Günlük bildirim sayısı', limitValue),
    el('small', 'Kapalıysa günlük sayı sınırı yoktur. Açıksa kullanıcının yerel gününe göre hesaplanır; cihaz sayısı ve tekrar denemeler aynı bildirimi iki kez saymaz. İzin ve sessiz saat kontrolleri her durumda korunur.'),
    settingsSave, settingsReload, settingsError);
  const settingsDetails = el('details'); settingsDetails.className = 'notification-settings-details';
  settingsDetails.append(el('summary', 'Gönderim ayarları · Günlük sınır'), settings);
  const heading = el('h3', 'New campaign');
  heading.tabIndex = -1;
  const form = el('form'); form.className = 'panel panel-card notification-campaign-form';
  form.append(heading);
  let activeLanguage = 'tr';
  const tabs = new Map(), languagePanels = new Map(), languageBadges = new Map();
  const content = el('section'); content.className = 'notification-content';
  content.append(el('h3', 'Notification content'));
  content.append(el('p', 'Write one message per language. Users read the version matching their app language; the lock screen shows a generic localized NomadX message.'));
  const tablist = el('div'); tablist.className = 'notification-language-tabs';
  tablist.setAttribute('role', 'tablist'); tablist.setAttribute('aria-label', 'Message language');
  const translationProgress = el('p'); translationProgress.className = 'notification-language-progress';
  translationProgress.setAttribute('aria-live', 'polite');
  const contentGrid = el('div'); contentGrid.className = 'notification-content-grid';
  const editors = el('div'); editors.className = 'notification-language-editors';
  for (const language of notificationLanguages) {
    const tab = button('', () => selectLanguage(language));
    tab.className = 'notification-language-tab'; tab.id = `notification-tab-${language}`;
    tab.setAttribute('role', 'tab'); tab.setAttribute('aria-controls', `notification-panel-${language}`);
    const badge = el('span'); badge.className = 'notification-language-badge';
    badge.setAttribute('aria-hidden', 'true');
    tab.append(el('span', notificationLanguageNames[language]), badge);
    tab.addEventListener('keydown', event => {
      const index = notificationLanguages.indexOf(language);
      const next = {ArrowRight: (index + 1) % 5, ArrowLeft: (index + 4) % 5, Home: 0, End: 4}[event.key];
      if (next === undefined) return;
      event.preventDefault(); selectLanguage(notificationLanguages[next]);
      tabs.get(notificationLanguages[next]).focus();
    });
    tabs.set(language, tab); languageBadges.set(language, badge); tablist.append(tab);
  }
  for (const language of notificationLanguages) {
    const group = el('section'); group.className = 'notification-language-panel';
    group.id = `notification-panel-${language}`; group.setAttribute('role', 'tabpanel');
    group.setAttribute('aria-labelledby', `notification-tab-${language}`);
    group.append(el('h4', notificationLanguageNames[language]));
    for (const [name, title, max] of [['title', 'Title', 160], ['body', 'Message', 1000]]) {
      const input = el(name === 'body' ? 'textarea' : 'input');
      input.name = `${name}_${language}`; input.maxLength = max;
      input.lang = language;
      if (name === 'body') input.rows = 5;
      group.append(field(`${title} (${language.toUpperCase()})`, input));
    }
    languagePanels.set(language, group); editors.append(group);
  }
  contentGrid.append(editors); content.append(tablist, translationProgress, contentGrid);
  form.append(content);
  function updateLanguageStatus() {
    const data = new FormData(form);
    let complete = 0;
    for (const language of notificationLanguages) {
      const status = notificationTranslationStatus(data, language);
      const badge = languageBadges.get(language);
      badge.textContent = status === 'complete' ? '✓' : status === 'partial' ? '◐' : '·';
      badge.dataset.status = status;
      tabs.get(language).setAttribute('aria-label', `${notificationLanguageNames[language]} · ${status === 'complete' ? 'ready' : status === 'partial' ? 'incomplete' : 'empty'}`);
      if (status === 'complete') complete++;
    }
    translationProgress.textContent = `${complete}/5 languages ready · All five are required to schedule. You can save an incomplete draft.`;
  }
  function selectLanguage(language) {
    activeLanguage = language;
    for (const key of notificationLanguages) {
      const selected = key === language;
      tabs.get(key).setAttribute('aria-selected', String(selected));
      tabs.get(key).tabIndex = selected ? 0 : -1;
      languagePanels.get(key).hidden = !selected;
    }
    showPreview();
  }

  const audienceSection = el('section'); audienceSection.className = 'notification-audience-section';
  audienceSection.append(el('h3', '1. Kime gönderilsin?'), el('p', 'Boş seçim hiçbir zaman herkese göndermez. Toplu gönderim için aşağıdaki seçeneği özellikle seçmelisin.'));
  const modeGroup = el('fieldset'); modeGroup.className = 'notification-audience-modes';
  modeGroup.append(el('legend', 'Hedef kitle'));
  const modes = new Map();
  for (const [value, title, description] of [
    ['selected', 'Belirli kullanıcılar', 'Kullanıcı ara ve seç · En fazla 100 kişi'],
    ['all', 'Tüm uygun kullanıcılar', 'Duyuru izni veren tüm kayıtlı kullanıcılar'],
    ['countries', 'Ülkeye göre', 'Seçtiğin ülkelerde kayıtlı ve duyuru izni veren kullanıcılar'],
  ]) {
    const radio = el('input'); radio.type = 'radio'; radio.name = 'audience_mode'; radio.value = value; radio.checked = value === 'selected';
    const card = el('label'); card.className = 'notification-audience-mode';
    const copy = el('span'); copy.append(el('strong', title), el('small', description));
    card.append(radio, copy); modeGroup.append(card); modes.set(value, radio);
    radio.onchange = () => { dirty = true; showAudienceMode(); void refreshAudience(); };
  }
  audienceSection.append(modeGroup);
  const selectedPicker = el('div'); selectedPicker.className = 'notification-selected-picker';
  const selected = el('div'); selected.className = 'notification-recipients';
  selected.setAttribute('aria-live', 'polite');
  selectedPicker.append(el('h4', 'Seçili kullanıcılar'), selected);
  const advanced = el('details'); advanced.append(el('summary', 'Advanced: recipient IDs'));
  const recipients = el('textarea'); recipients.name = 'recipients';
  advanced.append(field('Recipient UUIDs (optional advanced entry; up to 100)', recipients));
  selectedPicker.append(advanced);
  function showRecipients() {
    selected.replaceChildren();
    const ids = recipientIds(recipients.value);
    if (!ids.length) selected.append(el('p', 'No users selected. Save a draft or search below.'));
    for (const id of ids) {
      const chip = el('div'); chip.className = 'notification-recipient';
      const title = labels.get(id) || `Saved recipient (${id.slice(0, 8)}…)`;
      const remove = button('Remove', () => {
        recipients.value = recipientIds(recipients.value).filter(value => value !== id).join('\n');
        dirty = true; showRecipients(); void refreshAudience();
      });
      remove.setAttribute('aria-label', `Remove ${title}`);
      chip.append(el('span', title), remove);
      selected.append(chip);
    }
  }
  function addRecipient(id, label) {
    if (busy || readOnly) return;
    if (!userIdPattern.test(id || '')) { notify('Invalid user record.', true); return; }
    id = id.toLowerCase();
    const ids = recipientIds(recipients.value);
    if (ids.length >= 100 && !ids.includes(id)) { notify('Maximum 100 recipients.', true); return; }
    labels.set(id, label); recipients.value = [...new Set([...ids, id])].join('\n');
    dirty = true; showRecipients(); void refreshAudience();
  }
  recipients.addEventListener('input', showRecipients);
  const search = el('input'); search.type = 'search';
  const searchButton = button('Search users', async () => {
    searchButton.disabled = true; matches.textContent = 'Loading…';
    try {
      const users = await rpc('admin_list_users', {
        search_text: search.value.trim(), page_size: 20, page_offset: 0});
      matches.replaceChildren();
      if (!users.length) matches.append(el('p', 'No matching users.'));
      for (const user of users) {
        const id = user.user_id;
        const title = user.username || user.full_name || user.email || id;
        matches.append(button(`Add ${title}`, () => addRecipient(id, title)));
      }
    } catch (error) { matches.textContent = `Unavailable: ${error.message}`; }
    finally { searchButton.disabled = busy || readOnly; }
  });
  const matches = el('div'); matches.setAttribute('aria-live', 'polite');
  search.addEventListener('keydown', event => {
    if (event.key === 'Enter') { event.preventDefault(); if (!searchButton.disabled) searchButton.click(); }
  });
  selectedPicker.append(field('Find recipients by username or email', search), searchButton, matches);
  if (adminUserId) selectedPicker.append(button('Use only my account for a test', () => {
    recipients.value = ''; addRecipient(adminUserId, 'My account');
  }));

  const countriesValue = el('input'); countriesValue.type = 'hidden'; countriesValue.name = 'country_codes';
  const countryPicker = el('div'); countryPicker.className = 'notification-country-picker';
  const countrySearch = el('input'); countrySearch.type = 'search'; countrySearch.placeholder = 'Ülke ara';
  const countryList = el('div'); countryList.className = 'notification-country-list';
  const countryInfo = el('p'); const countryChecks = new Map();
  countryPicker.append(el('h4', 'Ülkeleri seç'), field('Ülke ara', countrySearch), countryList, countryInfo,
    el('small', 'Profildeki son kayıtlı ülke kullanılır; canlı konum takibi değildir. Ülkesi bilinmeyenler bu hedefe dahil edilmez.'));
  const allNotice = el('p', 'Tüm uygun kullanıcılar: yalnız duyuru izni veren hesaplar dahil edilir. Push izni veya aktif cihazı olmayanlar yalnız uygulama içi bildirim kutusunda görür. Toplu gönderimler kuyrukta parça parça işlenir; anında teslim garantisi yoktur.');
  allNotice.className = 'notification-audience-notice';
  const audienceSummary = el('div'); audienceSummary.className = 'notification-audience-summary';
  audienceSummary.setAttribute('aria-live', 'polite');
  const audienceReload = button('Hedef kitleyi yeniden hesapla', () => refreshAudience());
  let audienceSequence = 0;
  const mode = () => [...modes].find(([, radio]) => radio.checked)?.[0] || 'selected';
  function countryName(code) {
    try { return new Intl.DisplayNames(['tr'], {type: 'region'}).of(code) || code; } catch { return code; }
  }
  function audienceLabel(input) {
    return input.p_mode === 'all' ? 'Tüm uygun kullanıcılar' : input.p_mode === 'countries' ?
      `Ülkeler: ${input.p_country_codes.map(countryName).join(', ')}` : `${input.p_recipient_ids.length} seçili kullanıcı`;
  }
  function showAudienceMode() {
    selectedPicker.hidden = mode() !== 'selected'; countryPicker.hidden = mode() !== 'countries';
    allNotice.hidden = mode() !== 'all';
    for (const [code, check] of countryChecks) check.checked = countriesValue.value.split(',').includes(code);
  }
  function renderAudience(summary) {
    audienceSummary.replaceChildren(el('strong', 'Tahmini erişim'), el('p',
      `${summary.matched_users} eşleşen hesap · ${summary.inbox_users} uygulama içi alıcı · ${summary.push_users} push alıcısı · ${summary.push_devices} aktif cihaz`),
    el('small', `${summary.excluded_by_consent} hesap duyuru izni vermediği için dışarıda. ${summary.inbox_only_users} kişi push yerine yalnız bildirim kutusunda görür. Sessiz saatler ve günlük kota gönderimde ayrıca kontrol edilir.`));
  }
  async function refreshAudience() {
    const sequence = ++audienceSequence;
    audienceSummary.textContent = 'Hedef kitle hesaplanıyor…';
    try {
      const input = notificationAudienceInput(new FormData(form), {draft: true});
      if ((input.p_mode === 'selected' && !input.p_recipient_ids.length) ||
          (input.p_mode === 'countries' && !input.p_country_codes.length)) {
        audienceSummary.textContent = input.p_mode === 'selected' ? 'Henüz kullanıcı seçilmedi. Kimseye gönderilmez.' : 'Henüz ülke seçilmedi. Kimseye gönderilmez.';
        return;
      }
      const summary = await rpc('admin_preview_notification_segment', input);
      if (sequence === audienceSequence) renderAudience(summary);
    } catch (failure) {
      if (sequence === audienceSequence) audienceSummary.textContent = `Erişim hesaplanamadı: ${failure.message}. Bu bir sıfır alıcı sonucu değildir; yeniden dene.`;
    }
  }
  async function loadCountries() {
    countryList.textContent = 'Ülkeler yükleniyor…';
    try {
      const data = await rpc('admin_notification_audience_countries');
      countryList.replaceChildren();
      for (const item of data.countries.sort((a, b) => countryName(a.country_code).localeCompare(countryName(b.country_code), 'tr'))) {
        const checkbox = el('input'); checkbox.type = 'checkbox';
        const label = field(`${countryName(item.country_code)} · ${item.inbox_users} izinli`, checkbox);
        label.dataset.countryLabel = `${countryName(item.country_code)} ${item.country_code}`.toLocaleLowerCase('tr');
        countryList.append(label); countryChecks.set(item.country_code, checkbox);
        checkbox.onchange = () => {
          countriesValue.value = [...countryChecks].filter(([, check]) => check.checked).map(([code]) => code).sort().join(',');
          dirty = true; void refreshAudience();
        };
      }
      if (!data.countries.length) countryList.textContent = 'Ülke bilgisi kayıtlı kullanıcı bulunamadı.';
      countryInfo.textContent = `${data.unknown_country_users} hesabın ülkesi bilinmiyor; ülke hedeflemesine dahil edilmez.`;
      showAudienceMode();
      setBusy(busy);
    } catch (failure) { countryList.textContent = `Ülkeler yüklenemedi: ${failure.message}`; }
  }
  countrySearch.oninput = () => {
    const term = countrySearch.value.toLocaleLowerCase('tr').trim();
    countryList.querySelectorAll('label').forEach(label => { label.hidden = !label.dataset.countryLabel.includes(term); });
  };
  recipients.addEventListener('change', () => { void refreshAudience(); });
  audienceSection.append(selectedPicker, countriesValue, countryPicker, allNotice, audienceSummary, audienceReload);
  form.append(audienceSection, el('h3', '2. Ne zaman gönderilsin?'));

  const date = el('input'); date.type = 'datetime-local'; date.name = 'scheduled_at';
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  form.append(field(`Schedule (${zone}; optional for drafts)`, date));
  form.append(button('Schedule as soon as possible', () => {
    const next = new Date(Date.now() + 60000);
    next.setMinutes(next.getMinutes() - next.getTimezoneOffset());
    date.value = next.toISOString().slice(0, 16); dirty = true;
  }));
  const previewCard = el('aside'); previewCard.className = 'notification-preview-card';
  const previewHeading = el('h4');
  const preview = el('div'); preview.className = 'notification-preview';
  preview.setAttribute('aria-live', 'polite');
  const characterCount = el('small');
  function showPreview() {
    const title = form.elements[`title_${activeLanguage}`].value;
    const body = form.elements[`body_${activeLanguage}`].value;
    previewHeading.textContent = `In-app preview · ${notificationLanguageNames[activeLanguage]}`;
    preview.replaceChildren(el('strong', title || 'Your notification title'), el('p', body || 'Your message will appear here.'));
    characterCount.textContent = `Title ${title.length}/160 · Message ${body.length}/1000`;
  }
  previewCard.append(previewHeading, preview, characterCount,
    el('p', 'Lock screen: “NomadX · You have a new notification…” in the registered app language. The full message is read inside the app.'));
  contentGrid.append(previewCard);
  const error = el('p'); error.setAttribute('role', 'alert');
  const draftButton = button('Save draft', () => save(true), true);
  const submit = el('button', 'Review and schedule'); submit.type = 'submit';
  submit.className = 'button button-primary';
  submit.dataset.mutatesCampaign = 'true';
  const newButton = button('New campaign', async () => {
    const message = lastAttempt ? 'The previous save outcome is unknown and may already be scheduled. Check history before creating another campaign. Discard this form?' : 'Discard unsaved form changes? Saved campaigns are kept.';
    if ((dirty || lastAttempt) && !await confirmAction(message, 'Discard changes')) return;
    reset();
  }, true);
  form.append(el('p', 'Toplu hedef kitle zamanlama anında sabitlenir. İzinler gönderimde tekrar kontrol edilir. Yeni gönderim yalnız son onayından sonra zamanlanır.'), draftButton, submit, newButton, error);
  const history = el('div'); history.className = 'notification-history-grid'; history.setAttribute('aria-live', 'polite');
  const reload = button('Geçmişi yenile', () => refresh());
  const historyHeading = el('h3', 'Gönderim geçmişi');
  const historyIntro = el('p', 'Son 100 bildirim kampanyası. Yeniden gönder seçeneği yeni bir form açar; eski kayıt değişmez ve onayın olmadan gönderim yapılmaz.');
  const historyStats = el('div'); historyStats.className = 'notification-history-stats';
  const historyTools = el('div'); historyTools.className = 'notification-history-tools';
  const historySearch = el('input'); historySearch.type = 'search'; historySearch.placeholder = 'Başlık veya mesajda ara';
  const historyFilter = el('select');
  for (const [value, title] of [['all', 'Tüm durumlar'], ['queued', 'İşlenen bildirimler'], ['scheduled', 'Zamanlanmış'], ['draft', 'Taslaklar'], ['cancelled', 'İptal edilenler']]) {
    const option = el('option', title); option.value = value; historyFilter.append(option);
  }
  const historyLanguage = el('select');
  for (const language of notificationLanguages) { const option = el('option', notificationLanguageNames[language]); option.value = language; historyLanguage.append(option); }
  historyTools.append(field('Bildirim ara', historySearch), field('Durum', historyFilter), field('İçerik dili', historyLanguage), reload);
  let historyRows = [], historyFailure = '', historyLoading = false;
  historySearch.oninput = historyFilter.onchange = historyLanguage.onchange = () => renderHistory();
  historyPanel.append(historyHeading, historyIntro, historyStats, historyTools,
    el('p', '“FCM kabul etti”, gönderim servisinin isteği kabul ettiğini gösterir; telefonda görüntülendiği veya okunduğu anlamına gelmez.'), history);
  function setBusy(value) {
    busy = value;
    root.querySelectorAll('button[data-mutates-campaign]').forEach(node => { node.disabled = value; });
    form.querySelectorAll('input, textarea, select, button').forEach(node => { node.disabled = value || readOnly; });
    newButton.disabled = value;
    for (const tab of tabs.values()) tab.disabled = value;
  }
  function reset() {
    form.reset(); editing = null; dirty = false; readOnly = false; lastAttempt = null; labels.clear(); matches.replaceChildren();
    modes.get('selected').checked = true; countriesValue.value = ''; countrySearch.value = '';
    countryList.querySelectorAll('label').forEach(label => { label.hidden = false; });
    heading.textContent = 'New campaign';
    error.textContent = ''; showRecipients(); showAudienceMode(); void refreshAudience(); updateLanguageStatus(); selectLanguage('tr');
    setBusy(busy);
  }
  async function edit(item) {
    if (busy || ((dirty || lastAttempt) && !await confirmAction('Mevcut form değişiklikleri bırakılsın mı? Son kaydın sonucu belirsizse önce geçmişten kontrol et.', 'Değişiklikleri bırak'))) return;
    reset(); editing = {id: item.id, revision: item.revision, state: item.state};
    selectView('compose');
    heading.textContent = `Editing ${item.state} · revision ${item.revision}`;
    for (const lang of notificationLanguages) {
      form.elements[`title_${lang}`].value = item.titles[lang] || '';
      form.elements[`body_${lang}`].value = item.bodies[lang] || '';
    }
    recipients.value = (item.recipient_ids || []).join('\n');
    modes.get(item.audience_mode || 'selected').checked = true;
    countriesValue.value = (item.audience_country_codes || []).join(',');
    if (item.scheduled_at) {
      const time = new Date(item.scheduled_at);
      time.setMinutes(time.getMinutes() - time.getTimezoneOffset());
      date.value = time.toISOString().slice(0, 16);
    }
    showRecipients(); showAudienceMode(); void refreshAudience(); updateLanguageStatus(); showPreview(); heading.scrollIntoView({block: 'nearest'});
  }
  async function copyCampaign(item) {
    if (busy || ((dirty || lastAttempt) && !await confirmAction('Mevcut form değişiklikleri bırakılsın mı? Belirsiz bir kayıt varsa önce geçmişten kontrol et.', 'Değişiklikleri bırak'))) return;
    try {
      const data = notificationCampaignCopy(item);
      reset();
      for (const language of notificationLanguages) {
        form.elements[`title_${language}`].value = data.get(`title_${language}`);
        form.elements[`body_${language}`].value = data.get(`body_${language}`);
      }
      modes.get(data.get('audience_mode')).checked = true;
      recipients.value = data.get('recipients'); countriesValue.value = data.get('country_codes');
      date.value = ''; dirty = true;
      heading.textContent = 'Yeniden gönder · Yeni bildirim';
      showRecipients(); showAudienceMode(); void refreshAudience(); updateLanguageStatus(); showPreview();
      selectView('compose'); heading.focus(); heading.scrollIntoView({block: 'nearest'});
      notify('İçerik ve hedef kitle kopyalandı. Zaman seçip kontrol et; henüz gönderilmedi. Ülke/tüm kullanıcı hedefleri güncel izinlere göre yeniden hesaplanır.');
    } catch (failure) { notify(`Kopyalanamadı: ${failure.message}`, true); }
  }
  function renderHistory() {
    history.replaceChildren(); historyStats.replaceChildren();
    if (historyLoading) { history.textContent = 'Geçmiş yükleniyor…'; return; }
    if (historyFailure) { history.textContent = historyFailure; return; }
    const metrics = [['Kampanya', historyRows.length], ['FCM kabulü · cihaz işi', historyRows.reduce((n, item) => n + (item.delivery_summary?.accepted || 0), 0)],
      ['Zamanlanmış', historyRows.filter(item => item.state === 'scheduled').length]];
    for (const [title, count] of metrics) { const card = el('div'); card.append(el('strong', String(count)), el('span', title)); historyStats.append(card); }
    const query = historySearch.value.trim().toLocaleLowerCase('tr');
    const filtered = historyRows.filter(item => (historyFilter.value === 'all' || item.state === historyFilter.value) &&
      (!query || [...Object.values(item.titles || {}), ...Object.values(item.bodies || {})].join(' ').toLocaleLowerCase('tr').includes(query)));
    if (!filtered.length) history.append(el('p', historyRows.length ? 'Aramana uygun bildirim bulunamadı. Filtreleri değiştirebilirsin.' : 'Henüz bildirim yok. İlk bildirimini Yeni bildirim sekmesinden hazırlayabilirsin.'));
    for (const item of filtered) {
      const row = el('article'); row.className = 'panel panel-card notification-history-card';
      const status = notificationCampaignStatus(item), badge = el('span', status.label);
      badge.className = 'notification-status'; badge.dataset.tone = status.tone;
      const language = historyLanguage.value;
      const rowHeader = el('div'); rowHeader.className = 'notification-history-card-header';
      rowHeader.append(el('small', notificationLanguageNames[language]), badge);
      const title = item.titles?.[language], body = item.bodies?.[language];
      const message = el('p', body || 'Bu dilde mesaj eklenmemiş.'); message.className = 'notification-history-message';
      row.append(rowHeader, el('h4', title || 'Bu dilde başlık yok'), message);
      const meta = el('dl'); meta.className = 'notification-history-meta';
      const time = item.scheduled_at ? new Date(item.scheduled_at).toLocaleString('tr-TR', {dateStyle: 'medium', timeStyle: 'short'}) : 'Zaman seçilmemiş';
      for (const [label, value] of [['Planlanan zaman', `${time}${item.scheduled_at ? ` · ${zone}` : ''}`],
        ['Hedef kitle', audienceLabel({p_mode: item.audience_mode || 'selected', p_country_codes: item.audience_country_codes || [], p_recipient_ids: item.recipient_ids || []})],
        ['Hedef kullanıcı', String(item.recipient_count ?? 'Bilinmiyor')]]) { meta.append(el('dt', label), el('dd', value)); }
      row.append(meta);
      const delivery = el('div'); delivery.className = 'notification-history-delivery';
      const deliveryNames = {accepted: 'FCM kabul etti', pending: 'Sırada', leased: 'İşleniyor', retry: 'Tekrar denenecek', failed: 'Başarısız', invalid_token: 'Geçersiz cihaz', cancelled: 'İptal', skipped: 'Atlandı'};
      for (const [name, count] of Object.entries(item.delivery_summary || {})) if (count > 0) delivery.append(el('span', `${deliveryNames[name] || name}: ${count}`));
      if (!delivery.childElementCount) delivery.append(el('span', 'Henüz push cihaz işi yok. Uygulama içi alıcılar ayrı işlenir.'));
      const actions = el('div'); actions.className = 'notification-history-actions';
      const resend = button('Yeniden gönder', () => copyCampaign(item), true); resend.className = 'button button-primary';
      actions.append(resend);
      if (item.can_edit === true && Number.isInteger(item.revision)) actions.append(button('Düzenle', () => edit(item), true));
      const counts = item.delivery_summary || {};
      if (item.state !== 'cancelled' && Number.isInteger(item.revision) &&
          (item.state === 'scheduled' || ['pending', 'leased', 'retry'].some(key => counts[key] > 0))) {
        actions.append(button('Bekleyen gönderimi iptal et', async () => {
          if (busy || !await confirmAction('Yalnız bekleyen gönderimler iptal edilsin mi? Kabul edilen bildirimler geri alınamaz.', 'Confirm cancellation')) return;
          setBusy(true);
          try {
            await rpc('admin_cancel_notification_campaign_revision', {p_id: item.id, p_expected_revision: item.revision});
            if (editing?.id === item.id) reset();
            await refresh(); notify('Bekleyen gönderimler iptal edildi.');
          } catch (failure) { notify(`İptal edilemedi: ${failure.message}. Geçmişi yenile.`, true); }
          finally { setBusy(false); }
        }, true));
      }
      const technical = el('details'); technical.append(el('summary', 'Teknik ayrıntılar'), el('p', `Kampanya: ${item.id} · Sürüm: ${item.revision ?? 'Bilinmiyor'}`));
      row.append(delivery, actions, technical); history.append(row);
    }
    setBusy(busy);
  }
  async function refresh() {
    const sequence = ++refreshSequence;
    historyFailure = ''; historyLoading = true; renderHistory(); reload.disabled = true;
    try {
      const rows = await rpc('admin_list_notification_campaigns');
      if (sequence !== refreshSequence) return;
      historyRows = rows; historyLoading = false;
      const current = editing && rows.find(item => item.id === editing.id);
      if (current && current.can_edit !== true) {
        readOnly = true; editing.state = current.state;
        heading.textContent = `Read-only: ${current.state}. Create a new campaign to change content.`;
      }
      renderHistory();
    } catch (failure) {
      if (sequence === refreshSequence) { historyLoading = false; historyRows = []; historyFailure = `Geçmiş okunamadı: ${failure.message}. Bu bir boş liste sonucu değildir. Formun korundu; yeniden dene.`; renderHistory(); }
    } finally { if (sequence === refreshSequence) reload.disabled = false; }
  }
  async function save(draft) {
    if (busy) return;
    if (readOnly) { notify('Queued or cancelled content cannot be edited. Create a new campaign.', true); return; }
    const formData = new FormData(form);
    let submitted = false;
    error.textContent = ''; setBusy(true);
    try {
      if (!draft) {
        const missing = notificationLanguages.find(language => notificationTranslationStatus(formData, language) !== 'complete');
        if (missing) {
          selectLanguage(missing);
          throw new Error(`Complete ${notificationLanguageNames[missing]}: title and message are required before scheduling.`);
        }
      }
      const input = notificationCampaignMutation(formData, editing, draft);
      const attempt = notificationCampaignOperation(input, lastAttempt);
      if (!draft) {
        const audience = await rpc('admin_preview_notification_segment', {
          p_mode: input.p_mode, p_recipient_ids: input.p_recipient_ids, p_country_codes: input.p_country_codes});
        renderAudience(audience);
        if (!audience.inbox_users) throw new Error('Bu hedef kitlede duyuru izni veren kullanıcı yok. Gönderim oluşturulmadı.');
        if (!await confirmAction(`Hedef: ${audienceLabel(input)}. ${new Date(input.p_scheduled_at).toLocaleString()} (${zone}) için zamanlanacak. Tahmini ${audience.inbox_users} uygulama içi alıcı, ${audience.push_users} push alıcısı, ${audience.push_devices} cihaz. İzinler, sessiz saatler ve kota gönderimde kontrol edilir.`, 'Confirm schedule', {broadAudience: input.p_mode !== 'selected'})) return;
      } else if (editing?.state === 'scheduled' && !await confirmAction('Save as draft and remove the existing schedule?', 'Confirm draft')) return;
      lastAttempt = attempt;
      submitted = true;
      const result = await rpc('admin_save_notification_campaign_segment', {...input, p_operation_id: lastAttempt.id});
      lastAttempt = null;
      editing = {id: result.id, revision: result.revision, state: result.state}; dirty = false;
      heading.textContent = `Editing ${result.state} · revision ${result.revision}`;
      notify(draft ? 'Draft saved; nothing scheduled or sent.' : 'Scheduled; not a delivery confirmation.');
      await refresh();
      if (!draft) selectView('history');
    } catch (failure) {
      const rejected = ['40001', '22023', '42501', 'P0002'].includes(failure.code);
      if (rejected) lastAttempt = null;
      if (!submitted && !lastAttempt) error.textContent = failure.message;
      else if (rejected) error.textContent = `Could not save: ${failure.message}. Your form has been kept.${failure.code === '40001' ? ' Refresh history and reopen the latest campaign.' : ''}`;
      else error.textContent = `Save not confirmed: ${failure.message}. Your form has been kept. A lost response may have committed: retry unchanged to confirm, or check history before changing the campaign.`;
    } finally { setBusy(false); }
  }
  form.addEventListener('input', () => { dirty = true; updateLanguageStatus(); showPreview(); });
  form.onsubmit = event => { event.preventDefault(); return save(false); };
  composePanel.append(form, settingsDetails, el('p', 'Zamanlanmış bildirimler düzenleme sırasında işlenebilir. Gönderimi durdurmak için geçmişten “Bekleyen gönderimi iptal et” seçeneğini kullan.'));
  showRecipients(); showAudienceMode(); void refreshAudience(); void loadCountries(); void loadSettings(); updateLanguageStatus(); selectLanguage('tr');
  return refresh();
}
