/* ============================================================
   main.js — SPA router (single HTML, all pages inline)
   LoveChoice Voice Console · Precision Console
   ============================================================ */

import { renderIcons } from "./utils.js";

let currentPage = "dashboard";
let dashboardInitialized = false;
let servicesInitialized = false;
let currentLeave = null;

/* ---- SPA navigation ---- */

document.addEventListener("DOMContentLoaded", async () => {
  renderIcons();
  setupNav();
  loadTheme();

  const initial = pageFromHash() || document.body.dataset.page || "dashboard";
  await switchPage(initial, false);
});

function setupNav() {
  document.querySelectorAll("#mainNav a[data-nav]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const page = link.dataset.nav;
      if (page && page !== currentPage) switchPage(page);
    });
  });

  document.querySelector(".brand[data-nav]")?.addEventListener("click", (e) => {
    e.preventDefault();
    if (currentPage !== "dashboard") switchPage("dashboard");
  });

  window.addEventListener("popstate", (e) => {
    const page = e.state?.page || pageFromHash() || "dashboard";
    if (page !== currentPage) switchPage(page, false);
  });

  window.addEventListener("hashchange", () => {
    const page = pageFromHash();
    if (page && page !== currentPage) switchPage(page, false);
  });
}

async function switchPage(page, pushState = true) {
  page = normalizePage(page);
  if (currentLeave) {
    currentLeave();
    currentLeave = null;
  }

  // hide all
  document.querySelectorAll(".page-view").forEach((p) => { p.style.display = "none"; });

  // show target
  const view = document.getElementById(`page-${page}`);
  if (view) {
    view.style.display = "";
    // reset animation
    view.style.animation = "none";
    view.offsetHeight; // trigger reflow
    view.style.animation = "";
  }

  // nav active
  document.querySelectorAll("#mainNav a[data-nav]").forEach((a) => {
    a.classList.toggle("active", a.dataset.nav === page);
  });

  document.body.dataset.page = page;

  // memory button only on dashboard
  const memBtn = document.getElementById("memoryTriggerBtn");
  if (memBtn) memBtn.style.display = page === "dashboard" ? "" : "none";

  currentPage = page;
  if (pushState) history.pushState({ page }, "", `#${page}`);

  // init page module — always re-init settings (it's lightweight and idempotent)
  // dashboard and services are heavy (websocket, polling) so only init once
  try {
    if (page === "dashboard") {
      if (!dashboardInitialized) {
        const { initDashboard } = await import("./ui-dashboard.js");
        await initDashboard();
        dashboardInitialized = true;
      }
    } else if (page === "services") {
      const servicesModule = await import("./ui-services.js");
      if (!servicesInitialized) {
        servicesModule.initServices();
        servicesInitialized = true;
      }
      servicesModule.enterServices?.();
      currentLeave = servicesModule.leaveServices || null;
    } else if (page === "settings") {
      const settingsModule = await import("./ui-settings.js");
      await settingsModule.initSettings();
      currentLeave = settingsModule.leaveSettings || null;
    }
  } catch (e) {
    console.error(`Failed to init page ${page}:`, e);
    // reset latch so user can retry
    if (page === "services") servicesInitialized = false;
    if (page === "dashboard") dashboardInitialized = false;
  }
}

function normalizePage(page) {
  return ["dashboard", "services", "settings"].includes(page) ? page : "dashboard";
}

function pageFromHash() {
  const hash = location.hash.replace(/^#/, "");
  if (!hash) return "";
  if (hash.startsWith("logs-")) return "services";
  return normalizePage(hash.split("-")[0]);
}

/* ---- theme ---- */

export function loadTheme() {
  const saved = localStorage.getItem("lovechoice.theme") || "dark";
  applyTheme(saved);
}

function applyTheme(theme) {
  if (theme === "light") {
    document.documentElement.classList.add("theme-light");
  } else {
    document.documentElement.classList.remove("theme-light");
  }
  // sync toggle buttons if present
  document.querySelectorAll("#themeToggle button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
}

export function setTheme(theme) {
  applyTheme(theme);
  localStorage.setItem("lovechoice.theme", theme);
  // update toggle buttons
  document.querySelectorAll("#themeToggle button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
}

// 暴露主题 API 给其他模块使用
window.__lovechoice = {
  setTheme,
  loadTheme,
  getTheme: () => localStorage.getItem("lovechoice.theme") || "dark",
};
