/*
  Theme: light/dark mode + selectable/custom accent palettes.
  -------------------------------------------------------------
  Mode (dark/light/auto) and palette are independent choices. This file
  is loaded early in <head> — its apply() call runs synchronously at
  parse time, before <body> renders, so there's no flash of the wrong
  theme. Everything is stored in localStorage; nothing here ever touches
  IndexedDB or the network.
*/

const THEME_SETTINGS_KEY = "thirdPosition.theme";

// Each preset gives a dark and a light variant, hand-tuned for contrast
// against that mode's background rather than just inverted. --accent-4
// always mirrors --danger (set together below), so only 4 knobs really
// exist per mode.
const PALETTES = {
  lab: {
    label: "Lab (default)",
    dark: { accent: "#e0a336", accent2: "#4f9d8a", accent3: "#a883d1", danger: "#d9736c" },
    light: { accent: "#a8721f", accent2: "#2f7b68", accent3: "#7a5aa8", danger: "#b8483f" },
  },
  slate: {
    label: "Slate & steel",
    dark: { accent: "#6d9dc5", accent2: "#5fb0c7", accent3: "#8f8bd0", danger: "#c76a6a" },
    light: { accent: "#3c6f95", accent2: "#2c7a8c", accent3: "#5f5aa8", danger: "#a8433f" },
  },
  rust: {
    label: "Rust & moss",
    dark: { accent: "#c2703a", accent2: "#8a9a5b", accent3: "#c98f3f", danger: "#b5504a" },
    light: { accent: "#96521f", accent2: "#5f7031", accent3: "#8f6420", danger: "#963d38" },
  },
  ink: {
    label: "Violet & teal",
    dark: { accent: "#a883d1", accent2: "#4f9d8a", accent3: "#d18f9e", danger: "#cf6d95" },
    light: { accent: "#6d4fa0", accent2: "#2f7b68", accent3: "#a15c72", danger: "#a1466c" },
  },
  custom: {
    label: "Custom",
    dark: null,
    light: null,
  },
};

function getThemeSettings() {
  try {
    const raw = localStorage.getItem(THEME_SETTINGS_KEY);
    if (!raw) return { mode: "dark", paletteId: "lab", customColors: null };
    const parsed = JSON.parse(raw);
    return {
      mode: parsed.mode || "dark",
      paletteId: parsed.paletteId || "lab",
      customColors: parsed.customColors || null,
    };
  } catch {
    return { mode: "dark", paletteId: "lab", customColors: null };
  }
}

function saveThemeSettings(settings) {
  try {
    localStorage.setItem(THEME_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* localStorage unavailable — theme just won't persist across visits */
  }
}

function resolveMode(mode) {
  if (mode === "auto") {
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }
  return mode === "light" ? "light" : "dark";
}

function applyTheme() {
  const settings = getThemeSettings();
  const resolved = resolveMode(settings.mode);
  document.documentElement.setAttribute("data-theme", resolved);

  const preset = PALETTES[settings.paletteId] || PALETTES.lab;
  const colors = settings.paletteId === "custom" && settings.customColors ? settings.customColors : preset[resolved] || PALETTES.lab[resolved];

  const root = document.documentElement.style;
  root.setProperty("--accent", colors.accent);
  root.setProperty("--accent-2", colors.accent2);
  root.setProperty("--accent-3", colors.accent3);
  root.setProperty("--danger", colors.danger);
  root.setProperty("--accent-4", colors.danger);

  return { settings, resolved };
}

applyTheme();
