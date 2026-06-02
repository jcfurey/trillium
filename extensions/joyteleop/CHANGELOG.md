# Changelog

## 1.0.0

- Self-contained standalone extension: panel source and a vendored
  Stack/EmptyState/ThemeProvider live under `src/`, depending only on
  `@foxglove/extension` plus bundled npm packages (MUI/emotion/tss-react).
  Builds in isolation with `npm install && npm run package`.
- Gamepad teleop with multi-pad `JoystickList` wire format, sticky buttons, and
  rumble feedback.
