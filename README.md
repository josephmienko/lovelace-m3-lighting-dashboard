<h1><a href="https://josephmienko.github.io/lovelace-m3-lighting-dashboard/">lovelace-m3-lighting-dashboard</a></h1>
<picture align="center">
  <!-- Desktop Dark Mode -->
  <source media="(min-width: 769px) and (prefers-color-scheme: dark)" srcset="assets/header-wide-dark-inline.svg">
  <!-- Desktop Light Mode -->
  <source media="(min-width: 769px) and (prefers-color-scheme: light)" srcset="assets/header-wide-light-inline.svg">
  <!-- Mobile Dark Mode -->
  <source media="(max-width: 768px) and (prefers-color-scheme: dark)" srcset="assets/header-stacked-dark-inline.svg">
  <!-- Mobile Light Mode -->
  <source media="(max-width: 768px) and (prefers-color-scheme: light)" srcset="assets/header-stacked-light-inline.svg">
  <img src="assets/header-wide-light-inline.svg" alt="lovelace-m3-lighting-dashboard">
</picture>
<b align="left" class="cs-repo-meta">
  <span class="cs-repo-subtitle">Part of the Crooked Sentry universe</span>
  <span class="cs-repo-meta-separator" aria-hidden="true">|</span>
  <span class="cs-repo-badges">
    <a href="https://github.com/josephmienko/lovelace-m3-lighting-dashboard/actions/workflows/validate.yml"><img src="https://github.com/josephmienko/lovelace-m3-lighting-dashboard/actions/workflows/validate.yml/badge.svg" alt="Validate" align="absmiddle" /></a>
    <a href="https://app.codecov.io/gh/josephmienko/lovelace-m3-lighting-dashboard"><img src="https://codecov.io/gh/josephmienko/lovelace-m3-lighting-dashboard/badge.svg" alt="Codecov test coverage" align="absmiddle" /></a>
  </span>
</b>

## Overview

`lovelace-m3-lighting-dashboard` is the recommended extraction target for the lighting dashboard card that currently lives in this repo.

This repo ships one HACS dashboard/plugin artifact: `dist/lovelace-m3-lighting-dashboard.js`.

## Dependency On Core Cards

This repo is intended to depend on `lovelace-m3-core-cards`.

That dependency is explicit in the public contract:

- users install `lovelace-m3-core-cards` first
- the dashboard card expects `custom:m3-slider` to be available at runtime
- the README and examples document the dependency

HACS does not manage plugin-to-plugin dependencies for you, so the dependency has to be documented and enforced at runtime by the card itself.

## Repo Layout

```text
lovelace-m3-lighting-dashboard/
  .github/
    workflows/
      validate.yml
  dist/
    lovelace-m3-lighting-dashboard.js
  examples/
    dashboard-lights-snippet.yaml
  scripts/
    build_plugin.mjs
  screenshots/
  src/
    m3-lighting-dashboard.js
  tests/
    validate-dist.mjs
  .gitignore
  README.md
  hacs.json
  package.json
```

## Included Card

- `custom:m3-lighting-dashboard`

## Installation

### Step 1: Install Core Dependency

Install `lovelace-m3-core-cards` first and make sure its resource is loaded:

```text
/hacsfiles/lovelace-m3-core-cards/lovelace-m3-core-cards.js
```

### Step 2: Install This Dashboard Card

Install `lovelace-m3-lighting-dashboard` and make sure its resource is loaded:

```text
/hacsfiles/lovelace-m3-lighting-dashboard/lovelace-m3-lighting-dashboard.js
```

### Step 3: Use The Card

```yaml
type: custom:m3-lighting-dashboard
title: Lighting
subtitle: Upstairs + downstairs
areas:
  - title: Kitchen
    icon: mdi:chef-hat
    expanded: true
    entities:
      - entity: light.kitchen
        name: Kitchen Lights
        icon: mdi:lightbulb
      - entity: switch.kitchen_cabinets
        name: Cabinet Lights
        icon: mdi:light-strip
  - title: Bedroom
    icon: mdi:bed
    entities:
      - entity: light.bedroom
        name: Bedroom Lamp
        icon: mdi:lamp
```

## Manual Install

1. Copy `dist/lovelace-m3-lighting-dashboard.js` into your Home Assistant `www/` directory.
2. Add it as a Lovelace module resource:

   ```text
   /local/lovelace-m3-lighting-dashboard.js
   ```

3. Ensure `lovelace-m3-core-cards` is also installed and loaded first.
4. Use the card in Lovelace.

## Maintainer Workflow

1. Edit `src/m3-lighting-dashboard.js`.
2. Rebuild the install artifact:

   ```bash
   npm run build
   ```

3. Run validation:

   ```bash
   npm run check
   npm test
   ```

4. Commit both the source file and the generated `dist/lovelace-m3-lighting-dashboard.js`.

The CI workflow fails if the built artifact is out of date.

## Packaging Rules

- `dist/` contains only installable runtime artifacts.
- `examples/` contains copy/paste Lovelace snippets only.
- `screenshots/` is for README assets only.
- Public examples should avoid private icon dependencies. Use stock `mdi:` icons unless the icon pack is explicitly part of the public install story.
- If this repo ever becomes hard to operate with an external dependency, bundle the needed core primitives into the artifact instead of creating more documented dependency steps.

## Recommended Public Rename

Recommended public rename for the extracted card:

- `crooked-sentry-m3-lighting-dashboard` -> `m3-lighting-dashboard`

That applies to:

- the custom element tag
- `window.customCards` type name
- examples
- README docs

## Extraction Mapping

Current source file in this monorepo maps to the extracted repo like this:

- `homeassistant/www/community/crooked-sentry-m3-lighting-dashboard/crooked-sentry-m3-lighting-dashboard.js` -> `src/m3-lighting-dashboard.js`

The current implementation already embeds slider instances and is a good fit for a separate repo that consumes `lovelace-m3-core-cards`.

## Notes

- This template now carries the current extracted implementation with the public `m3-lighting-dashboard` tag already applied.
- The card renders an explicit dependency error if `lovelace-m3-core-cards` has not been loaded yet.
- Public defaults and examples use `mdi:` icons, but the implementation still tolerates external `m3*` icon names if users already have those icon sets registered.
- The dependency on `lovelace-m3-core-cards` should remain explicit unless you later decide to bundle the slider implementation.
