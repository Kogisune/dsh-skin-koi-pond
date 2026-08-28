# dsh-skin-koi-pond · Koi Pond

> A DeepSeek Harness (DSH) WebUI theme — ink-teal water, red-dotted koi.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](#contributing)

A DeepSeek Harness WebUI theme inspired by a **koi pond**. Ink-teal water as the base, ripple textures as the pattern, koi orange-red as the accent, with gold-scale and lotus-green supporting hues. A light "Rice-Paper Day" and a dark "Pond Night" theme are both included.

The theme follows the `skin.json` declaration + component-split CSS (7 components) convention and is a **pure presentation layer**: it only overrides DSH's official design tokens (`--dsw-alias-*`) and component styles. It injects no services, emits no Cordis events, and never touches model requests. Install and it just works.

[中文文档](README.md) 🌐

---

## ✨ Features

- 🐟 **Canvas koi pond animation**: vanilla Canvas 2D fish school (flocking — cohesion / alignment / separation + mouse-flee behavior), lotus leaves with Perlin edges and notches, water ripples that spread on click; no p5 dependency, auto-degrades to a static render under `prefers-reduced-motion`, and pauses when the tab is hidden
- 🎨 **Light & dark themes**: dark "Pond Night" (ink-teal water + moonlight white + koi orange-red `#f26a3c`) / light "Rice-Paper Day" (rice-paper beige + ink + vermilion `#d9562f`)
- 🪟 **Backdrop scrim**: 15% white + 3px blur to soften the animation and emphasize the foreground UI
- 🧩 **Component-based theme**: split into 7 components (`background` / `sidebar` / `titlebar` / `composer` / `overlay` / `fonts` / `ui`) for a clear, maintainable structure
- 🌊 **Accent palette**: gold scale `#d9a441` / lotus leaf `#3fae7a` / water-blue `#4fb8c9`
- 🎮 **Live recoloring**: `window.__koiSetScheme('ogon')` in the browser console (9 koi presets + a random easter egg), without rebuilding the fish school

---

## 🖼 Preview

<p align="center">
  <img src="preview/dark.png" alt="Pond Night (dark)" width="49%"/>
  <img src="preview/light.png" alt="Rice-Paper Day (light)" width="49%"/>
</p>

<p align="center">Dark "Pond Night" · Light "Rice-Paper Day"</p>

---

## 📦 Installation

Install as a DSH plugin (direct bundle load):

```bash
dsh plugin --profile web add github:Kogisune/dsh-skin-koi-pond
# Restart dsh web to apply; uninstall to revert.
```

---

## 🎨 Customization

The theme exposes `window.__koiSetScheme(id)` in the browser for live koi recolor — **the fish school is not rebuilt**:

```js
__koiSetScheme('ogon')     // Gold
__koiSetScheme('tancho')   // Tancho
__koiSetScheme('random')   // Random easter egg (includes low-probability hidden colors)
```

Built-in presets:

| id | name | body color | fin/belly color |
| --- | --- | --- | --- |
| `kohaku` | Red & White | `#ffffff` | `#e23b2e` |
| `sanke` | Sanke (Tricolor) | `#ffffff` | `#141414` |
| `showa` | Showa (Tricolor) | `#141414` | `#e23b2e` |
| `ogon` | Gold | `#f4c430` | `#d99a00` |
| `tancho` | Tancho | `#ffffff` | `#ff3b30` |
| `asagi` | Asagi | `#3b6fb5` | `#e23b2e` |
| `utsuri` | Hi-utsuri | `#f1541b` | `#141414` |
| `panda` | Panda (B/W) | `#141414` | `#ffffff` |
| `momiji` | Maple | `#f1541b` | `#ffffff` |
| `random` | Random easter egg | random at runtime | random at runtime |

---

## 🧩 Theme structure

`skin.json` declaration:

```jsonc
{
  "id": "koi-pond",
  "name": "Koi Pond",
  "theme": {
    "kind": "full",            // full skin (mutually exclusive with other full skins)
    "family": "koi",           // family: themes in the same family are mutually exclusive
    "components": { /* all 7 components */ }
  },
  "css": {
    "*": ["css/base.css"],          // shared base (design tokens)
    "background": ["css/background.css"],
    "sidebar": ["css/sidebar.css"],
    "titlebar": ["css/titlebar.css"],
    "composer": ["css/composer.css"],
    "overlay": ["css/overlay.css"],
    "fonts": ["css/fonts.css"],
    "ui": ["css/ui.css"]
  }
}
```

- Component-split CSS → each component is declared independently under the `css` field of `skin.json`, for a clear structure
- `theme.family: koi` → mutually exclusive with same-family themes, so it never clashes with other skin families
- `z-index` is unified through the `--koi-z-*` variables to avoid overlay collisions

---

## 🛠 Development

```bash
node scripts/build.mjs        # build: css/ + koi modules → self-contained lib/client.js bundle (CSS inlined)
node scripts/validate.mjs     # structural validation (skin.json / css files / component consistency)
pnpm test                     # same as validate
```

> ⚠️ After editing `css/` or `plugin/`, you must re-run `node scripts/build.mjs` for the changes to take effect in DSH (DSH loads the `lib/` build artifact).

---

## 📁 Project structure

```
css/            # component-split theme CSS
plugin/         # plugin source (index.js host entry / client.js client injection / koi/ animation engine)
scripts/        # build / validate
lib/            # build artifacts (committed, ready to use after clone)
```

---

## 🙏 Acknowledgements

- The koi pond animation engine (`plugin/koi/`) is ported from [carps.top](https://www.carps.top) (MIT, an AstroPaper derivative), originally a koi-pond Canvas animation for a blog background.

---

## 🤝 Contributing

Issues and PRs are welcome. Please run `node scripts/validate.mjs` before submitting to ensure structural and component consistency passes.

---

## 📄 License

[MIT](LICENSE) © [Kogisune](https://github.com/Kogisune)
