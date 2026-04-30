import { invoke } from "@tauri-apps/api/core";
import type {
  DashboardOverview,
  PlatformNews,
  ModelChangelogEntry,
  ExportsStatsData,
} from "./state";
import { state } from "./state";
import { t } from "./translations";
import { escapeHtml, changeTypeLabel } from "./utils";
import { currentPlatformAuthPayload } from "./platform";

// ---- v0.1.8: Recent updates & feedback ----

function formatDateString(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return new Intl.DateTimeFormat(state.currentLang === "zh" ? "zh-CN" : "en-US", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    }).format(d);
  } catch { return dateStr; }
}

function formatTimestamp(ts: number | null): string {
  if (!ts) return t("empty_value");
  return new Intl.DateTimeFormat(state.currentLang === "zh" ? "zh-CN" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(ts));
}

export function renderRecentUpdatesPanel() {
  const panel = document.querySelector<HTMLElement>("#recent-updates-panel");
  if (!panel) return;

  const isConnected = state.platformLoginState.kind === "success";

  if (!isConnected) {
    panel.innerHTML = `
      <div class="recent-updates-disconnected">
        <p>${escapeHtml(t("recent_updates_disconnected"))}</p>
      </div>`;
    return;
  }

  const overview = state.dashboardOverviewState;
  const exportsStats = state.exportsStatsState;
  const changelog = state.modelChangelogState;
  const news = state.platformNewsState;

  const overviewHtml = overview.kind === "loading" ? `
    <div class="recent-updates-card">
      <div class="recent-updates-loading">${state.currentLang === "zh" ? "加载中" : "Loading"}...</div>
    </div>` : overview.kind === "error" ? `
    <div class="recent-updates-card error">
      <p>${escapeHtml(overview.message)}</p>
    </div>` : overview.kind === "success" ? `
    <div class="recent-updates-card">
      <div class="recent-updates-stats">
        <div class="stat-item">
          <span class="stat-value">${overview.data.todayQas}</span>
          <span class="stat-label">${escapeHtml(t("recent_updates_today_qa"))}</span>
        </div>
        <div class="stat-item">
          <span class="stat-value">${overview.data.weekQas}</span>
          <span class="stat-label">${escapeHtml(t("recent_updates_week_qa"))}</span>
        </div>
      </div>
      <div class="recent-updates-refresh">
        <span class="stat-label">${escapeHtml(t("recent_updates_last_refresh"))}: ${escapeHtml(formatTimestamp(state.recentUpdatesLastRefreshTime))}</span>
      </div>
    </div>` : "";

  const weeklyHtml = exportsStats.kind === "loading" ? `
    <div class="recent-updates-card">
      <h3>${state.currentLang === "zh" ? "周 QA 趋势" : "Weekly QA Trend"}</h3>
      <div class="recent-updates-loading">${state.currentLang === "zh" ? "加载中" : "Loading"}...</div>
    </div>` : exportsStats.kind === "error" ? `
    <div class="recent-updates-card error">
      <h3>${state.currentLang === "zh" ? "周 QA 趋势" : "Weekly QA Trend"}</h3>
      <p>${escapeHtml(exportsStats.message)}</p>
    </div>` : exportsStats.kind === "success" ? renderWeeklyStats(exportsStats.data) : "";

  const changelogHtml = changelog.kind === "loading" ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_model_changes"))}</h3>
      <div class="recent-updates-loading">${state.currentLang === "zh" ? "加载中" : "Loading"}...</div>
    </div>` : changelog.kind === "error" ? `
    <div class="recent-updates-card error">
      <h3>${escapeHtml(t("recent_updates_model_changes"))}</h3>
      <p>${escapeHtml(changelog.message)}</p>
    </div>` : changelog.kind === "success" && changelog.items.length === 0 ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_model_changes"))}</h3>
      <p class="recent-updates-empty">${escapeHtml(t("recent_updates_no_model_changes"))}</p>
    </div>` : changelog.kind === "success" ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_model_changes"))}</h3>
      <div class="recent-updates-changelog-list">
        ${changelog.items.map(item => `
          <div class="changelog-item">
            <span class="changelog-type-badge type-${escapeHtml(item.changeType)}">${escapeHtml(changeTypeLabel(item.changeType))}</span>
            <span class="changelog-description">${escapeHtml(item.description)}</span>
            <span class="changelog-date">${escapeHtml(formatDateString(item.createdAt))}</span>
          </div>
        `).join("")}
      </div>
    </div>` : "";

  const newsHtml = news.kind === "loading" ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_messages"))}</h3>
      <div class="recent-updates-loading">${state.currentLang === "zh" ? "加载中" : "Loading"}...</div>
    </div>` : news.kind === "error" ? `
    <div class="recent-updates-card error">
      <h3>${escapeHtml(t("recent_updates_messages"))}</h3>
      <p>${escapeHtml(news.message)}</p>
    </div>` : news.kind === "success" && news.items.length === 0 ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_messages"))}</h3>
      <p class="recent-updates-empty">${escapeHtml(t("recent_updates_no_messages"))}</p>
    </div>` : news.kind === "success" ? `
    <div class="recent-updates-card">
      <h3>${escapeHtml(t("recent_updates_messages"))}</h3>
      <div class="recent-updates-news-list">
        ${news.items.map(item => `
          <div class="news-item">
            <div class="news-item-header">
              <span class="news-item-title">${escapeHtml(item.title)}</span>
              <span class="news-item-date">${escapeHtml(formatDateString(item.createdAt))}</span>
            </div>
            <div class="news-item-content">${escapeHtml(item.content)}</div>
          </div>
        `).join("")}
      </div>
    </div>` : "";

  panel.innerHTML = `
    <div class="recent-updates-layout">
      ${overviewHtml}
      ${weeklyHtml}
      ${changelogHtml}
      ${newsHtml}
    </div>`;
}

export function renderWeeklyStats(data: ExportsStatsData): string {
  const weeks = data.weekly;
  const daily = data.daily;

  // Build a lookup map: "2026-04-25" -> importCount
  const dailyMap = new Map<string, number>();
  for (const d of daily) {
    dailyMap.set(d.period, d.importCount);
  }

  // Generate last 14 calendar days, fill missing with 0
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const recentDays: Array<{ date: string; count: number; isToday: boolean }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    recentDays.push({
      date: dateStr,
      count: dailyMap.get(dateStr) ?? 0,
      isToday: i === 0
    });
  }

  const maxVal = Math.max(...recentDays.map(d => d.count), 1);

  function barHeight(count: number): number {
    return Math.max(3, Math.round((count / maxVal) * 60));
  }

  function dayLabel(dateStr: string): string {
    try {
      const d = new Date(dateStr + "T00:00:00");
      return state.currentLang === "zh"
        ? ["日", "一", "二", "三", "四", "五", "六"][d.getDay()]
        : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()];
    } catch { return dateStr.slice(-5); }
  }

  return `
    <div class="recent-updates-card">
      <h3>${state.currentLang === "zh" ? "周 QA 趋势" : "Weekly QA Trend"}</h3>
      <div class="weekly-summary">
        ${weeks.length > 1 ? `
        <div class="weekly-summary-item">
          <span class="weekly-summary-period">${state.currentLang === "zh" ? "上周" : "Last Week"}</span>
          <span class="weekly-summary-count">${weeks[weeks.length - 2].importCount.toLocaleString()}</span>
        </div>` : ""}
        ${weeks.length > 0 ? `
        <div class="weekly-summary-item">
          <span class="weekly-summary-period">${state.currentLang === "zh" ? "本周" : "This Week"}</span>
          <span class="weekly-summary-count">${weeks[weeks.length - 1].importCount.toLocaleString()}</span>
        </div>` : ""}
      </div>
      <div class="daily-trend">
        <div class="daily-trend-bars">
          ${recentDays.map(d => `
            <div class="daily-bar-item" title="${d.date}: ${d.count.toLocaleString()}">
              <span class="daily-bar-count">${d.count > 0 ? d.count.toLocaleString() : ""}</span>
              <div class="daily-bar" style="height: ${barHeight(d.count)}px"></div>
              ${d.isToday ? '<span class="daily-bar-today">' + (state.currentLang === "zh" ? "今天" : "Today") + '</span>' : `<span class="daily-bar-label">${dayLabel(d.date)}</span>`}
            </div>
          `).join("")}
        </div>
      </div>
    </div>`;
}

export async function loadRecentUpdatesData() {
  const auth = currentPlatformAuthPayload();
  if (!auth) {
    state.dashboardOverviewState = { kind: "idle" };
    state.platformNewsState = { kind: "idle" };
    state.modelChangelogState = { kind: "idle" };
    state.exportsStatsState = { kind: "idle" };
    renderRecentUpdatesPanel();
    return;
  }

  state.dashboardOverviewState = { kind: "loading" };
  state.platformNewsState = { kind: "loading" };
  state.modelChangelogState = { kind: "loading" };
  state.exportsStatsState = { kind: "loading" };
  renderRecentUpdatesPanel();

  try {
    const [overview, news, changelog, exportsStats] = await Promise.all([
      invoke<DashboardOverview>("get_platform_stats", auth),
      invoke<PlatformNews[]>("get_platform_news", auth),
      invoke<ModelChangelogEntry[]>("get_model_changelog", { ...auth, days: 7 }),
      invoke<ExportsStatsData>("get_exports_stats", auth)
    ]);
    state.dashboardOverviewState = { kind: "success", data: overview };
    state.platformNewsState = { kind: "success", items: news };
    state.modelChangelogState = { kind: "success", items: changelog };
    state.exportsStatsState = { kind: "success", data: exportsStats };
    state.recentUpdatesLastRefreshTime = Date.now();
  } catch (error) {
    state.dashboardOverviewState = { kind: "error", message: String(error) };
    state.platformNewsState = { kind: "error", message: String(error) };
    state.modelChangelogState = { kind: "error", message: String(error) };
    state.exportsStatsState = { kind: "error", message: String(error) };
  }
  renderRecentUpdatesPanel();
}
