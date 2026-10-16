export const notificationLanguages = ['tr', 'en', 'de', 'fr', 'es'];
export const notificationLanguageNames = {tr: 'Türkçe', en: 'English', de: 'Deutsch', fr: 'Français', es: 'Español'};
export function notificationTranslationStatus(form, language) {
  const title = form.get(`title_${language}`)?.trim() || '';
  const body = form.get(`body_${language}`)?.trim() || '';
  return !title && !body ? 'empty' : title && body ? 'complete' : 'partial';
}
const userIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const recipientIds = value => [...new Set((value || '').split(/[\s,;]+/)
  .filter(Boolean).map(id => id.toLowerCase()))];

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
  const recipients = recipientIds(form.get('recipients'));
  if ((!draft && !recipients.length) || recipients.length > 100 ||
      recipients.some(id => !userIdPattern.test(id))) {
    throw new Error('Choose up to 100 valid users; scheduling requires at least one.');
  }
  const dateText = form.get('scheduled_at');
  const scheduled = dateText ? new Date(dateText) : null;
  if ((scheduled && !Number.isFinite(scheduled.getTime())) ||
      (!draft && (!scheduled || scheduled.getTime() < Date.now() - 120000 ||
        scheduled.getTime() > Date.now() + 365 * 86400000))) {
    throw new Error('Choose a valid time within the next 365 days.');
  }
  return {p_titles: titles, p_bodies: bodies, p_recipient_ids: recipients,
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
  function confirmAction(message, label = 'Confirm') {
    return new Promise(resolve => {
      const dialog = el('dialog'); dialog.className = 'notification-confirm';
      dialog.setAttribute('aria-label', 'Confirm campaign action');
      dialog.append(el('h3', 'Review campaign action'), el('p', message));
      let finished = false;
      const finish = accepted => {
        if (finished) return;
        finished = true; dialog.close(); dialog.remove(); heading.focus(); resolve(accepted);
      };
      const confirm = button(label, () => finish(true));
      confirm.className = label === 'Confirm cancellation' ? 'button button-danger' : 'button button-primary';
      dialog.append(button('Back', () => finish(false)), confirm);
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      root.append(dialog); dialog.showModal();
    });
  }
  let editing = null, dirty = false, busy = false, readOnly = false, refreshSequence = 0, lastAttempt = null;
  const labels = new Map();
  root.replaceChildren();
  root.append(el('h2', 'Push notifications'));
  root.append(el('p', 'Owner only · These campaigns are separate from the in-app Announcements banner. Scheduling does not confirm delivery; the server worker, scheduler and push flag must be enabled separately.'));
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

  const selected = el('div'); selected.className = 'notification-recipients';
  selected.setAttribute('aria-live', 'polite');
  form.append(el('h3', 'Selected recipients'), selected);
  const advanced = el('details'); advanced.append(el('summary', 'Advanced: recipient IDs'));
  const recipients = el('textarea'); recipients.name = 'recipients';
  advanced.append(field('Recipient UUIDs (optional advanced entry; up to 100)', recipients));
  form.append(advanced);
  function showRecipients() {
    selected.replaceChildren();
    const ids = recipientIds(recipients.value);
    if (!ids.length) selected.append(el('p', 'No users selected. Save a draft or search below.'));
    for (const id of ids) {
      const chip = el('div'); chip.className = 'notification-recipient';
      const title = labels.get(id) || `Saved recipient (${id.slice(0, 8)}…)`;
      const remove = button('Remove', () => {
        recipients.value = recipientIds(recipients.value).filter(value => value !== id).join('\n');
        dirty = true; showRecipients();
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
    dirty = true; showRecipients();
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
  form.append(field('Find recipients by username or email', search), searchButton, matches);
  if (adminUserId) form.append(button('Use only my account for a test', () => {
    recipients.value = ''; addRecipient(adminUserId, 'My account');
  }));

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
  form.append(draftButton, submit, newButton, error);
  const history = el('div'); history.setAttribute('aria-live', 'polite');
  const reload = button('Refresh history', () => refresh());
  function setBusy(value) {
    busy = value;
    root.querySelectorAll('button[data-mutates-campaign]').forEach(node => { node.disabled = value; });
    form.querySelectorAll('input, textarea, select, button').forEach(node => { node.disabled = value || readOnly; });
    newButton.disabled = value;
    for (const tab of tabs.values()) tab.disabled = value;
  }
  function reset() {
    form.reset(); editing = null; dirty = false; readOnly = false; lastAttempt = null; labels.clear(); matches.replaceChildren();
    heading.textContent = 'New campaign';
    error.textContent = ''; showRecipients(); updateLanguageStatus(); selectLanguage('tr');
    setBusy(busy);
  }
  async function edit(item) {
    if (busy || (dirty && !await confirmAction('Discard unsaved form changes and open this campaign?', 'Discard changes'))) return;
    reset(); editing = {id: item.id, revision: item.revision, state: item.state};
    heading.textContent = `Editing ${item.state} · revision ${item.revision}`;
    for (const lang of notificationLanguages) {
      form.elements[`title_${lang}`].value = item.titles[lang] || '';
      form.elements[`body_${lang}`].value = item.bodies[lang] || '';
    }
    recipients.value = (item.recipient_ids || []).join('\n');
    if (item.scheduled_at) {
      const time = new Date(item.scheduled_at);
      time.setMinutes(time.getMinutes() - time.getTimezoneOffset());
      date.value = time.toISOString().slice(0, 16);
    }
    showRecipients(); updateLanguageStatus(); showPreview(); heading.scrollIntoView({block: 'nearest'});
  }
  async function refresh() {
    const sequence = ++refreshSequence;
    history.textContent = 'Loading…';
    try {
      const rows = await rpc('admin_list_notification_campaigns');
      if (sequence !== refreshSequence) return;
      history.replaceChildren();
      const current = editing && rows.find(item => item.id === editing.id);
      if (current && current.can_edit !== true) {
        readOnly = true; editing.state = current.state;
        heading.textContent = `Read-only: ${current.state}. Create a new campaign to change content.`;
      }
      if (!rows.length) history.append(el('p', 'No campaigns.'));
      for (const item of rows) {
        const row = el('article'); row.className = 'panel panel-card';
        row.append(el('h3', item.titles.tr || item.titles.en || 'Untitled draft'), el('p',
          `${item.state} · revision ${item.revision ?? 'unavailable'} · ${item.scheduled_at ? new Date(item.scheduled_at).toLocaleString() : 'Not scheduled'} · ${item.recipient_count} selected users`));
        row.append(el('p', Object.entries(item.delivery_summary ?? {})
          .map(([name, count]) => `${name}: ${count}`).join(' · ') || 'No delivery jobs yet.'));
        row.append(el('small', 'Accepted means FCM accepted, not delivered or read. Queued content is immutable; cancelling stops pending delivery only.'));
        if (item.can_edit === true && Number.isInteger(item.revision)) {
          row.append(button('Edit campaign', () => edit(item), true));
        }
        if (item.state !== 'cancelled' && Number.isInteger(item.revision)) {
          row.append(button('Cancel pending delivery', async () => {
            if (busy || !await confirmAction('Cancel this campaign? Already accepted messages cannot be recalled.', 'Confirm cancellation')) return;
            setBusy(true);
            try {
              await rpc('admin_cancel_notification_campaign_revision', {
                p_id: item.id, p_expected_revision: item.revision});
              if (editing?.id === item.id) reset();
              await refresh(); notify('Cancelled pending delivery only.');
            } catch (failure) { notify(`Cancellation failed: ${failure.message}. Refresh history before retrying.`, true); }
            finally { setBusy(false); }
          }, true));
        }
        history.append(row);
      }
      setBusy(busy);
    } catch (failure) {
      if (sequence === refreshSequence) history.textContent = `Unavailable: ${failure.message}. Your form has been kept. Refresh to retry.`;
    }
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
        const audience = await rpc('admin_preview_notification_audience', {
          p_recipient_ids: input.p_recipient_ids});
        if (!await confirmAction(`Schedule ${input.p_recipient_ids.length} selected users for ${new Date(input.p_scheduled_at).toLocaleString()} (${zone})? Currently ${audience.inbox_users} inbox subscribers and ${audience.push_devices} push devices. Permissions, quiet hours and limits are rechecked at delivery.`, 'Confirm schedule')) return;
      } else if (editing?.state === 'scheduled' && !await confirmAction('Save as draft and remove the existing schedule?', 'Confirm draft')) return;
      lastAttempt = attempt;
      submitted = true;
      const result = await rpc('admin_save_notification_campaign', {...input, p_operation_id: lastAttempt.id});
      lastAttempt = null;
      editing = {id: result.id, revision: result.revision, state: result.state}; dirty = false;
      heading.textContent = `Editing ${result.state} · revision ${result.revision}`;
      notify(draft ? 'Draft saved; nothing scheduled or sent.' : 'Scheduled; not a delivery confirmation.');
      await refresh();
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
  root.append(form, reload, history);
  showRecipients(); updateLanguageStatus(); selectLanguage('tr');
  return refresh();
}
