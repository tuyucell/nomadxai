import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const SUPABASE_URL = "https://mewpnmaoihjksorvayjh.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_C2aTJ8BwNZFNyYcLUehGew_eRqDwTAe";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const state = {
  context: null,
  summary: null,
  announcements: [],
  currentSection: "overview",
};

const sectionTitles = {
  overview: "Overview",
  flags: "Feature flags",
  announcements: "Announcements",
  users: "Users",
  reports: "Reports",
  activity: "Activity",
  audit: "Audit log",
  team: "Admin team",
};

const loginView = document.querySelector("#loginView");
const appView = document.querySelector("#appView");
const loginForm = document.querySelector("#loginForm");
const loginButton = document.querySelector("#loginButton");
const loginError = document.querySelector("#loginError");
const loginPanel = document.querySelector("#loginPanel");
const recoveryPanel = document.querySelector("#recoveryPanel");
const recoveryForm = document.querySelector("#recoveryForm");
const recoveryError = document.querySelector("#recoveryError");
const sidebar = document.querySelector("#sidebar");
const toast = document.querySelector("#toast");

let toastTimer;
let isRecoveryFlow =
  new URLSearchParams(window.location.search).get("recovery") === "1" ||
  window.location.hash.includes("type=recovery");

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("is-error", isError);
  toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function setBusy(button, busy, busyLabel = "Working…") {
  if (!button) return;
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalLabel || button.textContent;
    button.disabled = false;
  }
}

function makeElement(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function formatDate(value, includeTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    ...(includeTime ? { timeStyle: "short" } : {}),
  }).format(date);
}

function relativeDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  const deltaSeconds = Math.round((date.getTime() - Date.now()) / 1000);
  const ranges = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
  ];
  const formatter = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, seconds] of ranges) {
    if (Math.abs(deltaSeconds) >= seconds) {
      return formatter.format(Math.round(deltaSeconds / seconds), unit);
    }
  }
  return "Just now";
}

