// Versioned entry point prevents stale CDN assets after admin releases.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { mountNotifications } from './notifications.js?v=20261016draft1';

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
  aiUsage: null,
  announcements: [],
  currentSection: "overview",
  routingPeriodHours: 24,
  aiRoutePeriodHours: 24,
  aiTourPeriodHours: 24,
  syncPeriodHours: 24,
  sharePeriodHours: 24,
};

const AI_QUALITY_PRESETS = {
  economy: {
    openai_model: "gpt-5.6-luna",
    openai_reasoning_effort: "low",
    openai_search_context_size: "low",
    openai_max_output_tokens: 5000,
    openai_max_tool_calls: 3,
  },
  balanced: {
    openai_model: "gpt-5.6-terra",
    openai_reasoning_effort: "low",
    openai_search_context_size: "medium",
    openai_max_output_tokens: 6000,
    openai_max_tool_calls: 5,
  },
  premium: {
    openai_model: "gpt-5.6-sol",
    openai_reasoning_effort: "low",
    openai_search_context_size: "high",
    openai_max_output_tokens: 8000,
    openai_max_tool_calls: 8,
  },
};

const sectionTitles = {
  overview: "Overview",
  flags: "Feature flags",
  announcements: "Announcements",
  notifications: "Push notifications",
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
    switchSection('overview');
    await refreshAll();
  } catch (error) {
    console.error("Admin authorization failed", error);
    await supabase.auth.signOut();
    showLogin("This NomadX account is not approved for admin access.");
  }
}

function showLogin(message = "", isSuccess = false) {
  document.querySelector('#section-notifications')?.replaceChildren();
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
    const panelResults = await Promise.allSettled([
      loadOverview(),
      loadAiUsage(),
      loadFeatureFlags(),
      loadRoutingMetrics(),
      loadAiRouteMetrics(),
      loadAiTourMetrics(),
      loadSyncHealthMetrics(),
      loadShareEndpointMetrics(),
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
    const failedPanels = panelResults.filter((result) => result.status === "rejected");
    if (failedPanels.length) {
      console.error("Admin panels failed", failedPanels.map((result) => result.reason));
      showToast(`${failedPanels.length} dashboard panel(s) are unavailable.`, true);
    }
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
  let rpcError;
  try {
    state.summary = await callRpc("admin_dashboard_summary");
  } catch (error) {
    rpcError = error;
    state.summary = { panel_status: {} };
  }
  const status = state.summary.panel_status || {};
  const isAvailable = (key) => status[key]?.status === "available";
  const displayValue = (key, value) => isAvailable(key) && value != null && Number.isFinite(Number(value))
    ? Number(value).toLocaleString()
    : "Unavailable";
  const metrics = [
    ["Total users", "total_users", state.summary.total_users,
      isAvailable("new_users_7d") ? `+${state.summary.new_users_7d} in 7 days` : "7-day data unavailable"],
    ["Active users", "active_users_7d", state.summary.active_users_7d, "Last 7 days · opt-in"],
    ["AI requests", "ai_requests_today", state.summary.ai_requests_today, "Today"],
    ["Open reports", "open_reports", state.summary.open_reports,
      isAvailable("routes_total") ? `${state.summary.routes_total} total routes` : "Route data unavailable"],
  ];
  const grid = document.querySelector("#metricGrid");
  grid.replaceChildren();
  metrics.forEach(([label, key, value, detail]) => {
    const card = makeElement("article", "metric-card");
    card.append(
      makeElement("small", "", label),
      makeElement("strong", "metric-value", displayValue(key, value)),
      makeElement("span", "metric-detail", detail),
    );
    grid.append(card);
  });

  const reportBadge = document.querySelector("#reportBadge");
  const reportsAvailable = isAvailable("open_reports");
  const openReports = reportsAvailable ? Number(state.summary.open_reports) : null;
  reportBadge.textContent = reportsAvailable ? String(openReports) : "!";
  reportBadge.hidden = reportsAvailable && openReports === 0;
  if (isAvailable("event_series")) {
    renderEventChart(state.summary.event_series || []);
  } else {
    const chart = document.querySelector("#eventChart");
    chart.replaceChildren(makeElement("p", "empty-state", "Activity data unavailable."));
  }
  renderAiCosts(state.summary.ai_costs_24h, isAvailable("ai_costs_24h"));
  if (rpcError) throw rpcError;
}

function renderAiCosts(payload, available) {
  const grid = document.querySelector("#aiCostMetrics");
  grid.replaceChildren();
  for (const [key, label] of [["daily_route", "Daily route"], ["regional_tour", "Regional tour"]]) {
    const row = available ? payload?.[key] : null;
    const cents = row?.total_cost_usd_cents;
    const hasAmount = cents != null && Number.isFinite(Number(cents));
    const partial = row?.cost_status === "partial";
    const amount = hasAmount ? new Intl.NumberFormat("en", {
      style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4,
    }).format(Number(cents) / 100) : "Unavailable";
    const card = makeElement("article", "mini-metric");
    card.append(makeElement("small", "", label),
      makeElement("strong", "", partial && hasAmount ? `Known subtotal ${amount}` : amount),
      makeElement("span", "metric-detail", !row ? "Cost data unavailable" : partial
        ? `Partial · ${row.unknown_usage_events} unknown usage · ${row.unpriced_usage_events} unpriced attempts`
        : `${row.requests} provider attempts · verified tariff`));
    grid.append(card);
  }
}

function formatCompactNumber(value) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 })
    .format(Number(value || 0));
}

