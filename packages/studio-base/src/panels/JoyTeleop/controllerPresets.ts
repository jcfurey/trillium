// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// Controller layout presets. The browser Gamepad API normalizes vendor pads
// to its "Standard Gamepad" mapping when possible, but Linux/xpad pads, PS3
// quirks, and generic HOTAS sticks all expose different axis/button counts
// and orderings. Presets define the *display* labels for the visualizer
// and the *publish* widths for sensor_msgs/Joy.axes / .buttons.
//
// Note: this panel publishes RAW Joy. The robot's teleop_twist_joy + joy.yaml
// layer is what maps "axis 1 = forward". Don't try to remap here — that
// would diverge from the teleop-docker contract the robot expects.

export type ControllerPresetId = "xbox" | "ps5" | "ps4" | "ps3" | "generic" | "custom";

export type ControllerPreset = {
  id: ControllerPresetId;
  label: string;
  axes: number;
  buttons: number;
  axisLabels: readonly string[];
  buttonLabels: readonly string[];
};

// All presets below match the W3C "Standard Gamepad" mapping that the
// browser Gamepad API exposes when Gamepad.mapping === "standard":
//   4 axes (LX, LY, RX, RY) + 17 buttons.
// Labels differ per brand; index meaning is identical.

const STANDARD_AXIS_LABELS = ["LX", "LY", "RX", "RY"] as const;

// Xbox / XInput
const XBOX: ControllerPreset = {
  id: "xbox",
  label: "Xbox / XInput",
  axes: 4,
  buttons: 17,
  axisLabels: [...STANDARD_AXIS_LABELS],
  buttonLabels: [
    "A",
    "B",
    "X",
    "Y",
    "LB",
    "RB",
    "LT",
    "RT",
    "Back",
    "Start",
    "LStick",
    "RStick",
    "D-Up",
    "D-Down",
    "D-Left",
    "D-Right",
    "Logo",
  ],
};

// DualShock 4
const PS4: ControllerPreset = {
  id: "ps4",
  label: "PlayStation 4 (DualShock)",
  axes: 4,
  buttons: 17,
  axisLabels: [...STANDARD_AXIS_LABELS],
  buttonLabels: [
    "Cross",
    "Circle",
    "Square",
    "Triangle",
    "L1",
    "R1",
    "L2",
    "R2",
    "Share",
    "Options",
    "LStick",
    "RStick",
    "D-Up",
    "D-Down",
    "D-Left",
    "D-Right",
    "PS",
  ],
};

// DualSense (PS5). Same standard W3C mapping as DS4 — only the visual
// is different. Mute is exposed on a separate (vendor-specific) index in
// some browsers; we don't claim a slot here to stay W3C-standard.
const PS5: ControllerPreset = {
  id: "ps5",
  label: "PlayStation 5 (DualSense)",
  axes: 4,
  buttons: 17,
  axisLabels: [...STANDARD_AXIS_LABELS],
  buttonLabels: [
    "Cross",
    "Circle",
    "Square",
    "Triangle",
    "L1",
    "R1",
    "L2",
    "R2",
    "Create",
    "Options",
    "LStick",
    "RStick",
    "D-Up",
    "D-Down",
    "D-Left",
    "D-Right",
    "PS",
  ],
};

// DualShock 3
const PS3: ControllerPreset = {
  id: "ps3",
  label: "PlayStation 3",
  axes: 4,
  buttons: 17,
  axisLabels: [...STANDARD_AXIS_LABELS],
  buttonLabels: [
    "Cross",
    "Circle",
    "Square",
    "Triangle",
    "L1",
    "R1",
    "L2",
    "R2",
    "Select",
    "Start",
    "LStick",
    "RStick",
    "D-Up",
    "D-Down",
    "D-Left",
    "D-Right",
    "PS",
  ],
};

// Generic standard gamepad — neutral labels.
const GENERIC: ControllerPreset = {
  id: "generic",
  label: "Generic / Standard",
  axes: 4,
  buttons: 17,
  axisLabels: [...STANDARD_AXIS_LABELS],
  buttonLabels: [
    "B0",
    "B1",
    "B2",
    "B3",
    "L1",
    "R1",
    "L2",
    "R2",
    "Sel",
    "Start",
    "LStick",
    "RStick",
    "D-Up",
    "D-Down",
    "D-Left",
    "D-Right",
    "Home",
  ],
};

// Custom: user supplies their own axis/button counts + labels in settings.
const CUSTOM: ControllerPreset = {
  id: "custom",
  label: "Custom",
  axes: 4,
  buttons: 17,
  axisLabels: ["A0", "A1", "A2", "A3"],
  buttonLabels: [
    "B0",
    "B1",
    "B2",
    "B3",
    "B4",
    "B5",
    "B6",
    "B7",
    "B8",
    "B9",
    "B10",
    "B11",
    "B12",
    "B13",
    "B14",
    "B15",
    "B16",
  ],
};

export const CONTROLLER_PRESETS: Record<ControllerPresetId, ControllerPreset> = {
  xbox: XBOX,
  ps5: PS5,
  ps4: PS4,
  ps3: PS3,
  generic: GENERIC,
  custom: CUSTOM,
};

export const PRESET_OPTIONS = Object.values(CONTROLLER_PRESETS).map((p) => ({
  label: p.label,
  value: p.id,
}));

export function presetLabelsFor(
  presetId: ControllerPresetId,
  axesCount: number,
  buttonsCount: number,
): { axisLabels: string[]; buttonLabels: string[] } {
  const preset = CONTROLLER_PRESETS[presetId];
  const axisLabels = new Array(axesCount).fill("").map((_, i) => preset.axisLabels[i] ?? `A${i}`);
  const buttonLabels = new Array(buttonsCount)
    .fill("")
    .map((_, i) => preset.buttonLabels[i] ?? `B${i}`);
  return { axisLabels, buttonLabels };
}

// Identity index map of length N: [0, 1, ..., N-1]. Used as the default
// axisMap/buttonMap so a fresh config publishes raw physical indices
// straight through (no remap until the user changes it).
export function identityMap(length: number): number[] {
  return new Array(length).fill(0).map((_, i) => i);
}