async function callRpc(name, params = {}) {
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

async function enterAdmin(session) {
  if (!session) {
    showLogin();
    return;
  }

  try {
    state.context = await callRpc("admin_get_context");
    loginView.hidden = true;
    appView.hidden = false;
    loginError.textContent = "";
    applyRoleAccess();
    await refreshAll();
  } catch (error) {
    console.error("Admin authorization failed", error);
    await supabase.auth.signOut();
    showLogin("This NomadX account is not approved for admin access.");
  }
}

function showLogin(message = "", isSuccess = false) {
  state.context = null;
  appView.hidden = true;
  loginView.hidden = false;
  loginPanel.hidden = false;
  recoveryPanel.hidden = true;
  loginError.textContent = message;
  loginError.classList.toggle("is-success", isSuccess);
}

function showRecovery(message = "") {
  state.context = null;
  appView.hidden = true;
  loginView.hidden = false;
  loginPanel.hidden = true;
  recoveryPanel.hidden = false;
  recoveryError.textContent = message;
}

function applyRoleAccess() {
  const { email, role } = state.context;
  document.querySelector("#adminEmail").textContent = email || "NomadX admin";
  document.querySelector("#adminRole").textContent = role;
  document.querySelector("#adminInitial").textContent = (email || "N").charAt(0).toUpperCase();

  document.querySelectorAll("[data-role='owner']").forEach((node) => {
    node.hidden = role !== "owner";
  });
  document.querySelectorAll("[data-role='moderation']").forEach((node) => {
    node.hidden = !["owner", "moderator"].includes(role);
  });
}

async function refreshAll() {
  const refreshButton = document.querySelector("#refreshButton");
  setBusy(refreshButton, true, "Refreshing…");
  try {
    await Promise.all([
      loadOverview(),
      loadFeatureFlags(),
      loadUsers(),
      loadActivity(),
      loadActivityInsights(),
      ["owner", "moderator"].includes(state.context.role)
        ? loadAnnouncements()
        : Promise.resolve(),
      ["owner", "moderator"].includes(state.context.role) ? loadReports() : Promise.resolve(),
      state.context.role === "owner" ? loadAudit() : Promise.resolve(),
      state.context.role === "owner" ? loadAdmins() : Promise.resolve(),
    ]);
    document.querySelector("#lastRefresh").textContent =
      `Updated ${new Intl.DateTimeFormat("en", { timeStyle: "short" }).format(new Date())}`;
  } catch (error) {
    console.error("Admin refresh failed", error);
    showToast(error.message || "The dashboard could not be refreshed.", true);
  } finally {
    setBusy(refreshButton, false);
  }
}

async function loadOverview() {
  state.summary = await callRpc("admin_dashboard_summary");
  const metrics = [
    ["Total users", state.summary.total_users, `+${state.summary.new_users_7d} in 7 days`],
    ["Active users", state.summary.active_users_7d, "Last 7 days · opt-in"],
    ["AI requests", state.summary.ai_requests_today, "Today"],
    ["Open reports", state.summary.open_reports, `${state.summary.routes_total} total routes`],
  ];
  const grid = document.querySelector("#metricGrid");
  grid.replaceChildren();
  metrics.forEach(([label, value, detail]) => {
    const card = makeElement("article", "metric-card");
    card.append(
      makeElement("small", "", label),
      makeElement("strong", "metric-value", Number(value || 0).toLocaleString()),
      makeElement("span", "metric-detail", detail),
    );
    grid.append(card);
  });

  const reportBadge = document.querySelector("#reportBadge");
  const openReports = Number(state.summary.open_reports || 0);
  reportBadge.textContent = String(openReports);
  reportBadge.hidden = openReports === 0;
  renderEventChart(state.summary.event_series || []);
}

function renderEventChart(series) {
  const chart = document.querySelector("#eventChart");
  chart.replaceChildren();
  const maximum = Math.max(1, ...series.map((item) => Number(item.events || 0)));
  series.forEach((item) => {
    const group = makeElement("div", "bar-group");
    const bar = makeElement("div", "bar");
    const value = Number(item.events || 0);
    bar.style.height = `${Math.max(2, Math.round((value / maximum) * 100))}%`;
    bar.title = `${value} events`;
    const day = new Date(`${item.day}T12:00:00`);
    const label = new Intl.DateTimeFormat("en", { weekday: "short" }).format(day);
    group.append(bar, makeElement("span", "", label));
    chart.append(group);
  });
}

async function loadFeatureFlags() {
  const flags = await callRpc("admin_list_feature_flags");
  const grid = document.querySelector("#flagGrid");
  grid.replaceChildren();
  flags.forEach((flag) => grid.append(buildFlagCard(flag)));
  const analyticsFlag = flags.find((flag) => flag.key === "user_activity_tracking");
  const retentionInput = document.querySelector("#retentionDaysInput");
  if (analyticsFlag?.config?.retention_days && retentionInput) {
    retentionInput.value = analyticsFlag.config.retention_days;
  }
}

function buildFlagCard(flag) {
  const card = makeElement("article", "flag-card");
  const header = makeElement("div", "flag-header");
  const title = makeElement("div", "flag-title");
  title.append(
    makeElement("h3", "", flag.key.replaceAll("_", " ")),
    makeElement("p", "", flag.description),
    makeElement("code", "flag-key", flag.key),
  );

  const switchLabel = makeElement("label", "switch");
  const toggle = makeElement("input");
  toggle.type = "checkbox";
  toggle.checked = flag.enabled;
  toggle.disabled = state.context.role !== "owner";
  switchLabel.append(toggle, makeElement("span", "switch-track"));
  header.append(title, switchLabel);

  const structuredConfig = makeElement("div", "structured-config");
  const structuredInputs = buildStructuredConfigFields(flag, structuredConfig);

  const advancedConfig = makeElement("details", "advanced-config");
  const summary = makeElement("summary", "", "Advanced JSON");
  const configLabel = makeElement("label", "flag-config-label", "Public config");
  const textarea = makeElement("textarea");
  textarea.value = JSON.stringify(flag.config || {}, null, 2);
  textarea.disabled = state.context.role !== "owner";
  configLabel.append(textarea);
  advancedConfig.append(summary, configLabel);

  const actions = makeElement("div", "flag-actions");
  const saveButton = makeElement("button", "button button-secondary", "Save");
  saveButton.type = "button";
  saveButton.disabled = state.context.role !== "owner";
  saveButton.addEventListener("click", async () => {
    let config;
    try {
      config = JSON.parse(textarea.value || "{}");
      if (!config || Array.isArray(config) || typeof config !== "object") {
        throw new Error("Config must be a JSON object.");
      }
      Object.entries(structuredInputs).forEach(([key, input]) => {
        const value = Number.parseInt(input.value, 10);
        if (!Number.isFinite(value)) {
          throw new Error(`${key.replaceAll("_", " ")} must be a number.`);
        }
        config[key] = value;
      });
    } catch (error) {
      showToast(error.message || "Invalid JSON config.", true);
      return;
    }
    if (
      toggle.checked !== flag.enabled &&
      ["ai_daily_route", "social_messaging", "user_activity_tracking"].includes(flag.key) &&
      !window.confirm(
        `${toggle.checked ? "Enable" : "Disable"} ${flag.key.replaceAll("_", " ")} in production?`,
      )
    ) {
      return;
    }
    setBusy(saveButton, true, "Saving…");
    try {
      await callRpc("admin_update_feature_flag", {
        flag_key: flag.key,
        flag_enabled: toggle.checked,
        flag_config: config,
      });
      showToast(`${flag.key} updated.`);
      await Promise.all([loadFeatureFlags(), loadAudit()]);
    } catch (error) {
      console.error("Feature flag update failed", error);
      showToast(error.message || "Feature flag could not be updated.", true);
    } finally {
      setBusy(saveButton, false);
    }
  });
  actions.append(saveButton);
  card.append(header, structuredConfig, advancedConfig, actions);
  return card;
}

function buildStructuredConfigFields(flag, container) {
  const schemas = {
    ai_daily_route: [
      ["free_daily_limit", "Free daily limit", 1, 100],
      ["pro_daily_limit", "Pro daily limit", 1, 1000],
      ["max_stops", "Maximum stops", 2, 10],
    ],
    user_activity_tracking: [
      ["retention_days", "Retention days", 30, 365],
    ],
    google_places_provider: [
      ["rollout_percent", "Rollout percent", 0, 100],
    ],
  };
  const inputs = {};
  (schemas[flag.key] || []).forEach(([key, labelText, minimum, maximum]) => {
    const label = makeElement("label", "", labelText);
    const input = makeElement("input");
    input.type = "number";
    input.min = minimum;
    input.max = maximum;
    input.value = flag.config?.[key] ?? minimum;
    input.disabled = state.context.role !== "owner";
    label.append(input);
    container.append(label);
    inputs[key] = input;
  });
  return inputs;
}

async function loadUsers(searchText = "") {
  const users = await callRpc("admin_list_users", {
    search_text: searchText,
    page_size: 50,
    page_offset: 0,
  });
  const body = document.querySelector("#userTableBody");
  body.replaceChildren();
  if (!users.length) {
    body.append(emptyTableRow("No matching users.", 7));
    return;
  }
  users.forEach((user) => {
    const row = document.createElement("tr");
    const identity = document.createElement("td");
    identity.append(
      makeElement("span", "table-primary", user.username || user.full_name || "Unnamed traveler"),
      makeElement("span", "table-secondary", user.email || "—"),
    );
    const client = document.createElement("td");
    client.append(
      makeElement("span", "table-primary", user.platform || "—"),
      makeElement("span", "table-secondary", user.app_version || "No version"),
    );
    const consent = makeElement(
      "span",
      `pill ${user.analytics_opt_in ? "pill-positive" : "pill-negative"}`,
      user.analytics_opt_in ? "Opted in" : "Off",
    );
    const consentCell = document.createElement("td");
    consentCell.append(consent);
    [
      identity,
      makeElement("td", "", formatDate(user.created_at)),
      makeElement("td", "", relativeDate(user.last_seen_at || user.last_sign_in_at)),
      client,
      consentCell,
      makeElement("td", "", user.session_count || 0),
      makeElement("td", "", user.route_count || 0),
    ].forEach((cell) => row.append(cell));
    body.append(row);
  });
}

async function loadActivity() {
  const events = await callRpc("admin_list_activity", { page_size: 60 });
  const body = document.querySelector("#activityTableBody");
  body.replaceChildren();
  if (!events.length) {
    body.append(emptyTableRow("No consent-based events yet.", 5));
    return;
  }
  events.forEach((event) => {
    const row = document.createElement("tr");
    const client = document.createElement("td");
    client.append(
      makeElement("span", "table-primary", event.platform || "—"),
      makeElement("span", "table-secondary", event.app_version || "No version"),
    );
    row.append(
      makeElement("td", "", event.event_name),
      makeElement("td", "", event.username || "Unnamed traveler"),
      client,
      makeElement("td", "properties", JSON.stringify(event.properties || {})),
      makeElement("td", "", formatDate(event.occurred_at, true)),
    );
    body.append(row);
  });
}

async function loadReports() {
  const status = document.querySelector("#reportStatusFilter").value;
  const reports = await callRpc("admin_list_reports", {
    report_status: status,
    page_size: 50,
  });
  const list = document.querySelector("#reportList");
  list.replaceChildren();
  if (!reports.length) {
    list.append(makeElement("div", "panel empty-state", "No reports in this view."));
    return;
  }
  reports.forEach((report) => list.append(buildReportCard(report)));
}

function buildReportCard(report) {
  const card = makeElement("article", "report-card");
  const content = makeElement("div");
  const meta = makeElement("div", "report-meta");
  meta.append(
    makeElement("span", `pill ${report.status === "open" ? "pill-negative" : ""}`, report.status),
    makeElement("span", "pill", report.category),
    makeElement("span", "table-secondary", formatDate(report.created_at, true)),
  );
  content.append(
    meta,
    makeElement("h3", "", `${report.reporter_username || "Unknown"} reported ${report.reported_username || "Unknown"}`),
    makeElement("p", "report-details", report.details || "No additional details."),
  );

  const controls = makeElement("div", "report-controls");
  const statusLabel = makeElement("label", "", "Status");
  const select = makeElement("select");
  ["open", "reviewing", "resolved", "dismissed"].forEach((value) => {
    const option = makeElement("option", "", value);
    option.value = value;
    option.selected = value === report.status;
    select.append(option);
  });
  statusLabel.append(select);
  const noteLabel = makeElement("label", "", "Moderator note");
  const note = makeElement("textarea");
  note.maxLength = 2000;
  note.value = report.moderator_note || "";
  noteLabel.append(note);
  const save = makeElement("button", "button button-secondary", "Save review");
  save.type = "button";
  save.addEventListener("click", async () => {
    setBusy(save, true, "Saving…");
    try {
      await callRpc("admin_update_report", {
        report_id: report.id,
        next_status: select.value,
        note: note.value,
      });
      showToast("Report review saved.");
      await Promise.all([loadReports(), loadOverview(), state.context.role === "owner" ? loadAudit() : Promise.resolve()]);
    } catch (error) {
      console.error("Report update failed", error);
      showToast(error.message || "Report could not be updated.", true);
    } finally {
      setBusy(save, false);
    }
  });
  controls.append(statusLabel, noteLabel, save);
  card.append(content, controls);
  return card;
}

async function loadAudit() {
  if (state.context.role !== "owner") return;
  const logs = await callRpc("admin_list_audit_logs", { page_size: 60 });
  const body = document.querySelector("#auditTableBody");
  body.replaceChildren();
  if (!logs.length) {
    body.append(emptyTableRow("No admin changes recorded yet.", 5));
    return;
  }
  logs.forEach((log) => {
    const row = document.createElement("tr");
    row.append(
      makeElement("td", "", log.action),
      makeElement("td", "", log.admin_email || "Deleted admin"),
      makeElement("td", "", `${log.target_type}: ${log.target_id || "—"}`),
      makeElement("td", "properties", JSON.stringify(log.details || {})),
      makeElement("td", "", formatDate(log.created_at, true)),
    );
    body.append(row);
  });
}

async function loadAnnouncements() {
  state.announcements = await callRpc("admin_list_announcements");
  const list = document.querySelector("#announcementList");
  list.replaceChildren();
  if (!state.announcements.length) {
    list.append(makeElement("div", "panel empty-state", "No announcements yet."));
    resetAnnouncementForm();
    return;
  }

  state.announcements.forEach((announcement) => {
    const card = makeElement("article", "announcement-card");
    const meta = makeElement("div", "report-meta");
    meta.append(
      makeElement(
        "span",
        `pill ${announcement.enabled ? "pill-positive" : "pill-negative"}`,
        announcement.enabled ? "Enabled" : "Disabled",
      ),
      makeElement("span", "pill", announcement.severity),
      makeElement("span", "table-secondary", formatDate(announcement.starts_at, true)),
    );
    const actions = makeElement("div", "announcement-card-actions");
    const editButton = makeElement("button", "button button-secondary", "Edit");
    editButton.type = "button";
    editButton.addEventListener("click", () => editAnnouncement(announcement));
    actions.append(editButton);
    if (announcement.enabled) {
      const disableButton = makeElement("button", "button button-danger", "Disable");
      disableButton.type = "button";
      disableButton.addEventListener("click", async () => {
        if (!window.confirm("Disable this announcement immediately?")) return;
        setBusy(disableButton, true, "Disabling…");
        try {
          await callRpc("admin_disable_announcement", {
            announcement_id: announcement.id,
          });
          showToast("Announcement disabled.");
          await Promise.all([
            loadAnnouncements(),
            state.context.role === "owner" ? loadAudit() : Promise.resolve(),
          ]);
        } catch (error) {
          showToast(error.message || "Announcement could not be disabled.", true);
        } finally {
          setBusy(disableButton, false);
        }
      });
      actions.append(disableButton);
    }
    card.append(
      meta,
      makeElement("h3", "", announcement.title_en),
      makeElement("p", "", announcement.body_en),
      actions,
    );
    list.append(card);
  });

  if (!document.querySelector("#announcementStarts").value) {
    resetAnnouncementForm();
  }
}

function editAnnouncement(announcement) {
  document.querySelector("#announcementId").value = announcement.id;
  document.querySelector("#announcementTitleEn").value = announcement.title_en;
  document.querySelector("#announcementTitleTr").value = announcement.title_tr;
  document.querySelector("#announcementBodyEn").value = announcement.body_en;
  document.querySelector("#announcementBodyTr").value = announcement.body_tr;
  document.querySelector("#announcementSeverity").value = announcement.severity;
  document.querySelector("#announcementLink").value = announcement.link_url || "";
  document.querySelector("#announcementStarts").value = toDateTimeLocal(announcement.starts_at);
  document.querySelector("#announcementEnds").value = toDateTimeLocal(announcement.ends_at);
  document.querySelector("#announcementEnabled").checked = announcement.enabled;
  document.querySelector("#announcementFormTitle").textContent = "Edit announcement";
  document.querySelector("#announcementForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function resetAnnouncementForm() {
  const form = document.querySelector("#announcementForm");
  form.reset();
  document.querySelector("#announcementId").value = "";
  document.querySelector("#announcementEnabled").checked = true;
  document.querySelector("#announcementStarts").value = toDateTimeLocal(new Date());
  document.querySelector("#announcementFormTitle").textContent = "New announcement";
}

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

async function loadActivityInsights() {
  const insights = await callRpc("admin_activity_insights", {
    lookback_days: 30,
  });
  const topEvent = insights.events_by_name?.[0];
  const topPlatform = insights.users_by_platform?.[0];
  const metrics = [
    ["Opted-in users", insights.opted_in_users || 0],
    ["Events · 30 days", insights.event_count || 0],
    [
      "Top signal",
      topEvent ? `${topEvent.name} · ${topEvent.count}` : "No events",
    ],
    [
      "Top platform",
      topPlatform ? `${topPlatform.platform} · ${topPlatform.count}` : "No data",
    ],
  ];
  const grid = document.querySelector("#activityInsightGrid");
  grid.replaceChildren();
  metrics.forEach(([label, value]) => {
    const card = makeElement("article", "mini-metric");
    card.append(
      makeElement("small", "", label),
      makeElement("strong", "", value),
    );
    grid.append(card);
  });
}

async function loadAdmins() {
  if (state.context.role !== "owner") return;
  const admins = await callRpc("admin_list_admins");
  const body = document.querySelector("#adminTableBody");
  body.replaceChildren();
  admins.forEach((admin) => {
    const row = document.createElement("tr");
    const identity = document.createElement("td");
    identity.append(
      makeElement("span", "table-primary", admin.email),
      makeElement(
        "span",
        "table-secondary",
        admin.user_id === state.context.user_id ? "Current account" : admin.user_id,
      ),
    );
    const roleCell = document.createElement("td");
    roleCell.append(makeElement("span", "pill", admin.role));
    const actionCell = document.createElement("td");
    if (admin.user_id !== state.context.user_id) {
      const removeButton = makeElement("button", "button button-danger", "Remove");
      removeButton.type = "button";
      removeButton.addEventListener("click", async () => {
        if (!window.confirm(`Remove admin access for ${admin.email}?`)) return;
        setBusy(removeButton, true, "Removing…");
        try {
          await callRpc("admin_remove_admin", {
            target_user_id: admin.user_id,
          });
          showToast("Admin access removed.");
          await Promise.all([loadAdmins(), loadAudit()]);
        } catch (error) {
          showToast(error.message || "Admin access could not be removed.", true);
        } finally {
          setBusy(removeButton, false);
        }
      });
      actionCell.append(removeButton);
    }
    row.append(
      identity,
      roleCell,
      makeElement("td", "", formatDate(admin.created_at)),
      actionCell,
    );
    body.append(row);
  });
}

function emptyTableRow(message, colspan) {
  const row = makeElement("tr", "empty-row");
  const cell = makeElement("td", "", message);
  cell.colSpan = colspan;
  row.append(cell);
  return row;
}

function switchSection(sectionName) {
  state.currentSection = sectionName;
  document.querySelectorAll(".nav-item").forEach((item) => {
    item.classList.toggle("is-active", item.dataset.section === sectionName);
  });
  document.querySelectorAll(".panel-section").forEach((section) => {
    section.classList.toggle("is-active", section.id === `section-${sectionName}`);
  });
  document.querySelector("#sectionTitle").textContent = sectionTitles[sectionName];
  sidebar.classList.remove("is-open");
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginError.textContent = "";
  loginError.classList.remove("is-success");
  setBusy(loginButton, true, "Signing in…");
  const email = document.querySelector("#emailInput").value.trim();
  const password = document.querySelector("#passwordInput").value;
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    loginError.textContent = "Sign-in failed. Check your email and password.";
    setBusy(loginButton, false);
    return;
  }
  await enterAdmin(data.session);
  setBusy(loginButton, false);
});

