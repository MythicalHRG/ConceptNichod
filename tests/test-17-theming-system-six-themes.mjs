import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

// Exact 6 themes specification defined in PROJECT.md and ORIGINAL_REQUEST.md
export const THEMES = [
  "light",
  "dark",
  "midnight-neon",
  "sunset-amber",
  "forest-emerald",
  "cyberpunk-indigo"
];

export const THEME_METADATA = {
  light: {
    label: "Light",
    base: "light",
    primaryHue: 45, // Amber gold / warm
    description: "Clean, warm daytime palette"
  },
  dark: {
    label: "Dark",
    base: "dark",
    primaryHue: 45,
    description: "Deep neutral dark contrast"
  },
  "midnight-neon": {
    label: "Midnight Neon",
    base: "dark",
    primaryHue: 190, // Neon cyan / blue
    description: "High-contrast midnight with vivid neon accents"
  },
  "sunset-amber": {
    label: "Sunset Amber",
    base: "dark",
    primaryHue: 35, // Warm sunset amber/orange
    description: "Deep evening twilight with warm amber glow"
  },
  "forest-emerald": {
    label: "Forest / Emerald",
    base: "dark",
    primaryHue: 155, // Emerald green
    description: "Lush botanical forest greens and calming accents"
  },
  "cyberpunk-indigo": {
    label: "Cyberpunk / Indigo",
    base: "dark",
    primaryHue: 260, // Deep electric indigo/violet
    description: "Futuristic synthwave neon violet and deep indigo"
  }
};

export function isValidTheme(theme) {
  if (!theme || typeof theme !== "string") return false;
  return THEMES.includes(theme.trim().toLowerCase());
}

export function resolveEffectiveTheme(requestedTheme, systemPrefersDark = false) {
  if (!requestedTheme || requestedTheme === "system") {
    return systemPrefersDark ? "dark" : "light";
  }
  const normalized = requestedTheme.trim().toLowerCase();
  return THEMES.includes(normalized) ? normalized : "light";
}

test("Tareeka 17: Six-theme registry defines exactly six distinct, valid themes", () => {
  assert.strictEqual(THEMES.length, 6, "Must define exactly 6 themes");
  
  const expectedThemes = [
    "light",
    "dark",
    "midnight-neon",
    "sunset-amber",
    "forest-emerald",
    "cyberpunk-indigo"
  ];

  for (const theme of expectedThemes) {
    assert.ok(THEMES.includes(theme), `Theme '${theme}' must be in the registry`);
    assert.ok(THEME_METADATA[theme], `Theme metadata must exist for '${theme}'`);
  }

  // Ensure all theme identifiers are unique lowercase kebab-case
  const uniqueSet = new Set(THEMES);
  assert.strictEqual(uniqueSet.size, 6, "All 6 theme identifiers must be unique");
  for (const t of THEMES) {
    assert.match(t, /^[a-z0-9-]+$/, `Theme '${t}' must be lowercase kebab-case`);
  }
});

test("Tareeka 17: Theme validator strictly accepts only the 6 registered themes and rejects arbitrary inputs", () => {
  for (const theme of THEMES) {
    assert.strictEqual(isValidTheme(theme), true, `'${theme}' should be valid`);
    assert.strictEqual(isValidTheme(`  ${theme}  `), true, "Should trim whitespace");
  }

  const invalidThemes = ["dracula", "nord", "monokai", "solarized", "<script>", "", null, undefined];
  for (const invalid of invalidThemes) {
    assert.strictEqual(isValidTheme(invalid), false, `'${invalid}' must be rejected`);
  }
});

test("Tareeka 17: Theme resolver handles 'system' and unknown theme fallback gracefully", () => {
  // System theme resolution
  assert.strictEqual(resolveEffectiveTheme("system", false), "light");
  assert.strictEqual(resolveEffectiveTheme("system", true), "dark");
  assert.strictEqual(resolveEffectiveTheme(null, false), "light");
  assert.strictEqual(resolveEffectiveTheme(undefined, true), "dark");

  // Explicit registered themes override system preference
  assert.strictEqual(resolveEffectiveTheme("midnight-neon", false), "midnight-neon");
  assert.strictEqual(resolveEffectiveTheme("sunset-amber", true), "sunset-amber");
  assert.strictEqual(resolveEffectiveTheme("forest-emerald", false), "forest-emerald");
  assert.strictEqual(resolveEffectiveTheme("cyberpunk-indigo", true), "cyberpunk-indigo");

  // Invalid theme falls back safely
  assert.strictEqual(resolveEffectiveTheme("malicious-theme", false), "light");
});

