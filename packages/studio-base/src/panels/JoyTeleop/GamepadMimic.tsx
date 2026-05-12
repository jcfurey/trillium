// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// Bridges the panel's GamepadSnapshot into XENONFFM/foxglove-control-extension
// SVG controller renderers (GamepadSVG → XboxController / DualSenseController
// / GenericController). Polls the latest snapshot per requestAnimationFrame
// and forces a render at ~30 Hz so the SVG redraws live without the parent
// panel having to re-render every frame.

import { useEffect, useRef, useState } from "react";
import { makeStyles } from "tss-react/mui";

import type { ControllerPresetId } from "./controllerPresets";
import { GamepadSVG } from "./GamepadSVG";
import type { GamepadState, GamepadVisualizationMode } from "./gamepadTypes";
import { attachSvgInteraction } from "./svgInteraction";
import { TriggerSliderOverlay } from "./TriggerSliderOverlay";
import type { GamepadSnapshot } from "./useGamepad";
import type { ManualInputApi } from "./useManualInput";

type Props = {
  getSnapshot: () => GamepadSnapshot | undefined;
  preset: ControllerPresetId;
  deviceName?: string;
  present: boolean;
  deadzone: number;
  manualInput: ManualInputApi;
};

// CSS variables consumed by the upstream SVGs. Set on a wrapper div so
// the var(--gp-…) references inside the SVG paths resolve to themed colors.
type GpTheme = {
  base: string;
  highlight: string;
  fillActive: string;
  fillInactive: string;
  fillPressed: string;
  outlineActive: string;
  outlineInactive: string;
  outlinePressed: string;
};

function darkTheme(): GpTheme {
  return {
    base: "#1f2937",
    highlight: "#2a3340",
    fillActive: "#3b6ea5",
    fillInactive: "#2a3340",
    fillPressed: "#e74c3c",
    outlineActive: "#9ca3af",
    outlineInactive: "#4b5563",
    outlinePressed: "#fca5a5",
  };
}

const useStyles = makeStyles()((theme) => ({
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: theme.spacing(1),
    boxSizing: "border-box",
    gap: theme.spacing(1),
    // CSS variables consumed by GamepadSVG (XENONFFM upstream).
    ...(() => {
      const t = darkTheme();
      return {
        "--gp-base": t.base,
        "--gp-highlight": t.highlight,
        "--gp-fill-active": t.fillActive,
        "--gp-fill-inactive": t.fillInactive,
        "--gp-fill-pressed": t.fillPressed,
        "--gp-outline-active": t.outlineActive,
        "--gp-outline-inactive": t.outlineInactive,
        "--gp-outline-pressed": t.outlinePressed,
      };
    })(),
    "& svg.gamepad-viz": {
      width: "100%",
      height: "auto",
      maxHeight: "100%",
      flex: "1 1 auto",
      minHeight: 0,
    },
  },
  header: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.palette.text.secondary,
    fontFamily: theme.typography.fontMonospace,
    textAlign: "center",
    userSelect: "none",
  },
  hint: {
    padding: theme.spacing(0.75, 1),
    borderRadius: theme.shape.borderRadius,
    background: theme.palette.warning.main,
    color: theme.palette.warning.contrastText,
    fontSize: theme.typography.caption.fontSize,
    textAlign: "center",
    userSelect: "none",
  },
  svgWrap: {
    flex: "1 1 auto",
    minHeight: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    // Anchor the absolutely-positioned trigger sliders to this container.
    position: "relative",
  },
}));

// Map our preset id → upstream visual mode. "auto" lets buildRenderContext
// inspect gamepad.id; we only override when the user explicitly picks a
// brand preset that should win regardless of the pad's reported id.
function visualModeForPreset(preset: ControllerPresetId): GamepadVisualizationMode {
  switch (preset) {
    case "xbox":
      return "xbox";
    case "ps5":
      return "dualsense";
    case "ps3":
    case "ps4":
      return "dualshock4";
    case "generic":
    case "custom":
    default:
      return "generic";
  }
}

export function GamepadMimic({
  getSnapshot,
  preset,
  deviceName,
  present,
  deadzone,
  manualInput,
}: Props): JSX.Element {
  const { classes } = useStyles();

  // Force a redraw at ~30 Hz from the latest snapshot. The SVGs are
  // declarative (props in → props out) so React will diff and patch.
  // 30 Hz is a fine compromise for visual smoothness without thrashing.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    let last = 0;
    const loop = (now: number) => {
      if (now - last >= 32) {
        last = now;
        setTick((t) => (t + 1) % 1_000_000);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  // After the SVG mounts, attach pointer handlers via event delegation.
  // The visual mode (xbox / dualsense / dualshock4 / generic) drives which
  // SVG component renders, so we re-bind whenever it changes.
  const svgWrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const wrap = svgWrapRef.current;
    if (!wrap) {
      return;
    }
    const svg = wrap.querySelector<SVGSVGElement>("svg.gamepad-viz");
    if (!svg) {
      return;
    }
    return attachSvgInteraction(svg, manualInput);
  }, [manualInput, preset, present]);

  const snap = getSnapshot();
  // Build a GamepadState the upstream renderer can consume. Always pass
  // a non-null value so the SVG renders idle visuals when no pad is
  // connected (rather than disappearing).
  const gamepad: GamepadState = {
    id: snap?.name ?? deviceName ?? "",
    index: 0,
    connected: present,
    mapping: "standard",
    timestamp: tick,
    vibrationSupported: false,
    buttons: snap?.buttons ? Array.from(snap.buttons) : [],
    axes: snap?.axes ? Array.from(snap.axes) : [],
  };

  const visualMode = visualModeForPreset(preset);

  return (
    <div className={classes.root}>
      <div className={classes.header}>{deviceName ?? "Gamepad"}</div>
      {!present && (
        <div className={classes.hint}>
          No gamepad detected — plug one in and press any button on it (with this
          window focused) to wake the browser Gamepad API.
        </div>
      )}
      <div ref={svgWrapRef} className={classes.svgWrap}>
        <GamepadSVG
          gamepad={gamepad}
          visualMode={visualMode}
          deadzone={{ enabled: deadzone > 0, value: deadzone }}
        />
        <TriggerSliderOverlay
          wrapRef={svgWrapRef}
          getSnapshot={getSnapshot}
          manualInput={manualInput}
          rebindKey={`${visualMode}-${present ? "1" : "0"}`}
        />
      </div>
    </div>
  );
}