document.querySelector("#forgotPasswordButton").addEventListener("click", async () => {
  const emailInput = document.querySelector("#emailInput");
  const email = emailInput.value.trim();
  loginError.classList.remove("is-success");
  if (!email || !emailInput.checkValidity()) {
    loginError.textContent = "Enter your NomadX account email first.";
    emailInput.focus();
    return;
  }

  const button = document.querySelector("#forgotPasswordButton");
  setBusy(button, true, "Sending reset link…");
  const redirectTo = `${window.location.origin}/admin/?recovery=1`;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) {
    console.error("Password reset request failed", error);
    loginError.textContent = "The reset email could not be sent. Try again shortly.";
  } else {
    loginError.classList.add("is-success");
    loginError.textContent = "Reset email sent. Use only the newest link.";
  }
  setBusy(button, false);
});

recoveryForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  recoveryError.textContent = "";
  const newPassword = document.querySelector("#newPasswordInput").value;
  const confirmation = document.querySelector("#confirmPasswordInput").value;
  if (newPassword.length < 8) {
    recoveryError.textContent = "Use at least eight characters.";
    return;
  }
  if (newPassword !== confirmation) {
    recoveryError.textContent = "Passwords do not match.";
    return;
  }

  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) {
    recoveryError.textContent = "This reset link is invalid or expired. Request a new one.";
    return;
  }

  const button = document.querySelector("#recoveryButton");
  setBusy(button, true, "Saving…");
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    recoveryError.textContent = "The password could not be updated. Request a new link.";
    setBusy(button, false);
    return;
  }

  await supabase.auth.signOut();
  isRecoveryFlow = false;
  window.history.replaceState({}, document.title, "/admin/");
  showLogin("Password updated. Sign in with your new password.", true);
  setBusy(button, false);
});

