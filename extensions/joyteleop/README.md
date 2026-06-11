# JoyTeleop Foxglove extension

A self-contained Foxglove/Lichtblick panel for gamepad teleop: multi-pad
`JoystickList` wire format, sticky buttons, and rumble feedback. It builds as a
standalone `.foxe` with no dependency on the trillium source tree, so any
Foxglove-compatible host can pull it in.

## Layout

```
src/
  index.tsx            Extension entry — registers the panel via ExtensionContext
  panel/               The panel itself (JoyTeleopPanel + visualizers/controllers/hooks)
  vendored/            Stack, EmptyState, ThemeProvider — self-contained copies so the
                       panel depends only on @foxglove/extension + npm packages
```

The only Foxglove API dependency is the public `@foxglove/extension` package
(externalized at runtime alongside `react`/`react-dom`). Everything else
(MUI, emotion, tss-react, lodash-es, `@foxglove/rosmsg-msgs-common`, …) is a
declared dependency bundled into `dist/extension.js`.

## Build

```sh
npm install
npm run package
```

`package` runs a production webpack build then `foxglove-extension package`,
producing `erdcrobotics.trillium-joyteleop-extension-1.0.0.foxe` in the package
root (the publisher is normalized to alphanumerics in the file name). Use
`npm run local-install` to build and install into a local Foxglove desktop
app, or `npm run build` for a dev (unminified) bundle.

## How it ships in trillium

The trillium `Dockerfile` builds this extension in isolation (the generic
per-extension `npm install && npm run package` loop) and stages the produced
`.foxe` into the served marketplace at `extensions/joyteleop.foxe`, listed in
`extensions/registry.json`. The GitHub Pages deployment stages the same two
paths, and the `JoyTeleop Extension` GitHub workflow publishes the versioned
`.foxe` to GitHub Releases on `joyteleop-v*` tags. It is an **opt-in
marketplace extension** (installed from Settings->Extensions via its Install
button, or by dragging the `.foxe` into the app window), not a fleet-baked
builtin — the `_built` builtin sweep explicitly skips it.

## Theme note

The panel renders into its own React root (`createRoot(context.panelElement)`),
which does not inherit the host's MUI theme context. `vendored/ThemeProvider`
supplies a self-contained MUI dark/light theme (plus the `typography.fontMonospace`
token the panel uses) so styling and dark-mode switching work standalone.