async function loadAiUsage() {
  state.aiUsage = await callRpc("admin_ai_usage_summary", { period_days: 30 });
  const metrics = [
    ["Requests", state.aiUsage.requests || 0],
    ["Input tokens", formatCompactNumber(state.aiUsage.input_tokens)],
    ["Output tokens", formatCompactNumber(state.aiUsage.output_tokens)],
    ["Web searches", state.aiUsage.web_search_calls || 0],
  ];
  const grid = document.querySelector("#aiUsageMetrics");
  grid.replaceChildren();
  metrics.forEach(([label, value]) => {
    const card = makeElement("article", "mini-metric");
    card.append(makeElement("small", "", label), makeElement("strong", "", value));
    grid.append(card);
  });

  const body = document.querySelector("#aiUsageTableBody");
  body.replaceChildren();
  const rows = state.aiUsage.by_model || [];
  if (!rows.length) {
    body.append(emptyTableRow("No token usage has been recorded yet.", 7));
    return;
  }
  rows.forEach((usage) => {
    const row = document.createElement("tr");
    [
      usage.model,
      usage.provider,
      usage.requests,
      formatCompactNumber(usage.input_tokens),
      formatCompactNumber(usage.output_tokens),
      formatCompactNumber(usage.reasoning_tokens),
      usage.web_search_calls,
    ].forEach((value, index) => {
      const cell = document.createElement("td");
      cell.textContent = String(value ?? "—");
      if (index === 0) cell.className = "table-primary";
      row.append(cell);
    });
    body.append(row);
  });
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

async function loadRoutingMetrics() {
  const periodHours = state.routingPeriodHours;

  // Update title
  const title = document.querySelector("#routingHealthTitle");
  const periodLabel = periodHours === 24 ? "24 hours" : periodHours === 168 ? "7 days" : "30 days";
  title.textContent = `OSM route preview · last ${periodLabel}`;

  // Load summary metrics
  const metrics = await callRpc("admin_get_route_geometry_metrics", {
    period_hours: periodHours,
  });
  const requests = Number(metrics.requests || 0);
  const errors = Number(metrics.errors || 0);
  const errorRate = requests ? `${((errors / requests) * 100).toFixed(1)}%` : "0%";
  const warnings = metrics.warnings || {};

  // Quota usage display
  const quotaWarning = warnings.quota_usage || {};
  const quotaText = quotaWarning.requests_today !== undefined
    ? `${quotaWarning.requests_today} / ${quotaWarning.limit} (${quotaWarning.current?.toFixed(1) || 0}%)`
    : "No data";

  const values = [
    ["Requests", requests, null],
    ["Error rate", errorRate, warnings.error_rate],
    ["P50 latency", `${metrics.p50_latency_ms || 0} ms`, null],
    ["P95 latency", `${metrics.p95_latency_ms || 0} ms`, warnings.p95_latency],
    ["Daily quota", quotaText, warnings.quota_usage],
  ];
  const grid = document.querySelector("#routingMetricGrid");
  grid.replaceChildren();
  values.forEach(([label, value, warning]) => {
    const card = makeElement("article", "mini-metric");
    if (warning?.triggered) {
      card.classList.add("has-warning");
    }
    const labelWrapper = makeElement("small", "");
    labelWrapper.textContent = label;
    if (warning?.triggered) {
      const badge = makeElement("span", "warning-badge", "!");
      badge.title = `Threshold: ${warning.threshold}${label.includes("rate") ? "%" : label.includes("latency") ? " ms" : "%"}`;
      labelWrapper.append(" ", badge);
    }
    card.append(labelWrapper, makeElement("strong", "", value));
    grid.append(card);
  });
  const status = document.querySelector("#routingProviderStatus");
  status.textContent = metrics.enabled ? "Provider enabled" : "Provider disabled";
  status.classList.toggle("pill-negative", !metrics.enabled);
  const breakdown = document.querySelector("#routingCodeBreakdown");
  breakdown.replaceChildren();
  (metrics.codes || []).forEach((entry) => {
    breakdown.append(makeElement("code", "", `${entry.code}: ${entry.count}`));
  });
  if (!(metrics.codes || []).length) {
    breakdown.append(makeElement("span", "table-secondary", "No route requests recorded yet."));
  }

  // Load and render trend chart
  try {
    const series = await callRpc("admin_get_routing_health_series", {
      period_hours: periodHours,
    });
    renderRoutingTrendChart(series);
  } catch (error) {
    console.error("Routing trend chart failed", error);
    const chart = document.querySelector("#routingTrendChart");
    chart.replaceChildren();
    chart.append(makeElement("p", "table-secondary", "Trend chart unavailable."));
  }
}

function renderRoutingTrendChart(data) {
  const chart = document.querySelector("#routingTrendChart");
  chart.replaceChildren();

  const series = data.series || [];
  if (!series.length) {
    chart.append(makeElement("p", "table-secondary", "No routing data for this period."));
    return;
  }

  // Find max values for scaling
  const maxRequests = Math.max(1, ...series.map((item) => Number(item.requests || 0)));
  const maxLatency = Math.max(1, ...series.map((item) => Number(item.p95_latency_ms || 0)));

  // Create chart container with two y-axes
  const chartContainer = makeElement("div", "trend-chart-container");

  // Requests/errors line chart
  const requestsChart = makeElement("div", "trend-line-chart");
  series.forEach((item, index) => {
    const group = makeElement("div", "trend-bar-group");

    // Request bar (green background)
    const requestBar = makeElement("div", "trend-bar trend-bar-requests");
    const requests = Number(item.requests || 0);
    const errors = Number(item.errors || 0);
    requestBar.style.height = `${Math.round((requests / maxRequests) * 100)}%`;
    requestBar.title = `${requests} requests`;

    // Error overlay (red)
    if (errors > 0) {
      const errorBar = makeElement("div", "trend-bar-errors");
      errorBar.style.height = `${Math.round((errors / requests) * 100)}%`;
      errorBar.title = `${errors} errors`;
      requestBar.append(errorBar);
    }

    // Time label (show every N buckets based on period)
    const bucket = new Date(item.bucket);
    const bucketHours = data.bucket_hours || 1;
    const showLabel = bucketHours === 1
      ? index % 6 === 0  // Every 6 hours for hourly
      : index % 3 === 0;  // Every 3 days for daily

    const label = makeElement("span", "trend-label");
    if (showLabel) {
      label.textContent = bucketHours === 1
        ? new Intl.DateTimeFormat("en", { hour: "numeric" }).format(bucket)
        : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(bucket);
    }

    group.append(requestBar, label);
    requestsChart.append(group);
  });

  // P95 latency line (overlay)
  const latencyLine = makeElement("svg", "trend-latency-line");
  latencyLine.setAttribute("viewBox", `0 0 ${series.length * 20} 100`);
  latencyLine.setAttribute("preserveAspectRatio", "none");

  const points = series.map((item, index) => {
    const x = index * 20 + 10;
    const latency = Number(item.p95_latency_ms || 0);
    const y = 100 - Math.round((latency / maxLatency) * 100);
    return `${x},${y}`;
  }).join(" ");

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#6366f1");
  polyline.setAttribute("stroke-width", "2");
  latencyLine.append(polyline);

  // Legend
  const legend = makeElement("div", "trend-legend");
  legend.append(
    makeElement("span", "trend-legend-item", "● Requests"),
    makeElement("span", "trend-legend-item trend-legend-errors", "● Errors"),
    makeElement("span", "trend-legend-item trend-legend-latency", "— P95 latency"),
  );

  chartContainer.append(requestsChart, latencyLine, legend);
  chart.append(chartContainer);
}

async function loadAiRouteMetrics() {
  const periodHours = state.aiRoutePeriodHours;

  // Update title
  const title = document.querySelector("#aiRouteHealthTitle");
  const periodLabel = periodHours === 24 ? "24 hours" : periodHours === 168 ? "7 days" : "30 days";
  title.textContent = `AI daily route generation · last ${periodLabel}`;

  // Load summary metrics
  const metrics = await callRpc("admin_get_ai_daily_route_metrics", {
    period_hours: periodHours,
  });
  const requests = Number(metrics.requests || 0);
  const errors = Number(metrics.errors || 0);
  const errorRate = requests ? `${((errors / requests) * 100).toFixed(1)}%` : "0%";

  const values = [
    ["Requests", requests],
    ["Error rate", errorRate],
    ["P50 latency", `${metrics.p50_latency_ms || 0} ms`],
    ["P95 latency", `${metrics.p95_latency_ms || 0} ms`],
    ["Avg tokens", `${metrics.avg_input_tokens || 0} in / ${metrics.avg_output_tokens || 0} out`],
    ["Web searches", metrics.total_web_searches || 0],
  ];
  const grid = document.querySelector("#aiRouteMetricGrid");
  grid.replaceChildren();
  values.forEach(([label, value]) => {
    const card = makeElement("article", "mini-metric");
    card.append(makeElement("small", "", label), makeElement("strong", "", value));
    grid.append(card);
  });
  const status = document.querySelector("#aiRouteServiceStatus");
  status.textContent = metrics.enabled ? "Service enabled" : "Service disabled";
  status.classList.toggle("pill-negative", !metrics.enabled);

  // Model breakdown
  const breakdown = document.querySelector("#aiRouteModelBreakdown");
  breakdown.replaceChildren();
  (metrics.by_model || []).forEach((entry) => {
    breakdown.append(makeElement("code", "", `${entry.model}: ${entry.count} (${entry.avg_latency_ms}ms)`));
  });
  if (!(metrics.by_model || []).length) {
    breakdown.append(makeElement("span", "table-secondary", "No AI route requests recorded yet."));
  }

  // Load and render trend chart
  try {
    const series = await callRpc("admin_get_ai_daily_route_series", {
      period_hours: periodHours,
    });
    renderAiRouteTrendChart(series);
  } catch (error) {
    console.error("AI route trend chart failed", error);
    const chart = document.querySelector("#aiRouteTrendChart");
    chart.replaceChildren();
    chart.append(makeElement("p", "table-secondary", "Trend chart unavailable."));
  }
}

function renderAiRouteTrendChart(data) {
  const chart = document.querySelector("#aiRouteTrendChart");
  chart.replaceChildren();

  const series = data.series || [];
  if (!series.length) {
    chart.append(makeElement("p", "table-secondary", "No AI route data for this period."));
    return;
  }

  // Find max values for scaling
  const maxRequests = Math.max(1, ...series.map((item) => Number(item.requests || 0)));
  const maxLatency = Math.max(1, ...series.map((item) => Number(item.p95_latency_ms || 0)));

  const chartContainer = makeElement("div", "trend-chart-container");

  // Requests/errors bar chart
  const requestsChart = makeElement("div", "trend-line-chart");
  series.forEach((item, index) => {
    const group = makeElement("div", "trend-bar-group");

    // Request bar (green background)
    const requestBar = makeElement("div", "trend-bar trend-bar-requests");
    const requests = Number(item.requests || 0);
    const errors = Number(item.errors || 0);
    requestBar.style.height = `${Math.round((requests / maxRequests) * 100)}%`;
    requestBar.title = `${requests} requests`;

    // Error overlay (red)
    if (errors > 0) {
      const errorBar = makeElement("div", "trend-bar-errors");
      errorBar.style.height = `${Math.round((errors / requests) * 100)}%`;
      errorBar.title = `${errors} errors`;
      requestBar.append(errorBar);
    }

    // Time label
    const bucket = new Date(item.bucket);
    const bucketHours = data.bucket_hours || 1;
    const showLabel = bucketHours === 1
      ? index % 6 === 0
      : index % 3 === 0;

    const label = makeElement("span", "trend-label");
    if (showLabel) {
      label.textContent = bucketHours === 1
        ? new Intl.DateTimeFormat("en", { hour: "numeric" }).format(bucket)
        : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(bucket);
    }

    group.append(requestBar, label);
    requestsChart.append(group);
  });

  // P95 latency SVG line
  const latencyLine = makeElement("svg", "trend-latency-line");
  latencyLine.setAttribute("viewBox", `0 0 ${series.length * 20} 100`);
  latencyLine.setAttribute("preserveAspectRatio", "none");

  const points = series.map((item, index) => {
    const x = index * 20 + 10;
    const latency = Number(item.p95_latency_ms || 0);
    const y = 100 - Math.round((latency / maxLatency) * 100);
    return `${x},${y}`;
  }).join(" ");

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#6366f1");
  polyline.setAttribute("stroke-width", "2");
  latencyLine.append(polyline);

  // Legend
  const legend = makeElement("div", "trend-legend");
  legend.append(
    makeElement("span", "trend-legend-item", "● Requests"),
    makeElement("span", "trend-legend-item trend-legend-errors", "● Errors"),
    makeElement("span", "trend-legend-item trend-legend-latency", "— P95 latency"),
  );

  chartContainer.append(requestsChart, latencyLine, legend);
  chart.append(chartContainer);
}

async function loadAiTourMetrics() {
  const periodHours = state.aiTourPeriodHours;

  // Update title
  const title = document.querySelector("#aiTourHealthTitle");
  const periodLabel = periodHours === 24 ? "24 hours" : periodHours === 168 ? "7 days" : "30 days";
  title.textContent = `AI regional tour generation · last ${periodLabel}`;

  // Load summary metrics
  const metrics = await callRpc("admin_get_ai_regional_tour_metrics", {
    period_hours: periodHours,
  });
  const requests = Number(metrics.requests || 0);
  const errors = Number(metrics.errors || 0);
  const errorRate = requests ? `${((errors / requests) * 100).toFixed(1)}%` : "0%";

  const values = [
    ["Requests", requests],
    ["Error rate", errorRate],
    ["P50 latency", `${metrics.p50_latency_ms || 0} ms`],
    ["P95 latency", `${metrics.p95_latency_ms || 0} ms`],
    ["Avg tokens", `${metrics.avg_input_tokens || 0} in / ${metrics.avg_output_tokens || 0} out`],
    ["Web searches", metrics.total_web_searches || 0],
  ];
  const grid = document.querySelector("#aiTourMetricGrid");
  grid.replaceChildren();
  values.forEach(([label, value]) => {
    const card = makeElement("article", "mini-metric");
    card.append(makeElement("small", "", label), makeElement("strong", "", value));
    grid.append(card);
  });
  const status = document.querySelector("#aiTourServiceStatus");
  status.textContent = metrics.enabled ? "Service enabled" : "Service disabled";
  status.classList.toggle("pill-negative", !metrics.enabled);

  // Model breakdown
  const breakdown = document.querySelector("#aiTourModelBreakdown");
  breakdown.replaceChildren();
  (metrics.by_model || []).forEach((entry) => {
    breakdown.append(makeElement("code", "", `${entry.model}: ${entry.count} (${entry.avg_latency_ms}ms)`));
  });
  if (!(metrics.by_model || []).length) {
    breakdown.append(makeElement("span", "table-secondary", "No AI tour requests recorded yet."));
  }

  // Load and render trend chart
  try {
    const series = await callRpc("admin_get_ai_regional_tour_series", {
      period_hours: periodHours,
    });
    renderAiTourTrendChart(series);
  } catch (error) {
    console.error("AI tour trend chart failed", error);
    const chart = document.querySelector("#aiTourTrendChart");
    chart.replaceChildren();
    chart.append(makeElement("p", "table-secondary", "Trend chart unavailable."));
  }
}

function renderAiTourTrendChart(data) {
  const chart = document.querySelector("#aiTourTrendChart");
  chart.replaceChildren();

  const series = data.series || [];
  if (!series.length) {
    chart.append(makeElement("p", "table-secondary", "No AI tour data for this period."));
    return;
  }

  // Find max values for scaling
  const maxRequests = Math.max(1, ...series.map((item) => Number(item.requests || 0)));
  const maxLatency = Math.max(1, ...series.map((item) => Number(item.p95_latency_ms || 0)));

  const chartContainer = makeElement("div", "trend-chart-container");

  // Requests/errors bar chart
  const requestsChart = makeElement("div", "trend-line-chart");
  series.forEach((item, index) => {
    const group = makeElement("div", "trend-bar-group");

    // Request bar (green background)
    const requestBar = makeElement("div", "trend-bar trend-bar-requests");
    const requests = Number(item.requests || 0);
    const errors = Number(item.errors || 0);
    requestBar.style.height = `${Math.round((requests / maxRequests) * 100)}%`;
    requestBar.title = `${requests} requests`;

    // Error overlay (red)
    if (errors > 0) {
      const errorBar = makeElement("div", "trend-bar-errors");
      errorBar.style.height = `${Math.round((errors / requests) * 100)}%`;
      errorBar.title = `${errors} errors`;
      requestBar.append(errorBar);
    }

    // Time label
    const bucket = new Date(item.bucket);
    const bucketHours = data.bucket_hours || 1;
    const showLabel = bucketHours === 1
      ? index % 6 === 0
      : index % 3 === 0;

    const label = makeElement("span", "trend-label");
    if (showLabel) {
      label.textContent = bucketHours === 1
        ? new Intl.DateTimeFormat("en", { hour: "numeric" }).format(bucket)
        : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(bucket);
    }

    group.append(requestBar, label);
    requestsChart.append(group);
  });

  // P95 latency SVG line
  const latencyLine = makeElement("svg", "trend-latency-line");
  latencyLine.setAttribute("viewBox", `0 0 ${series.length * 20} 100`);
  latencyLine.setAttribute("preserveAspectRatio", "none");

  const points = series.map((item, index) => {
    const x = index * 20 + 10;
    const latency = Number(item.p95_latency_ms || 0);
    const y = 100 - Math.round((latency / maxLatency) * 100);
    return `${x},${y}`;
  }).join(" ");

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#6366f1");
  polyline.setAttribute("stroke-width", "2");
  latencyLine.append(polyline);

  // Legend
  const legend = makeElement("div", "trend-legend");
  legend.append(
    makeElement("span", "trend-legend-item", "● Requests"),
    makeElement("span", "trend-legend-item trend-legend-errors", "● Errors"),
    makeElement("span", "trend-legend-item trend-legend-latency", "— P95 latency"),
  );

  chartContainer.append(requestsChart, latencyLine, legend);
  chart.append(chartContainer);
}

async function loadSyncHealthMetrics() {
  const periodHours = state.syncPeriodHours;

  // Update title
  const title = document.querySelector("#syncHealthTitle");
  const periodLabel = periodHours === 24 ? "24 hours" : periodHours === 168 ? "7 days" : "30 days";
  title.textContent = `Sync operations by domain · last ${periodLabel}`;

  // Load summary metrics
  const metrics = await callRpc("admin_get_sync_health_metrics", {
    period_hours: periodHours,
  });
  const totalRequests = Number(metrics.total_requests || 0);
  const totalErrors = Number(metrics.total_errors || 0);
  const errorRate = totalRequests ? `${((totalErrors / totalRequests) * 100).toFixed(1)}%` : "0%";

  const values = [
    ["Requests", totalRequests],
    ["Error rate", errorRate],
    ["P95 latency", `${metrics.p95_latency_ms || 0} ms`],
    ["Avg latency", `${metrics.avg_latency_ms || 0} ms`],
  ];
  const grid = document.querySelector("#syncMetricGrid");
  grid.replaceChildren();
  values.forEach(([label, value]) => {
    const card = makeElement("article", "mini-metric");
    card.append(makeElement("small", "", label), makeElement("strong", "", value));
    grid.append(card);
  });

  const status = document.querySelector("#syncHealthStatus");
  status.textContent = totalRequests > 0 ? "Active" : "No data";
  status.classList.toggle("pill-negative", totalRequests === 0);

  // Domain breakdown
  const domainBreakdown = document.querySelector("#syncDomainBreakdown");
  domainBreakdown.replaceChildren();
  (metrics.by_domain || []).forEach((entry) => {
    const domainCard = makeElement("div", "domain-sync-entry");
    const header = makeElement("div", "");
    header.append(
      makeElement("strong", "", `${entry.domain}: ${entry.requests}`),
      makeElement("span", entry.error_rate > 10 ? "pill-negative" : "", ` ${entry.error_rate}% errors`)
    );
    domainCard.append(header);
    domainBreakdown.append(domainCard);
  });
  if (!(metrics.by_domain || []).length) {
    domainBreakdown.append(makeElement("span", "table-secondary", "No sync operations recorded yet."));
  }

  // Load and render trend chart
  try {
    const series = await callRpc("admin_get_sync_health_series", {
      period_hours: periodHours,
    });
    renderSyncTrendChart(series);
  } catch (error) {
    console.error("Sync trend chart failed", error);
    const chart = document.querySelector("#syncTrendChart");
    chart.replaceChildren();
    chart.append(makeElement("p", "table-secondary", "Trend chart unavailable."));
  }
}

function renderSyncTrendChart(data) {
  const chart = document.querySelector("#syncTrendChart");
  chart.replaceChildren();

  const series = data.series || [];
  if (!series.length) {
    chart.append(makeElement("p", "table-secondary", "No sync data for this period."));
    return;
  }

  // Find max values for scaling
  const maxRequests = Math.max(1, ...series.map((item) => Number(item.requests || 0)));
  const maxLatency = Math.max(1, ...series.map((item) => Number(item.p95_latency_ms || 0)));

  const chartContainer = makeElement("div", "trend-chart-container");

  // Requests/errors bar chart
  const requestsChart = makeElement("div", "trend-line-chart");
  series.forEach((item, index) => {
    const group = makeElement("div", "trend-bar-group");

    // Request bar (green background)
    const requestBar = makeElement("div", "trend-bar trend-bar-requests");
    const requests = Number(item.requests || 0);
    const errors = Number(item.errors || 0);
    requestBar.style.height = `${Math.round((requests / maxRequests) * 100)}%`;
    requestBar.title = `${requests} requests`;

    // Error overlay (red)
    if (errors > 0) {
      const errorBar = makeElement("div", "trend-bar-errors");
      errorBar.style.height = `${Math.round((errors / requests) * 100)}%`;
      errorBar.title = `${errors} errors`;
      requestBar.append(errorBar);
    }

    // Time label
    const bucket = new Date(item.bucket);
    const bucketHours = data.bucket_hours || 1;
    const showLabel = bucketHours === 1
      ? index % 6 === 0
      : index % 3 === 0;

    const label = makeElement("span", "trend-label");
    if (showLabel) {
      label.textContent = bucketHours === 1
        ? new Intl.DateTimeFormat("en", { hour: "numeric" }).format(bucket)
        : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(bucket);
    }

    group.append(requestBar, label);
    requestsChart.append(group);
  });

  // P95 latency SVG line
  const latencyLine = makeElement("svg", "trend-latency-line");
  latencyLine.setAttribute("viewBox", `0 0 ${series.length * 20} 100`);
  latencyLine.setAttribute("preserveAspectRatio", "none");

  const points = series.map((item, index) => {
    const x = index * 20 + 10;
    const latency = Number(item.p95_latency_ms || 0);
    const y = 100 - Math.round((latency / maxLatency) * 100);
    return `${x},${y}`;
  }).join(" ");

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#6366f1");
  polyline.setAttribute("stroke-width", "2");
  latencyLine.append(polyline);

  // Legend
  const legend = makeElement("div", "trend-legend");
  legend.append(
    makeElement("span", "trend-legend-item", "● Requests"),
    makeElement("span", "trend-legend-item trend-legend-errors", "● Errors"),
    makeElement("span", "trend-legend-item trend-legend-latency", "— P95 latency"),
  );

  chartContainer.append(requestsChart, latencyLine, legend);
  chart.append(chartContainer);
}

async function loadShareEndpointMetrics() {
  const periodHours = state.sharePeriodHours;

  // Update title
  const title = document.querySelector("#shareHealthTitle");
  const periodLabel = periodHours === 24 ? "24 hours" : periodHours === 168 ? "7 days" : "30 days";
  title.textContent = `Public share endpoints · last ${periodLabel}`;

  // Load summary metrics
  const metrics = await callRpc("admin_get_share_endpoint_metrics", {
    period_hours: periodHours,
  });
  const totalRequests = Number(metrics.total_requests || 0);
  const totalErrors = Number(metrics.total_errors || 0);
  const errorRate = totalRequests ? `${((totalErrors / totalRequests) * 100).toFixed(1)}%` : "0%";

  const values = [
    ["Requests", totalRequests],
    ["Error rate", errorRate],
    ["P95 latency", `${metrics.p95_latency_ms || 0} ms`],
    ["Avg latency", `${metrics.avg_latency_ms || 0} ms`],
  ];
  const grid = document.querySelector("#shareMetricGrid");
  grid.replaceChildren();
  values.forEach(([label, value]) => {
    const card = makeElement("article", "mini-metric");
    card.append(makeElement("small", "", label), makeElement("strong", "", value));
    grid.append(card);
  });

  const status = document.querySelector("#shareHealthStatus");
  status.textContent = totalRequests > 0 ? "Active" : "No data";
  status.classList.toggle("pill-negative", totalRequests === 0);

  // Endpoint breakdown
  const endpointBreakdown = document.querySelector("#shareEndpointBreakdown");
  endpointBreakdown.replaceChildren();
  (metrics.by_endpoint || []).forEach((entry) => {
    endpointBreakdown.append(
      makeElement("code", "", `${entry.endpoint}: ${entry.requests} (${entry.error_rate}% errors, ${entry.avg_latency_ms}ms)`)
    );
  });
  if (!(metrics.by_endpoint || []).length) {
    endpointBreakdown.append(makeElement("span", "table-secondary", "No public share requests recorded yet."));
  }

  // Load and render trend chart
  try {
    const series = await callRpc("admin_get_share_endpoint_series", {
      period_hours: periodHours,
    });
    renderShareTrendChart(series);
  } catch (error) {
    console.error("Share endpoint trend chart failed", error);
    const chart = document.querySelector("#shareTrendChart");
    chart.replaceChildren();
    chart.append(makeElement("p", "table-secondary", "Trend chart unavailable."));
  }
}

function renderShareTrendChart(data) {
  const chart = document.querySelector("#shareTrendChart");
  chart.replaceChildren();

  const series = data.series || [];
  if (!series.length) {
    chart.append(makeElement("p", "table-secondary", "No share endpoint data for this period."));
    return;
  }

  // Find max values for scaling
  const maxRequests = Math.max(1, ...series.map((item) => Number(item.requests || 0)));
  const maxLatency = Math.max(1, ...series.map((item) => Number(item.p95_latency_ms || 0)));

  const chartContainer = makeElement("div", "trend-chart-container");

  // Requests/errors bar chart
  const requestsChart = makeElement("div", "trend-line-chart");
  series.forEach((item, index) => {
    const group = makeElement("div", "trend-bar-group");

    // Request bar (green background)
    const requestBar = makeElement("div", "trend-bar trend-bar-requests");
    const requests = Number(item.requests || 0);
    const errors = Number(item.errors || 0);
    requestBar.style.height = `${Math.round((requests / maxRequests) * 100)}%`;
    requestBar.title = `${requests} requests`;

    // Error overlay (red)
    if (errors > 0) {
      const errorBar = makeElement("div", "trend-bar-errors");
      errorBar.style.height = `${Math.round((errors / requests) * 100)}%`;
      errorBar.title = `${errors} errors`;
      requestBar.append(errorBar);
    }

    // Time label
    const bucket = new Date(item.bucket);
    const bucketHours = data.bucket_hours || 1;
    const showLabel = bucketHours === 1
      ? index % 6 === 0
      : index % 3 === 0;

    const label = makeElement("span", "trend-label");
    if (showLabel) {
      label.textContent = bucketHours === 1
        ? new Intl.DateTimeFormat("en", { hour: "numeric" }).format(bucket)
        : new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(bucket);
    }

    group.append(requestBar, label);
    requestsChart.append(group);
  });

  // P95 latency SVG line
  const latencyLine = makeElement("svg", "trend-latency-line");
  latencyLine.setAttribute("viewBox", `0 0 ${series.length * 20} 100`);
  latencyLine.setAttribute("preserveAspectRatio", "none");

  const points = series.map((item, index) => {
    const x = index * 20 + 10;
    const latency = Number(item.p95_latency_ms || 0);
    const y = 100 - Math.round((latency / maxLatency) * 100);
    return `${x},${y}`;
  }).join(" ");

  const polyline = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  polyline.setAttribute("points", points);
  polyline.setAttribute("fill", "none");
  polyline.setAttribute("stroke", "#6366f1");
  polyline.setAttribute("stroke-width", "2");
  latencyLine.append(polyline);

  // Legend
  const legend = makeElement("div", "trend-legend");
  legend.append(
    makeElement("span", "trend-legend-item", "● Requests"),
    makeElement("span", "trend-legend-item trend-legend-errors", "● Errors"),
    makeElement("span", "trend-legend-item trend-legend-latency", "— P95 latency"),
  );

  chartContainer.append(requestsChart, latencyLine, legend);
  chart.append(chartContainer);
}

function buildFlagCard(flag) {
  const card = makeElement("article", "flag-card");
  card.dataset.flagKey = flag.key;
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
        if (input.type === "checkbox") {
          config[key] = input.checked;
          return;
        }
        if (input.dataset.configType === "integer") {
          const value = Number.parseInt(input.value, 10);
          if (!Number.isFinite(value)) {
            throw new Error(`${key.replaceAll("_", " ")} must be a number.`);
          }
          config[key] = value;
          return;
        }
        config[key] = input.value.trim();
      });
    } catch (error) {
      showToast(error.message || "Invalid JSON config.", true);
      return;
    }
    if (
      toggle.checked !== flag.enabled &&
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
      { key: "free_daily_limit", label: "Free daily limit", type: "integer", min: 1, max: 100 },
      { key: "pro_daily_limit", label: "Pro daily limit", type: "integer", min: 1, max: 1000 },
      { key: "max_stops", label: "Maximum stops", type: "integer", min: 2, max: 10 },
      {
        key: "ai_quality_preset",
        label: "Quality / cost profile",
        type: "select",
        options: ["economy", "balanced", "premium", "custom"],
      },
      {
        key: "openai_model",
        label: "OpenAI model ID",
        type: "text",
        suggestions: [
          "gpt-5.6-luna",
          "gpt-5.6-terra",
          "gpt-5.6-sol",
          "gpt-6-luna",
          "gpt-6-sol",
          "gpt-6-astra",
        ],
      },
      {
        key: "openai_reasoning_effort",
        label: "Reasoning effort",
        type: "select",
        options: ["none", "low", "medium", "high", "xhigh", "max"],
      },
      {
        key: "openai_search_context_size",
        label: "Web search context",
        type: "select",
        options: ["low", "medium", "high"],
      },
      {
        key: "openai_max_output_tokens",
        label: "Max output + reasoning tokens",
        type: "integer",
        min: 2000,
        max: 20000,
        step: 500,
      },
      {
        key: "openai_max_tool_calls",
        label: "Maximum web/tool calls",
        type: "integer",
        min: 1,
        max: 12,
      },
    ],
    ai_regional_tour: [
      { key: "requires_pro", label: "Pro members only", type: "checkbox" },
      {
        key: "free_daily_limit",
        label: "Regional tour — free daily limit",
        type: "integer",
        min: 1,
        max: 100,
      },
      {
        key: "pro_daily_limit",
        label: "Regional tour — Pro daily limit",
        type: "integer",
        min: 1,
        max: 1000,
      },
      {
        key: "ai_quality_preset",
        label: "Quality / cost profile",
        type: "select",
        options: ["economy", "balanced", "premium", "custom"],
      },
      {
        key: "openai_model",
        label: "OpenAI model ID",
        type: "text",
        suggestions: [
          "gpt-5.6-luna",
          "gpt-5.6-terra",
          "gpt-5.6-sol",
          "gpt-6-luna",
          "gpt-6-sol",
          "gpt-6-astra",
        ],
      },
      {
        key: "openai_reasoning_effort",
        label: "Reasoning effort",
        type: "select",
        options: ["none", "low", "medium", "high", "xhigh", "max"],
      },
      {
        key: "openai_search_context_size",
        label: "Web search context",
        type: "select",
        options: ["low", "medium", "high"],
      },
      {
        key: "openai_max_output_tokens",
        label: "Max output + reasoning tokens",
        type: "integer",
        min: 2000,
        max: 20000,
        step: 500,
      },
      {
        key: "openai_max_tool_calls",
        label: "Maximum web/tool calls",
        type: "integer",
        min: 1,
        max: 12,
      },
    ],
    route_geometry: [
      {
        key: "daily_limit",
        label: "Per-user daily request limit",
        type: "integer",
        min: 1,
        max: 1000,
      },
      {
        key: "global_daily_limit",
        label: "Global daily infrastructure budget",
        type: "integer",
        min: 10,
        max: 1000000,
      },
      {
        key: "timeout_ms",
        label: "Provider timeout (ms)",
        type: "integer",
        min: 2000,
        max: 30000,
        step: 500,
      },
    ],
    user_activity_tracking: [
      { key: "retention_days", label: "Retention days", type: "integer", min: 30, max: 365 },
    ],
    google_places_provider: [
      { key: "rollout_percent", label: "Rollout percent", type: "integer", min: 0, max: 100 },
    ],
    country_chat: [
      { key: "requires_pro", label: "Pro members only", type: "checkbox" },
    ],
  };
  const inputs = {};
  (schemas[flag.key] || []).forEach((field) => {
    const label = makeElement("label", "", field.label);
    const input = makeElement(field.type === "select" ? "select" : "input");
    input.dataset.configType = field.type === "integer" ? "integer" : "string";
    if (field.type === "select") {
      field.options.forEach((value) => {
        const option = makeElement("option", "", value);
        option.value = value;
        input.append(option);
      });
    } else {
      input.type = field.type === "integer" ? "number" : field.type;
    }
    if (input.type === "checkbox") {
      input.checked = flag.config?.[field.key] === true;
    } else {
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step !== undefined) input.step = field.step;
      input.value = flag.config?.[field.key] ?? field.options?.[0] ?? field.min ?? "";
    }
    if (field.suggestions) {
      const list = makeElement("datalist");
      list.id = `${flag.key}-${field.key}-suggestions`;
      field.suggestions.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        list.append(option);
      });
      input.setAttribute("list", list.id);
      label.append(input, list);
    } else {
      label.append(input);
    }
    input.disabled = state.context.role !== "owner";
    container.append(label);
    inputs[field.key] = input;
  });

  if (flag.key === "ai_daily_route" || flag.key === "ai_regional_tour") {
    const note = makeElement(
      "p",
      "ai-config-note",
      flag.key === "ai_regional_tour"
        ? "AI regional tour quota: change the Free or Pro daily limit above, then press Save. These limits are independent from AI Daily Route. A higher limit applies to the next request without redeploying; today's existing usage is preserved."
        : "Economy is the production-safe default. Choose Custom to enter any future valid model ID. Changes apply to new route requests without redeploying; API keys remain server-side.",
    );
    container.append(note);
    const presetInput = inputs.ai_quality_preset;
    presetInput.addEventListener("change", () => {
      const preset = AI_QUALITY_PRESETS[presetInput.value];
      if (!preset) return;
      Object.entries(preset).forEach(([key, value]) => {
        inputs[key].value = String(value);
      });
    });
    [
      "openai_model",
      "openai_reasoning_effort",
      "openai_search_context_size",
      "openai_max_output_tokens",
      "openai_max_tool_calls",
    ].forEach((key) => {
      inputs[key].addEventListener("input", () => {
        const preset = AI_QUALITY_PRESETS[presetInput.value];
        if (preset && String(preset[key]) !== inputs[key].value) {
          presetInput.value = "custom";
        }
      });
    });
  }
  if (flag.key === "route_geometry") {
    container.append(
      makeElement(
        "p",
        "ai-config-note",
        "Emergency kill switch: turn this flag off and press Save to stop new route-provider calls immediately. Lists remain usable without map geometry.",
      ),
    );
  }
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
  const openCount = reports.filter((report) => ["open", "reviewing"].includes(report.status)).length;
  reportBadge.textContent = String(openCount);
  reportBadge.hidden = openCount === 0;
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
    makeElement("span", "pill", report.report_type === "content" ? (report.content_type || "content") : "user"),
    makeElement("span", "pill", report.category),
    makeElement("span", "table-secondary", formatDate(report.created_at, true)),
  );
  content.append(
    meta,
    makeElement("h3", "", `${report.reporter_username || "Unknown"} reported ${report.reported_username || "Unknown"}`),
    makeElement("p", "report-details", report.details || "No additional details."),
  );
  if (report.content_snapshot) {
    content.append(makeElement("blockquote", "report-content-preview", report.content_snapshot));
  }
  if (report.is_suspended) {
    const suspensionLabel = report.suspended_until
      ? `Suspended until ${formatDate(report.suspended_until, true)}`
      : "Suspended indefinitely";
    content.append(makeElement("p", "pill pill-negative", suspensionLabel));
  }

  const controls = makeElement("div", "report-controls");
  const statusLabel = makeElement("label", "", "Status");
  const select = makeElement("select");
  ["reviewing", "resolved", "dismissed"].forEach((value) => {
    const option = makeElement("option", "", value);
    option.value = value;
    option.selected = value === (report.status === "open" ? "reviewing" : report.status);
    select.append(option);
  });
  statusLabel.append(select);
  const noteLabel = makeElement("label", "", "Moderator note");
  const note = makeElement("textarea");
  note.maxLength = 2000;
  note.value = report.moderator_note || "";
  noteLabel.append(note);
  const durationLabel = makeElement("label", "", "Suspension");
  const duration = makeElement("select");
  [
    [24, "24 hours"],
    [168, "7 days"],
    [720, "30 days"],
    ["", "Indefinite"],
  ].forEach(([value, label]) => {
    const option = makeElement("option", "", label);
    option.value = value;
    if (value === 168) option.selected = true;
    duration.append(option);
  });
  durationLabel.append(duration);

  async function runModeration(action, button, confirmation = "") {
    if (confirmation && !window.confirm(confirmation)) return;
    setBusy(button, true, "Working…");
    try {
      await callRpc("admin_moderate_report", {
        target_report_type: report.report_type || "user",
        target_report_id: report.id,
        moderation_action: action,
        note: note.value,
        suspension_hours: duration.value === "" ? null : Number(duration.value),
      });
      showToast("Moderation action completed.");
      await Promise.all([loadReports(), loadOverview(), state.context.role === "owner" ? loadAudit() : Promise.resolve()]);
    } catch (error) {
      console.error("Moderation action failed", error);
      showToast(error.message || "Moderation action could not be completed.", true);
    } finally {
      setBusy(button, false);
    }
  }

  const save = makeElement("button", "button button-secondary", "Save review");
  save.type = "button";
  save.addEventListener("click", () => runModeration(select.value, save));

  const suspend = makeElement("button", "button button-danger", "Suspend user");
  suspend.type = "button";
  suspend.addEventListener("click", () => runModeration(
    "suspend_user",
    suspend,
    `Suspend ${report.reported_username || "this user"}?`,
  ));

  const actionRow = makeElement("div", "form-actions");
  actionRow.append(save, suspend);
  if (report.report_type === "content") {
    const remove = makeElement("button", "button button-danger", "Remove content");
    remove.type = "button";
    remove.addEventListener("click", () => runModeration(
      "remove_content",
      remove,
      "Permanently remove the reported content?",
    ));
    const removeSuspend = makeElement("button", "button button-danger", "Remove + suspend");
    removeSuspend.type = "button";
    removeSuspend.addEventListener("click", () => runModeration(
      "remove_and_suspend",
      removeSuspend,
      "Remove the content and suspend its author?",
    ));
    actionRow.append(remove, removeSuspend);
  }
  if (report.is_suspended) {
    const restore = makeElement("button", "button button-secondary", "Restore user");
    restore.type = "button";
    restore.addEventListener("click", () => runModeration("restore_user", restore));
    actionRow.append(restore);
  }
  controls.append(statusLabel, noteLabel, durationLabel, actionRow);
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
  if (sectionName === 'notifications' && state.context?.role === 'owner') {
    void mountNotifications(document.querySelector('#section-notifications'), callRpc, showToast, state.context.user_id);
  }
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