document.querySelector("#signOutButton").addEventListener("click", async () => {
  await supabase.auth.signOut();
  showLogin();
});

document.querySelector("#refreshButton").addEventListener("click", refreshAll);
document.querySelector("#menuButton").addEventListener("click", () => {
  sidebar.classList.toggle("is-open");
});
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => switchSection(item.dataset.section));
});
document.querySelector("#userSearchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await loadUsers(document.querySelector("#userSearchInput").value.trim());
  } catch (error) {
    showToast(error.message || "User search failed.", true);
  }
});
document.querySelector("#reportStatusFilter").addEventListener("change", async () => {
  try {
    await loadReports();
  } catch (error) {
    showToast(error.message || "Reports could not be filtered.", true);
  }
});

document.querySelector("#announcementCancel").addEventListener("click", resetAnnouncementForm);
document.querySelector("#announcementForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const startsValue = document.querySelector("#announcementStarts").value;
  const endsValue = document.querySelector("#announcementEnds").value;
  const linkValue = document.querySelector("#announcementLink").value.trim();
  if (linkValue && !linkValue.startsWith("https://")) {
    showToast("Announcement links must start with https://", true);
    return;
  }
  if (endsValue && new Date(endsValue) <= new Date(startsValue)) {
    showToast("The end time must be after the start time.", true);
    return;
  }

  const button = document.querySelector("#announcementSave");
  setBusy(button, true, "Saving…");
  try {
    await callRpc("admin_upsert_announcement", {
      announcement_id: document.querySelector("#announcementId").value || null,
      announcement_title_en: document.querySelector("#announcementTitleEn").value.trim(),
      announcement_title_tr: document.querySelector("#announcementTitleTr").value.trim(),
      announcement_body_en: document.querySelector("#announcementBodyEn").value.trim(),
      announcement_body_tr: document.querySelector("#announcementBodyTr").value.trim(),
      announcement_severity: document.querySelector("#announcementSeverity").value,
      announcement_link_url: linkValue || null,
      announcement_enabled: document.querySelector("#announcementEnabled").checked,
      announcement_starts_at: new Date(startsValue).toISOString(),
      announcement_ends_at: endsValue ? new Date(endsValue).toISOString() : null,
    });
    showToast("Announcement saved.");
    resetAnnouncementForm();
    await Promise.all([
      loadAnnouncements(),
      state.context.role === "owner" ? loadAudit() : Promise.resolve(),
    ]);
  } catch (error) {
    console.error("Announcement save failed", error);
    showToast(error.message || "Announcement could not be saved.", true);
  } finally {
    setBusy(button, false);
  }
});

