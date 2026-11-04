import assert from "node:assert/strict";
import { test } from "node:test";
import {
  appearanceThemes,
  resolveTheme,
  applyTheme,
  cachedTheme,
} from "../src/lib/appearance-themes.js";

const luminance = (hex) => {
  const channels = hex
    .slice(1)
    .match(/../g)
    .map((c) => parseInt(c, 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
};
const contrast = (a, b) => {
  const values = [luminance(a), luminance(b)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
};

test("all preset palettes meet AA text contrast on their reading and action surfaces", () => {
  for (const { name, palette: p } of appearanceThemes) {
    for (const bg of [p.canvas, p.surface, p.soft]) {
      assert.ok(contrast(p.ink, bg) >= 4.5, `${name}: primary text`);
      assert.ok(contrast(p.muted, bg) >= 4.5, `${name}: secondary text`);
    }
    assert.ok(contrast(p.onAccent, p.accent) >= 4.5, `${name}: action text`);
  }
});

test("legacy or unknown theme values fall back to watercolor", () => {
  for (const id of [undefined, null, "not-installed", { id: "night" }])
    assert.equal(resolveTheme(id).id, "watercolor");
});

test("switching from night clears dark status colors without changing board-font preferences", () => {
  const previousDocument = globalThis.document,
    previousStorage = globalThis.localStorage;
  const values = new Map([["--font-board", "custom-board-font"]]),
    storage = new Map();
  const root = {
    dataset: {},
    style: {
      setProperty: (key, value) => values.set(key, value),
      removeProperty: (key) => values.delete(key),
    },
  };
  globalThis.document = { querySelector: () => null };
  globalThis.localStorage = {
    setItem: (key, value) => storage.set(key, value),
    getItem: (key) => storage.get(key),
  };
  try {
    applyTheme("night", root);
    assert.equal(root.style.colorScheme, "dark");
    assert.ok(values.has("--red-50"));
    assert.equal(cachedTheme(), "night");
    applyTheme("minimal", root);
    assert.equal(root.dataset.uiTheme, "minimal");
    assert.equal(root.style.colorScheme, "light");
    assert.equal(values.has("--red-50"), false);
    applyTheme("watercolor", root);
    assert.deepEqual([...values], [["--font-board", "custom-board-font"]]);
    assert.equal(cachedTheme(), "watercolor");
  } finally {
    globalThis.document = previousDocument;
    globalThis.localStorage = previousStorage;
  }
});

test("blocked browser storage never prevents applying or restoring a theme", () => {
  const previousDocument = globalThis.document,
    previousStorage = globalThis.localStorage;
  globalThis.document = { querySelector: () => null };
  globalThis.localStorage = {
    setItem: () => {
      throw new Error("blocked");
    },
    getItem: () => {
      throw new Error("blocked");
    },
  };
  const root = {
    dataset: {},
    style: { setProperty() {}, removeProperty() {} },
  };
  try {
    applyTheme("forest", root);
    assert.equal(root.dataset.uiTheme, "forest");
    assert.equal(cachedTheme(), "watercolor");
  } finally {
    globalThis.document = previousDocument;
    globalThis.localStorage = previousStorage;
  }
});
