// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// Copied from XENONFFM/foxglove-control-extension v1.0.0-beta.6 (MIT).
//   Copyright (c) 2024 Joshua Newans
//   Copyright (c) 2022 Ryan Govostes
// Incorporated into this MPL-2.0 panel; the upstream MIT terms continue
// to apply to this file's content.

import {
  ControllerDeadzoneSettings,
  GamepadState,
  GamepadVisualType,
  RenderContext,
} from "./gamepadTypes";

const DEFAULT_DEADZONE = 0.08;

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent));
}

function pressFillMix(percent: number, baseFill: string, pressedFill: string): string {
  return `color-mix(in oklab, ${pressedFill} ${clampPercent(percent)}%, ${baseFill})`;
}

function pressOutlineMix(percent: number, baseOutline: string, pressedOutline: string): string {
  return `color-mix(in oklab, ${pressedOutline} ${clampPercent(percent)}%, ${baseOutline})`;
}

// Shared gamepad style helpers so colors are configured via CSS vars in globals.css.
export function getGamepadPressFill(
  intensity: number,
  maxPercent = 30,
  baseFill = "var(--gp-fill-active)",
  pressedFill = "var(--gp-fill-pressed)",
): string {
  const clamped = Math.min(1, Math.max(0, intensity));
  return pressFillMix(clamped * maxPercent, baseFill, pressedFill);
}

export function getGamepadPressOutline(
  intensity: number,
  baseOutline = "var(--gp-outline-active)",
  pressedOutline = "var(--gp-outline-pressed)",
): string {
  const clamped = Math.min(1, Math.max(0, intensity));
  if (clamped <= 0.01) {
    return baseOutline;
  }
  return pressOutlineMix(clamped * 100, baseOutline, pressedOutline);
}

const BUTTON_TO_INDEX_MAP: Record<string, number> = {
  cross: 0,
  circle: 1,
  square: 2,
  triangle: 3,
  l1: 4,
  r1: 5,
  l2: 6,
  r2: 7,
  create: 8,
  options: 9,
  up: 12,
  down: 13,
  left: 14,
  right: 15,

  ps: 16,
  trackpad: 17,

  // xbox
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  view: 8,
  share: 8,
  menu: 9,
  xbox: 16,
};

export function detectGamepadVisualType(
  gamepadId: string | undefined,
  preferredType?: "xbox" | "dualsense" | "dualshock4",
): GamepadVisualType {
  const id = (gamepadId ?? "").toLowerCase();

  // PS5 (DualSense) — checked first because some browsers report "wireless
  // controller" + "sony" without an explicit ds5/ds4 marker; if both are
  // present, prefer the newer renderer.
  if (id.includes("dualsense") || id.includes("playstation(r)5") || id.includes("ps5")) {
    return "dualsense";
  }

  if (id.includes("dualshock") || id.includes("playstation(r)4") || id.includes("ps4")) {
    return "dualshock4";
  }

  if (id.includes("xbox") || id.includes("xinput") || id.includes("microsoft")) {
    return "xbox";
  }

  if (id.includes("wireless controller") && preferredType != undefined) {
    return preferredType;
  }

  return "generic";
}

export function setGroupFill(svg: SVGSVGElement, id: string, fill: string): void {
  const roots = svg.querySelectorAll<SVGElement>(`#${id}`);
  roots.forEach((root) => {
    root.setAttribute("fill", fill);
    root.querySelectorAll<SVGElement>("path,circle,rect,polygon,ellipse").forEach((node) => {
      node.setAttribute("fill", fill);
    });
  });
}

export function setGroupStroke(svg: SVGSVGElement, id: string, stroke: string): void {
  const roots = svg.querySelectorAll<SVGElement>(`#${id}`);
  roots.forEach((root) => {
    root.setAttribute("stroke", stroke);
    root.querySelectorAll<SVGElement>("path,circle,rect,polygon,ellipse").forEach((node) => {
      node.setAttribute("stroke", stroke);
    });
  });
}

export function setLayerVisual(
  svg: SVGSVGElement,
  infillId: string,
  outlineId: string,
  fill: string,
  outlineHighlight: string,
): void {
  setGroupFill(svg, infillId, fill);
  setGroupFill(svg, outlineId, outlineHighlight);
  setGroupStroke(svg, infillId, "none");
  setGroupStroke(svg, outlineId, "none");
}

export function applyButtonLayers(
  svg: SVGSVGElement,
  ctx: RenderContext,
  buttonId: string,
  ids: string[],
): void {
  const fill = ctx.getButtonFill(buttonId);
  const outlineHighlight = ctx.getButtonColor(buttonId);
  const infillId = ids.find((id) => id.toLowerCase().includes("infill"));
  const outlineId = ids.find((id) => id.toLowerCase().includes("outline"));

  if (infillId != undefined && outlineId != undefined) {
    setLayerVisual(svg, infillId, outlineId, fill, outlineHighlight);
  }
}

