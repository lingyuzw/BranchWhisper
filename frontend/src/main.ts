import { createPinia } from "pinia";
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import "./styles/main.css";

function applyInitialTheme() {
  const theme = window.localStorage.getItem("branchwhisper:theme") === "light" ? "light" : "dark";
  document.documentElement.classList.toggle("theme-light", theme === "light");
  document.documentElement.classList.toggle("theme-dark", theme === "dark");
}

applyInitialTheme();

createApp(App).use(createPinia()).use(router).mount("#app");
