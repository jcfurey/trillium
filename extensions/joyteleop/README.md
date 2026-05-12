# JoyTeleop Foxglove extension

Packages the in-tree `JoyTeleop` panel as a baked `.foxe` extension. The
panel source lives at
`packages/studio-base/src/panels/JoyTeleop/JoyTeleopPanel.tsx`; this
workspace is a thin wrapper that registers it via the public
`ExtensionContext.registerPanel` API.

## Build

```sh
yarn workspace trillium-joyteleop-extension build
yarn workspace trillium-joyteleop-extension package
```

The first step bundles `src/index.tsx` (and its transitive deps) into
`dist/extension.js`. The second zips that plus `package.json` into
`dist/erdc-robotics.trillium-joyteleop-extension-1.0.0.foxe`.

## Where it lands at runtime

The trillium `Dockerfile` copies the built `.foxe` into
`/src/extensions/builtin/` in the served image and regenerates
`/src/extensions/builtin/index.json`.
`BuiltinExtensionLoader` (configured in
`packages/studio-web/src/WebRoot.tsx` to fetch
`/extensions/builtin/index.json`) discovers it on every page load and
auto-registers the panel with no per-user install step.

## Why it's a wrapper, not a fork of the panel

Keeping the panel source under `packages/studio-base/src/panels/JoyTeleop`
means:
- The panel can still be edited via studio-base's normal dev workflow
  (`yarn web:serve`) — see "Dev workflow" below.
- Storybook stories at `index.stories.tsx` continue to work without
  duplication.
- Future contributors don't have to choose between two copies.

The extension build inlines the panel via webpack alias
(`@foxglove/studio-base` → `packages/studio-base/src`), so there's only
ever one source-of-truth.

## Dev workflow

`yarn web:serve` does NOT load the .foxe — it serves the dev bundle
directly without going through `BuiltinExtensionLoader`. After removing
the in-tree panel registration from
`packages/studio-base/src/panels/index.ts`, you have two options for
local iteration:

1. **Build the .foxe once and serve it from `web/.webpack`.** Webpack
   dev server serves the `web/.webpack` directory, so dropping
   `dist/erdc-robotics.trillium-joyteleop-extension-1.0.0.foxe` and an
   `index.json` listing it under
   `web/.webpack/extensions/builtin/` makes the dev server expose them
   exactly the way the production caddy does.
2. **Re-register the panel temporarily in `panels/index.ts`** while
   actively editing JoyTeleop, then remove again before committing.

For most tweaks, option 2 is faster. For end-to-end testing of the
extension path, use option 1.

## Bundle size

The .foxe is large (~4 MB) because `JoyTeleopPanel` imports `Stack`,
`EmptyState`, and `ThemeProvider` from `@foxglove/studio-base`, which
in turn pull in MUI, emotion, and the theme palette. We accept the
size for now because the panel code is unchanged from its in-tree form
and the .foxe is shipped inside the trillium image (not over a
bandwidth-constrained channel). If the size becomes a problem, replace
the three studio-base helper imports with inline equivalents and
re-measure.
