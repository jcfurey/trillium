// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// PlayStation 4 DualShock visual. The body silhouette is close enough to
// the DualSense (PS5) renderer that we reuse it as a base, then layer
// DS4-specific styling on top:
//   1. Hide the dedicated Mute button (PS5-only — DS4 has no such button)
//   2. Color the four face buttons in their classic DS4 palette
//      (cross=blue, circle=red, square=pink, triangle=green) so the
//      visual is unmistakably DS4 even though the silhouette is shared.
// The published Joy is unchanged — visuals only.

import { useId } from "react";
import type * as React from "react";

import { ControllerRendererProps } from "../gamepadTypes";

import { DualSenseController } from "./DualSenseController";

// Classic DualShock 4 face-button palette. Used as the *idle* fill via
// CSS variable scoping; the existing press-color blend in renderContext
// (var(--gp-fill-pressed) overlaid on var(--gp-fill-active)) still
// applies, so the buttons brighten correctly when held.
const DS4_PALETTE = {
  cross: "#1565c0", // blue
  circle: "#c62828", // red
  square: "#ad1457", // pink
  triangle: "#2e7d32", // green
} as const;

export function DualShock4Controller({ ctx }: ControllerRendererProps): React.ReactElement {
  // useId guarantees the scoped CSS only applies to this instance, so
  // multiple JoyTeleop panels (or a DS4 + DS5 panel side-by-side) don't
  // bleed colors into each other.
  const wrapId = `ds4-wrap-${useId().replace(/:/g, "")}`;
  return (
    <div id={wrapId} style={{ width: "100%", height: "100%", display: "contents" }}>
      <style>{`
        #${wrapId} svg.gamepad-viz [id="Mute"] { display: none; }
        #${wrapId} svg.gamepad-viz [id="Cross"] { --gp-fill-active: ${DS4_PALETTE.cross}; }
        #${wrapId} svg.gamepad-viz [id="Circle"] { --gp-fill-active: ${DS4_PALETTE.circle}; }
        #${wrapId} svg.gamepad-viz [id="Square"] { --gp-fill-active: ${DS4_PALETTE.square}; }
        #${wrapId} svg.gamepad-viz [id="Triangle"] { --gp-fill-active: ${DS4_PALETTE.triangle}; }
      `}</style>
      <DualSenseController ctx={ctx} />
    </div>
  );
}
