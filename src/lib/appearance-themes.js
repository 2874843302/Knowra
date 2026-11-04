export const THEME_CACHE_KEY = "knowra-ui-theme";
export const appearanceThemes = [
  {
    id: "watercolor",
    name: "水彩漫游",
    description: "温暖纸张、柔和色晕，留一点想象的空间。",
    mode: "light",
    palette: {
      canvas: "#faf8f5",
      surface: "#fffdf9",
      ink: "#303c49",
      muted: "#59636b",
      accent: "#4a6fa5",
      onAccent: "#fffdf9",
      soft: "#e4ece5",
      border: "#dfdad3",
    },
    radius: 24,
    editorial: true,
  },
  {
    id: "minimal",
    name: "简约留白",
    description: "干净线条、清晰层级，把注意力交给内容。",
    mode: "light",
    palette: {
      canvas: "#f6f8fb",
      surface: "#ffffff",
      ink: "#253247",
      muted: "#58677b",
      accent: "#365e91",
      onAccent: "#ffffff",
      soft: "#eaf0f8",
      border: "#d9e1ec",
    },
    radius: 12,
  },
  {
    id: "paper",
    name: "书卷时光",
    description: "米色书页、棕色墨迹，像翻开一本随身笔记。",
    mode: "light",
    palette: {
      canvas: "#f1e9db",
      surface: "#fff8ec",
      ink: "#49392e",
      muted: "#756150",
      accent: "#8a5735",
      onAccent: "#fffaf1",
      soft: "#eee0c9",
      border: "#dccbb2",
    },
    radius: 16,
    editorial: true,
  },
  {
    id: "forest",
    name: "林间呼吸",
    description: "鼠尾草绿、轻盈圆角，在安静中慢慢理解。",
    mode: "light",
    palette: {
      canvas: "#eff5f0",
      surface: "#fbfdf9",
      ink: "#263e34",
      muted: "#52695c",
      accent: "#316b53",
      onAccent: "#ffffff",
      soft: "#e1eee3",
      border: "#ccdbce",
    },
    radius: 28,
  },
  {
    id: "night",
    name: "静夜专注",
    description: "深蓝底色、柔亮文字，适合光线较暗的时候。",
    mode: "dark",
    palette: {
      canvas: "#151f2e",
      surface: "#1e2b3c",
      ink: "#e4ecf5",
      muted: "#b0bfd1",
      accent: "#a8c8f4",
      onAccent: "#172940",
      soft: "#2a3d54",
      border: "#41536a",
    },
    radius: 20,
  },
];

export function resolveTheme(id) {
  return (
    appearanceThemes.find((theme) => theme.id === id) || appearanceThemes[0]
  );
}

