// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// Copied verbatim from XENONFFM/foxglove-control-extension v1.0.0-beta.6
//   src/components/Gamepad/types.ts
// Distributed under the MIT License — original copyright:
//   Copyright (c) 2024 Joshua Newans
//   Copyright (c) 2022 Ryan Govostes
// The upstream MIT terms continue to apply to this file's content.

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

export type GamepadVisualType = "generic" | "xbox" | "dualsense" | "dualshock4";
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
