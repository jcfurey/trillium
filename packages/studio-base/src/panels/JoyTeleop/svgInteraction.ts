// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// Wires pointer events on a controller SVG to the manual-input override
// store, so a user can drive sticks (drag) and buttons (click) without a
// physical gamepad — even when one is plugged in. Uses event delegation:
// we attach exactly one pointerdown listener at the SVG root and walk up
// from event.target to find an element whose id matches a known stick or
// button (case-insensitive). This means the controller renderer files
// don't need to know anything about interactivity — adding a new SVG
// just needs IDs that match the maps below.

import type { ManualInputApi } from "./useManualInput";

// Maps SVG element id (lowercased) → button index in the published Joy.
// Covers ids used across DualSenseController / XboxController /
// GenericController. Multiple ids can resolve to the same index because
// each face button has nested infill/outline elements (e.g. "Cross",
// "Cross_infill", "Cross_outline" all → 0).
const SVG_BUTTON_INDEX: Record<string, number> = {
  // PlayStation face
  cross: 0,
  cross_infill: 0,
  cross_outline: 0,
  circle: 1,
  circle_infill: 1,
  circle_outline: 1,
  square: 2,
  square_infill: 2,
  square_outline: 2,
  triangle: 3,
  triangle_infill: 3,
  triangle_outline: 3,
  // Xbox face
  a: 0,
  b: 1,
  x: 2,
  y: 3,
  // Generic neutral face (top/right/bottom/left → W3C standard 3/1/0/2)
  "b-up": 3,
  "b-right": 1,
  "b-down": 0,
  "b-left": 2,
  // Bumpers / triggers
  l1: 4,
  l1_infill: 4,
  l1_outline: 4,
  r1: 5,
  r1_infill: 5,
  r1_outline: 5,
  l2: 6,
  l2_infill: 6,
  l2_outline: 6,
  r2: 7,
  r2_infill: 7,
  r2_outline: 7,
  // Center cluster — share/menu (Xbox), create/options (DualSense)
  view: 8,
  share: 8,
  create: 8,
  create_infill: 8,
  create_outline: 8,
  menu: 9,
  options: 9,
  options_infill: 9,
  options_outline: 9,
  // Generic meta circles
  "l-meta-circle": 8,
  "r-meta-circle": 9,
  // D-pad
  up: 12,
  up_infill: 12,
  up_outline: 12,
  down: 13,
  down_infill: 13,
  down_outline: 13,
  left: 14,
  left_infill: 14,
  left_outline: 14,
  right: 15,
  right_infill: 15,
  right_outline: 15,
  dup: 12,
  ddown: 13,
  dleft: 14,
  dright: 15,
  "d-up": 12,
  "d-down": 13,
  "d-left": 14,
  "d-right": 15,
  // Center logo
  ps: 16,
  ps_infill: 16,
  ps_outline: 16,
  xbox: 16,
  // PS5 trackpad
  trackpad: 17,
  trackpad_infill: 17,
  trackpad_outline: 17,
};

// SVG element ids that act as the OUTER ring of a stick. The drag area is
// taken from this element's bounding rect, so the user can press anywhere
// inside the ring and the deflection is normalized to the ring's radius.
// Each entry maps to the stick side ("left" → axes[0/1], "right" → axes[2/3]).
const SVG_STICK_SIDE: Record<string, "left" | "right"> = {
  leftstick: "left",
  rightstick: "right",
  l3: "left",
  l3_infill: "left",
  l3_outline: "left",
  lstickoutline: "left",
  lstickdot: "left",
  r3: "right",
  r3_infill: "right",
  r3_outline: "right",
  rstickoutline: "right",
  rstickdot: "right",
};

// L3/R3 stick-click → button index. Stick clicks are hard to evoke with a
// mouse, so we treat a tap (pointerdown with shift held) as a click event;
// regular drags don't fire this. Disabled by default (commented out below)
// because shift+click is non-obvious; can be re-enabled if needed.
// const STICK_CLICK_BUTTON: Record<"left" | "right", number> = { left: 10, right: 11 };

type StickDragState = {
  pointerId: number;
  side: "left" | "right";
  rect: DOMRect;
};

type ButtonPressState = {
  pointerId: number;
  buttonIndex: number;
};

// Walks parent chain looking for an element whose lowercased id is in the
// given table. Returns the matching element + the table value. Stops at
// the SVG root.
function findIdHit<T>(
  start: Element | null,
  root: Element,
  table: Record<string, T>,
): { el: Element; value: T } | undefined {
  let el: Element | null = start;
  while (el && el !== root) {
    const id = el.id?.toLowerCase();
    if (id && id in table) {
      return { el, value: table[id]! };
    }
    el = el.parentElement;
  }
  return undefined;
}