document.querySelectorAll("#routingPeriodSelector .period-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const hours = Number(button.dataset.hours);
    if (hours === state.routingPeriodHours) return;

    state.routingPeriodHours = hours;

    // Update active state
    document.querySelectorAll("#routingPeriodSelector .period-button").forEach((btn) => {
      btn.classList.toggle("is-active", btn === button);
    });

    // Reload metrics with new period
    try {
      await loadRoutingMetrics();
    } catch (error) {
      console.error("Routing metrics reload failed", error);
      showToast(error.message || "Routing metrics could not be reloaded.", true);
    }
  });
});

document.querySelectorAll("#aiRoutePeriodSelector .period-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const hours = Number(button.dataset.hours);
    if (hours === state.aiRoutePeriodHours) return;

    state.aiRoutePeriodHours = hours;

    // Update active state
    document.querySelectorAll("#aiRoutePeriodSelector .period-button").forEach((btn) => {
      btn.classList.toggle("is-active", btn === button);
    });

    // Reload metrics with new period
    try {
      await loadAiRouteMetrics();
    } catch (error) {
      console.error("AI route metrics reload failed", error);
      showToast(error.message || "AI route metrics could not be reloaded.", true);
    }
  });
});

document.querySelectorAll("#aiTourPeriodSelector .period-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const hours = Number(button.dataset.hours);
    if (hours === state.aiTourPeriodHours) return;

    state.aiTourPeriodHours = hours;

    // Update active state
    document.querySelectorAll("#aiTourPeriodSelector .period-button").forEach((btn) => {
      btn.classList.toggle("is-active", btn === button);
    });

    // Reload metrics with new period
    try {
      await loadAiTourMetrics();
    } catch (error) {
      console.error("AI tour metrics reload failed", error);
      showToast(error.message || "AI tour metrics could not be reloaded.", true);
    }
  });
});

