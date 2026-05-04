// Copied from XENONFFM/foxglove-control-extension v1.0.0-beta.6 (MIT).
//   Copyright (c) 2024 Joshua Newans
//   Copyright (c) 2022 Ryan Govostes
// Incorporated into this MPL-2.0 panel; the upstream MIT terms continue
// to apply to this file's content.

import type * as React from "react";

import {
  DualSenseController,
  DualShock4Controller,
  GenericController,
  XboxController,
} from "./controllers";
import { buildRenderContext, detectGamepadVisualType } from "./renderContext";
import { ControllerDeadzoneSettings, GamepadState, GamepadVisualizationMode } from "./gamepadTypes";

export function GamepadSVG({
  gamepad,
  visualMode = "auto",
  preferredVisualType,
  deadzone,
}: {
  gamepad: GamepadState | null;
  visualMode?: GamepadVisualizationMode;
  preferredVisualType?: "xbox" | "dualsense" | "dualshock4";
  deadzone?: ControllerDeadzoneSettings;
}): React.ReactElement {
  const visualType =
    visualMode === "auto" ? detectGamepadVisualType(gamepad?.id, preferredVisualType) : visualMode;
  const ctx = buildRenderContext(gamepad, deadzone);

  if (visualType === "dualsense") {
    return <DualSenseController ctx={ctx} />;
  }

  if (visualType === "dualshock4") {
    return <DualShock4Controller ctx={ctx} />;
  }

  if (visualType === "xbox") {
    return <XboxController ctx={ctx} />;
  }

  return <GenericController ctx={ctx} />;
}