// Translate a clientX/clientY into normalized stick coordinates.
// Y is flipped to match the gamepad convention (forward = +Y on screen
// translates to +1 on axes[1]/axes[3] — wait, actually the existing panel
// uses raw Y where forward stick yields negative Y in Gamepad API. Match
// that by NOT flipping; the published Joy then mirrors what a real pad
// would emit (pushing forward → axes[1] negative).
function normalizeStick(rect: DOMRect, clientX: number, clientY: number): { x: number; y: number } {
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const radius = Math.min(rect.width, rect.height) / 2;
  let nx = (clientX - cx) / radius;
  let ny = (clientY - cy) / radius;
  const mag = Math.hypot(nx, ny);
  if (mag > 1) {
    nx /= mag;
    ny /= mag;
  }
  return { x: nx, y: ny };
}

// Attaches all pointer handlers to `svg`, returns a cleanup function.
// `manualInput` is the same api the publish loop reads each tick.
export function attachSvgInteraction(svg: SVGSVGElement, manualInput: ManualInputApi): () => void {
  const stickDrags = new Map<number, StickDragState>();
  const buttonPresses = new Map<number, ButtonPressState>();

  const writeStick = (side: "left" | "right", x: number, y: number) => {
    const baseAxis = side === "left" ? 0 : 2;
    if (x === 0 && y === 0) {
      manualInput.setAxis(baseAxis, undefined);
      manualInput.setAxis(baseAxis + 1, undefined);
    } else {
      manualInput.setAxis(baseAxis, x);
      manualInput.setAxis(baseAxis + 1, y);
    }
  };

  const onPointerDown = (e: PointerEvent) => {
    const target = e.target as Element | null;

    // Stick first — if the user clicked on a stick group (which may also
    // contain inner buttons like LStickDot), prefer the stick interaction.
    const stickHit = findIdHit(target, svg, SVG_STICK_SIDE);
    if (stickHit) {
      const { el, value: side } = stickHit;
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      const rect = el.getBoundingClientRect();
      stickDrags.set(e.pointerId, { pointerId: e.pointerId, side, rect });
      const v = normalizeStick(rect, e.clientX, e.clientY);
      writeStick(side, v.x, v.y);
      return;
    }

    const buttonHit = findIdHit(target, svg, SVG_BUTTON_INDEX);
    if (buttonHit) {
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      buttonPresses.set(e.pointerId, {
        pointerId: e.pointerId,
        buttonIndex: buttonHit.value,
      });
      manualInput.setButton(buttonHit.value, 1);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    const drag = stickDrags.get(e.pointerId);
    if (drag) {
      const v = normalizeStick(drag.rect, e.clientX, e.clientY);
      writeStick(drag.side, v.x, v.y);
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    const drag = stickDrags.get(e.pointerId);
    if (drag) {
      stickDrags.delete(e.pointerId);
      writeStick(drag.side, 0, 0);
    }
    const press = buttonPresses.get(e.pointerId);
    if (press) {
      buttonPresses.delete(e.pointerId);
      manualInput.setButton(press.buttonIndex, undefined);
    }
    if (svg.hasPointerCapture(e.pointerId)) {
      svg.releasePointerCapture(e.pointerId);
    }
  };

  svg.addEventListener("pointerdown", onPointerDown);
  svg.addEventListener("pointermove", onPointerMove);
  svg.addEventListener("pointerup", onPointerUp);
  svg.addEventListener("pointercancel", onPointerUp);

  // Make the SVG appear interactive — cursor changes give a hint that
  // sticks/buttons are clickable.
  const prevCursor = svg.style.cursor;
  svg.style.cursor = "pointer";

  return () => {
    svg.removeEventListener("pointerdown", onPointerDown);
    svg.removeEventListener("pointermove", onPointerMove);
    svg.removeEventListener("pointerup", onPointerUp);
    svg.removeEventListener("pointercancel", onPointerUp);
    svg.style.cursor = prevCursor;
    // Clear any in-flight overrides from active pointers so the publish
    // loop doesn't latch onto stale virtual input after a remount.
    for (const drag of stickDrags.values()) {
      writeStick(drag.side, 0, 0);
    }
    for (const press of buttonPresses.values()) {
      manualInput.setButton(press.buttonIndex, undefined);
    }
  };
}
