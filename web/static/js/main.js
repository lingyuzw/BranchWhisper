/* ============================================================
   main.js — SPA router (single HTML, all pages inline)
   LoveChoice Voice Console · Precision Console
   ============================================================ */

import { renderIcons } from "./utils.js";

let currentPage = "dashboard";
let dashboardInitialized = false;
let servicesInitialized = false;
let settingsInitialized = false;

/* ---- SPA navigation ---- */

document.addEventListener("DOMContentLoaded", async () => {
  renderIcons();
  setupNav();
  loadTheme();

  const initial = document.body.dataset.page || "dashboard";
  await switchPage(initial);
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
    const page = e.state?.page || "dashboard";
    if (page !== currentPage) switchPage(page, false);
  });
}

async function switchPage(page, pushState = true) {
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

  // init page module, but skip re-init if already loaded (SPA anti-flash)
  try {
    if (page === "dashboard") {
      if (!dashboardInitialized) {
        const { initDashboard } = await import("./ui-dashboard.js");
        await initDashboard();
        dashboardInitialized = true;
      }
    } else if (page === "services") {
      if (!servicesInitialized) {
        const { initServices } = await import("./ui-services.js");
        initServices();
        servicesInitialized = true;
      }
    } else if (page === "settings") {
      if (!settingsInitialized) {
        const { initSettings } = await import("./ui-settings.js");
        await initSettings();
        settingsInitialized = true;
      }
    }
  } catch (e) {
    console.error(`Failed to init page ${page}:`, e);
  }
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
}

export function setTheme(theme) {
  applyTheme(theme);
  localStorage.setItem("lovechoice.theme", theme);
  // update toggle buttons
  document.querySelectorAll("#themeToggle button").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.theme === theme);
  });
}
