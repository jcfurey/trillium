// Copied verbatim from XENONFFM/foxglove-control-extension v1.0.0-beta.6
//   src/components/Gamepad/types.ts
// Distributed under the MIT License — original copyright:
//   Copyright (c) 2024 Joshua Newans
//   Copyright (c) 2022 Ryan Govostes
// Incorporated into this MPL-2.0 panel; the upstream MIT terms continue
// to apply to this file's content.

export interface GamepadState {
  id: string;
  index: number;
  connected: boolean;
  mapping: string;
  timestamp: number;
  vibrationSupported: boolean;
  buttons: number[];
  axes: number[];
}

export type GamepadVisualType = "generic" | "xbox" | "dualsense";
export type GamepadVisualizationMode = "auto" | GamepadVisualType;

export type RenderContext = {
  buttons: number[];
  axes: number[];
  getButtonColor: (elementId: string) => string;
  getButtonFill: (elementId: string) => string;
  idleOutline: string;
  idleFill: string;
  lstickAxisX: number;
  lstickAxisY: number;
  lstickMagnitude: number;
  rstickAxisX: number;
  rstickAxisY: number;
  rstickMagnitude: number;
  lPressed: number;
  rPressed: number;
  triggerL2: number;
  triggerR2: number;
};

export interface ControllerDeadzoneSettings {
  enabled?: boolean;
  value?: number;
}

export interface ControllerRendererProps {
  ctx: RenderContext;
}
