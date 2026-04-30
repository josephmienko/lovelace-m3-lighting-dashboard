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

M3 lighting control dashboard composed with M3 core card primitives. Requires `lovelace-m3-core-cards` installed first for shared slider/button components.

## Configuration

### Installation Instructions

#### Step 1: Install Core Dependency

Install `lovelace-m3-core-cards` first and ensure its resource is loaded:

```text
/hacsfiles/lovelace-m3-core-cards/lovelace-m3-core-cards.js
```

#### Step 2: Install Dashboard Card

For HACS:

1. Add the repository to HACS as a `Dashboard`.
2. Install `M3 Lighting Dashboard`.
3. Add the resource if HACS does not do it automatically:

   ```text
   /hacsfiles/lovelace-m3-lighting-dashboard/lovelace-m3-lighting-dashboard.js
   ```

For manual install:

1. Copy `dist/lovelace-m3-lighting-dashboard.js` into your Home Assistant `www/` directory.
2. Add it as a Lovelace module resource:

   ```text
   /local/lovelace-m3-lighting-dashboard.js
   ```

Ensure `lovelace-m3-core-cards` is also installed and loaded first.

#### Step 3: Use The Card

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

### Maintainer Workflow

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

### Design Notes

- The dashboard expects `custom:m3-slider` to be available at runtime
- If core cards are not loaded, the card renders an explicit dependency error
- HACS does not manage card-to-card dependencies, so documentation and runtime enforcement are both needed
- Public examples and defaults use `mdi:` icons