export function getButtonValue(buttons: number[], index: number): number {
  const value = buttons[index];
  return typeof value === "number" ? value : 0;
}

export function getStickMotionStroke(
  magnitude: number,
  baseOutline = "var(--gp-outline-active)",
): string {
  return getGamepadPressOutline(magnitude, baseOutline);
}

export function getStickPressFill(pressed: number, baseFill = "var(--gp-fill-active)"): string {
  const clamped = Math.min(1, Math.max(0, pressed));
  return getGamepadPressFill(clamped, 100, baseFill);
}

export function getStickPressStroke(
  pressed: number,
  baseOutline = "var(--gp-outline-active)",
): string {
  return getGamepadPressOutline(pressed, baseOutline);
}

export function ensurePressDot(
  group: SVGGElement,
  id: string,
  cx: string,
  cy: string,
  radius: string,
): SVGCircleElement {
  let dot = group.querySelector<SVGCircleElement>(`#${id}`);
  if (dot == undefined) {
    dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("id", id);
    dot.setAttribute("cx", cx);
    dot.setAttribute("cy", cy);
    dot.setAttribute("r", radius);
    group.appendChild(dot);
  }
  return dot;
}

function clampAxis(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function clampDeadzone(value: number): number {
  return Math.max(0, Math.min(0.99, value));
}

// eslint-disable-next-line @foxglove/no-boolean-parameters
function applyAxisDeadzone(value: number, enabled: boolean, deadzone: number): number {
  const clamped = clampAxis(value);
  if (!enabled || deadzone <= 0) {
    return clamped;
  }

  const magnitude = Math.abs(clamped);
  if (magnitude <= deadzone) {
    return 0;
  }

  const normalized = (magnitude - deadzone) / (1 - deadzone);
  return Math.sign(clamped) * Math.min(1, normalized);
}

export function buildRenderContext(
  gamepad: GamepadState | ReactNull,
  deadzone?: ControllerDeadzoneSettings,
): RenderContext {
  const buttons = gamepad?.buttons ?? [];
  const axes = gamepad?.axes ?? [];
  const deadzoneEnabled = deadzone?.enabled ?? true;
  const deadzoneValue = clampDeadzone(deadzone?.value ?? DEFAULT_DEADZONE);
  const isGamepadActive = gamepad?.connected === true;
  const idleOutline = isGamepadActive ? "var(--gp-outline-active)" : "var(--gp-outline-inactive)";
  const idleFill = isGamepadActive ? "var(--gp-fill-active)" : "var(--gp-fill-inactive)";

  const getButtonColor = (elementId: string): string => {
    const buttonIndex = BUTTON_TO_INDEX_MAP[elementId];
    if (buttonIndex != undefined && buttons[buttonIndex] != undefined) {
      const value = buttons[buttonIndex] as number | undefined;
      if (value != undefined) {
        return getGamepadPressOutline(value, idleOutline);
      }
    }
    return idleOutline;
  };

  const getButtonFill = (elementId: string): string => {
    const buttonIndex = BUTTON_TO_INDEX_MAP[elementId];
    if (buttonIndex != undefined && buttons[buttonIndex] != undefined) {
      const value = buttons[buttonIndex] as number | undefined;
      if (value != undefined) {
        return getGamepadPressFill(value, 100, idleFill, "var(--gp-fill-pressed)");
      }
    }
    return idleFill;
  };

  const lstickAxisX = applyAxisDeadzone(axes[0] ?? 0, deadzoneEnabled, deadzoneValue);
  const lstickAxisY = applyAxisDeadzone(axes[1] ?? 0, deadzoneEnabled, deadzoneValue);
  const lstickMagnitude = Math.sqrt(lstickAxisX * lstickAxisX + lstickAxisY * lstickAxisY);

  const rstickAxisX = applyAxisDeadzone(axes[2] ?? 0, deadzoneEnabled, deadzoneValue);
  const rstickAxisY = applyAxisDeadzone(axes[3] ?? 0, deadzoneEnabled, deadzoneValue);
  const rstickMagnitude = Math.sqrt(rstickAxisX * rstickAxisX + rstickAxisY * rstickAxisY);

  const lPressed = buttons[10]?.valueOf() ?? 0;
  const rPressed = buttons[11]?.valueOf() ?? 0;

  const triggerL2 = buttons[6] ?? 0;
  const triggerR2 = buttons[7] ?? 0;

  return {
    buttons,
    axes,
    getButtonColor,
    getButtonFill,
    idleOutline,
    idleFill,
    lstickAxisX,
    lstickAxisY,
    lstickMagnitude,
    rstickAxisX,
    rstickAxisY,
    rstickMagnitude,
    lPressed,
    rPressed,
    triggerL2,
    triggerR2,
  };
}