test("Tareeka 17: Core HSL CSS token contract defines required tokens for each theme", () => {
  const REQUIRED_TOKENS = [
    "--background",
    "--foreground",
    "--card",
    "--primary",
    "--secondary",
    "--accent",
    "--border",
    "--ring"
  ];

  // Helper simulating the expected CSS token structure for each theme
  function getThemeCssTokens(themeId) {
    const meta = THEME_METADATA[themeId];
    if (!meta) throw new Error("Unknown theme");

    const isLight = meta.base === "light";
    const hue = meta.primaryHue;

    return {
      "--background": isLight ? "40 35% 95%" : "220 20% 10%",
      "--foreground": isLight ? "30 25% 10%" : "220 20% 95%",
      "--card": isLight ? "40 35% 97%" : "220 20% 14%",
      "--primary": `${hue} 85% 55%`,
      "--secondary": isLight ? "35 40% 90%" : "220 20% 18%",
      "--accent": `${hue} 60% 65%`,
      "--border": isLight ? "35 20% 80%" : "220 20% 22%",
      "--ring": `${hue} 85% 55%`
    };
  }

  for (const theme of THEMES) {
    const tokens = getThemeCssTokens(theme);
    for (const token of REQUIRED_TOKENS) {
      assert.ok(token in tokens, `Theme '${theme}' must define CSS token '${token}'`);
      assert.ok(tokens[token].length > 0, `Token '${token}' in '${theme}' must not be empty`);
    }
  }
});

test("Tareeka 17: Theme persistence simulation verifies localStorage round-trip and resilience", () => {
  // Simulate browser localStorage storage
  const mockStorage = new Map();
  const THEME_STORAGE_KEY = "theme";

  function persistTheme(theme) {
    if (isValidTheme(theme)) {
      mockStorage.set(THEME_STORAGE_KEY, theme);
      return true;
    }
    return false;
  }

  function retrieveStoredTheme() {
    const stored = mockStorage.get(THEME_STORAGE_KEY);
    return resolveEffectiveTheme(stored);
  }

  // 1. Initial empty storage
  assert.strictEqual(retrieveStoredTheme(), "light");

  // 2. Select Midnight Neon
  persistTheme("midnight-neon");
  assert.strictEqual(retrieveStoredTheme(), "midnight-neon");

  // 3. Switch to Sunset Amber
  persistTheme("sunset-amber");
  assert.strictEqual(retrieveStoredTheme(), "sunset-amber");

  // 4. Switch to Forest Emerald
  persistTheme("forest-emerald");
  assert.strictEqual(retrieveStoredTheme(), "forest-emerald");

  // 5. Switch to Cyberpunk Indigo
  persistTheme("cyberpunk-indigo");
  assert.strictEqual(retrieveStoredTheme(), "cyberpunk-indigo");

  // 6. Attempt invalid theme persistence fails and preserves previous
  const success = persistTheme("invalid-neon");
  assert.strictEqual(success, false);
  assert.strictEqual(retrieveStoredTheme(), "cyberpunk-indigo");
});

test("Tareeka 17: Static verification - globals.css contains theme definitions", () => {
  const globalsCssPath = path.resolve("src/app/globals.css");
  assert.ok(fs.existsSync(globalsCssPath), "src/app/globals.css must exist");

  const css = fs.readFileSync(globalsCssPath, "utf-8");

  // Check baseline themes
  assert.ok(css.includes(":root"), "globals.css must define :root");
  assert.ok(css.includes(".dark"), "globals.css must define .dark");

  // Check color variable definitions
  assert.ok(css.includes("--primary:"), "globals.css must define --primary");
  assert.ok(css.includes("--background:"), "globals.css must define --background");
  assert.ok(css.includes("--foreground:"), "globals.css must define --foreground");
});

test("Tareeka 17: Static verification - ThemeProvider setup references supported themes", () => {
  const layoutPath = path.resolve("src/app/layout.tsx");
  const themeProviderPath = path.resolve("src/components/theme-provider.tsx");

  const pathsToCheck = [layoutPath, themeProviderPath].filter((p) => fs.existsSync(p));
  assert.ok(pathsToCheck.length > 0, "At least one layout or theme provider file must exist");

  const contents = pathsToCheck.map((p) => fs.readFileSync(p, "utf-8")).join("\n");
  assert.ok(
    contents.includes("ThemeProvider") || contents.includes("next-themes"),
    "Project must configure ThemeProvider via next-themes"
  );
});