function tokensFor(theme) {
  if (theme.id === "watercolor") return {};
  const p = theme.palette,
    dark = theme.mode === "dark";
  const mix = (a, percent, b) => `color-mix(in srgb, ${a} ${percent}%, ${b})`;
  const result = {
    "--surface-canvas": p.canvas,
    "--surface-default": p.surface,
    "--surface-brand": p.surface,
    "--surface-elevated": p.surface,
    "--surface-subtle": mix(p.surface, 45, p.canvas),
    "--surface-muted": p.soft,
    "--surface-selected": p.soft,
    "--surface-inverse": p.ink,
    "--surface-overlay": dark ? "#080f1bb3" : "#18263766",
    "--text-primary": p.ink,
    "--text-secondary": p.muted,
    "--text-tertiary": p.muted,
    "--text-disabled": p.muted,
    "--text-inverse": p.surface,
    "--text-on-action": p.onAccent,
    "--text-brand": p.accent,
    "--text-link": p.accent,
    "--border-subtle": mix(p.border, 65, p.surface),
    "--border-default": p.border,
    "--border-strong": mix(p.border, 65, p.muted),
    "--border-focus": p.muted,
    "--border-brand": p.accent,
    "--brand-50": mix(p.accent, 8, p.surface),
    "--brand-100": p.soft,
    "--brand-200": mix(p.accent, 30, p.surface),
    "--brand-300": mix(p.accent, 45, p.surface),
    "--brand-400": mix(p.accent, 70, p.surface),
    "--brand-500": p.accent,
    "--brand-600": mix(p.accent, 86, dark ? "#ffffff" : "#172a3c"),
    "--brand-700": mix(p.accent, 75, dark ? "#ffffff" : "#172a3c"),
    "--brand-800": p.ink,
    "--brand-900": p.ink,
    "--brand-950": p.ink,
    "--gray-0": p.surface,
    "--gray-25": mix(p.surface, 80, p.canvas),
    "--gray-50": p.canvas,
    "--gray-100": p.soft,
    "--gray-150": mix(p.border, 55, p.surface),
    "--gray-200": p.border,
    "--gray-300": mix(p.border, 65, p.muted),
    "--gray-400": p.muted,
    "--gray-500": p.muted,
    "--gray-600": p.muted,
    "--gray-700": p.ink,
    "--gray-800": p.ink,
    "--gray-900": p.ink,
    "--gray-950": p.ink,
    "--font-editorial": theme.editorial
      ? '"EB Garamond", ChillDuanHeiSong, "Songti SC", serif'
      : "var(--font-sans)",
    "--paper-grain": "none",
    "--paper-wash": "none",
    "--theme-card-radius": `${theme.radius}px`,
    "--theme-control-radius": theme.id === "minimal" ? "10px" : "16px",
    "--radius-lg": `${theme.radius}px`,
    "--radius-xl": `${theme.radius}px`,
    "--shadow-xs": `0 1px 3px ${dark ? "#00000022" : "#24394b06"}`,
    "--shadow-sm":
      theme.id === "minimal"
        ? "none"
        : `0 3px 12px ${dark ? "#00000022" : "#30453508"}`,
    "--shadow-md":
      theme.id === "minimal"
        ? "none"
        : `0 7px 24px ${dark ? "#00000033" : "#3045350c"}`,
    "--shadow-lg": `0 16px 40px ${dark ? "#00000044" : "#30453514"}`,
    "--shadow-xl": `0 20px 60px ${dark ? "#00000055" : "#30453520"}`,
    "--shadow-focus": `0 0 0 3px ${mix(p.accent, 22, "transparent")}`,
    "--board-title": dark ? "#c2a9ff" : "#6741d9",
    "--board-diagram-secondary": dark ? "#89cec0" : "#278477",
    "--board-highlight": dark ? "#887b3855" : "#f6edb780",
    "--board-annotation": dark ? "#e5b18a" : "#b97853",
    "--ink-sketch": dark ? "#a2b4d0" : p.accent,
    "--ink-highlight": dark ? "#887b38" : "#e9cc79",
  };
  if (theme.id === "paper") {
    result["--paper-grain"] =
      "repeating-linear-gradient(0deg, #92754805 0 1px, transparent 1px 4px)";
  }
  if (theme.id === "forest") {
    result["--paper-wash"] =
      "radial-gradient(ellipse at 95% 0%, #92baa921, transparent 55%)";
  }
  if (dark)
    Object.assign(result, {
      "--green-50": "#203e36",
      "--green-100": "#254b3e",
      "--green-200": "#3d6b57",
      "--green-500": "#8dceb1",
      "--green-600": "#9fd7bd",
      "--green-700": "#ade0ca",
      "--amber-50": "#41371f",
      "--amber-100": "#4c4025",
      "--amber-200": "#7d6740",
      "--amber-500": "#e4c285",
      "--amber-600": "#e9cc97",
      "--amber-700": "#efd6a8",
      "--red-50": "#422c37",
      "--red-100": "#513340",
      "--red-200": "#805060",
      "--red-500": "#e8a6b0",
      "--red-600": "#edb1ba",
      "--red-700": "#f2bec5",
      "--cyan-50": "#243b51",
      "--cyan-200": "#496d8c",
      "--cyan-600": "#a8c8f4",
      "--cyan-700": "#b7d3f7",
    });
  return result;
}

const managedTokens = [
  ...new Set(
    appearanceThemes.flatMap((theme) => Object.keys(tokensFor(theme))),
  ),
];

export function applyTheme(id, root = document.documentElement) {
  const theme = resolveTheme(id);
  managedTokens.forEach((name) => root.style.removeProperty(name));
  Object.entries(tokensFor(theme)).forEach(([name, value]) =>
    root.style.setProperty(name, value),
  );
  root.dataset.uiTheme = theme.id;
  root.style.colorScheme = theme.mode;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute("content", theme.palette.canvas);
  try {
    localStorage.setItem(THEME_CACHE_KEY, theme.id);
  } catch {}
}

export function cachedTheme() {
  try {
    return resolveTheme(localStorage.getItem(THEME_CACHE_KEY)).id;
  } catch {
    return "watercolor";
  }
}