document.querySelector("#pruneActivityButton").addEventListener("click", async () => {
  const input = document.querySelector("#retentionDaysInput");
  const retentionDays = Number.parseInt(input.value, 10);
  if (!Number.isInteger(retentionDays) || retentionDays < 30 || retentionDays > 365) {
    showToast("Retention must be between 30 and 365 days.", true);
    return;
  }
  if (!window.confirm(`Permanently delete analytics events older than ${retentionDays} days?`)) {
    return;
  }
  const button = document.querySelector("#pruneActivityButton");
  setBusy(button, true, "Cleaning…");
  try {
    const deleted = await callRpc("admin_prune_activity", {
      retention_days: retentionDays,
    });
    showToast(`${deleted || 0} expired events deleted.`);
    await Promise.all([loadActivity(), loadActivityInsights(), loadAudit()]);
  } catch (error) {
    showToast(error.message || "Expired events could not be deleted.", true);
  } finally {
    setBusy(button, false);
  }
});

document.querySelector("#adminRoleForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#adminRoleSave");
  const email = document.querySelector("#adminRoleEmail").value.trim();
  const role = document.querySelector("#adminRoleSelect").value;
  if (!window.confirm(`Set ${email} as ${role}?`)) return;
  setBusy(button, true, "Saving…");
  try {
    await callRpc("admin_set_admin_role", {
      account_email: email,
      next_role: role,
    });
    document.querySelector("#adminRoleForm").reset();
    showToast("Admin role saved.");
    await Promise.all([loadAdmins(), loadAudit()]);
  } catch (error) {
    console.error("Admin role update failed", error);
    showToast(error.message || "Admin role could not be saved.", true);
  } finally {
    setBusy(button, false);
  }
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === "PASSWORD_RECOVERY") {
    isRecoveryFlow = true;
    showRecovery();
    return;
  }
  if (event === "SIGNED_OUT") showLogin();
  if (event === "TOKEN_REFRESHED" && session && state.context) {
    // Existing data calls automatically use the refreshed access token.
  }
});

const { data: sessionData } = await supabase.auth.getSession();
if (isRecoveryFlow) {
  showRecovery(
    sessionData.session
      ? ""
      : "Validating your reset link…",
  );
} else {
  await enterAdmin(sessionData.session);
}