document.querySelectorAll("#syncPeriodSelector .period-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const hours = Number(button.dataset.hours);
    if (hours === state.syncPeriodHours) return;

    state.syncPeriodHours = hours;

    // Update active state
    document.querySelectorAll("#syncPeriodSelector .period-button").forEach((btn) => {
      btn.classList.toggle("is-active", btn === button);
    });

    // Reload metrics with new period
    try {
      await loadSyncHealthMetrics();
    } catch (error) {
      console.error("Sync health metrics reload failed", error);
      showToast(error.message || "Sync health metrics could not be reloaded.", true);
    }
  });
});

document.querySelectorAll("#sharePeriodSelector .period-button").forEach((button) => {
  button.addEventListener("click", async () => {
    const hours = Number(button.dataset.hours);
    if (hours === state.sharePeriodHours) return;

    state.sharePeriodHours = hours;

    // Update active state
    document.querySelectorAll("#sharePeriodSelector .period-button").forEach((btn) => {
      btn.classList.toggle("is-active", btn === button);
    });

    // Reload metrics with new period
    try {
      await loadShareEndpointMetrics();
    } catch (error) {
      console.error("Share endpoint metrics reload failed", error);
      showToast(error.message || "Share endpoint metrics could not be reloaded.", true);
    }
  });
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
