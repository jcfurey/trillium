// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useRef } from "react";

// Per-pad rising-edge toggle state. Held by the panel as a single ref so
// that the Joy publish loop and the JoystickList publish loop see the
// same sticky output for the same pad on the same tick.
//
// Behavior matches joystick_library/joystick_driver's `sticky_buttons`
// param: each button-down edge flips sticky[i]; button-up is ignored.
// When the panel's stickyButtons mode is OFF, callers should pass the
// raw analog values straight to the publish path and not invoke apply().
export class StickyButtonState {
  // Keyed by Gamepad.index — stable for the lifetime of a connection.
  private readonly state = new Map<number, { prev: number[]; sticky: number[] }>();

  // Returns the toggled analog values (0 or 1) for this pad's buttons,
  // using `> 0.5` as the press threshold so triggers behave consistently
  // with the rest of the panel's button handling. The output array is a
  // fresh copy so callers can mutate without corrupting internal state.
  apply(padIndex: number, buttonsAnalog: readonly number[]): number[] {
    const len = buttonsAnalog.length;
    let entry = this.state.get(padIndex);
    if (!entry) {
      entry = { prev: new Array<number>(len).fill(0), sticky: new Array<number>(len).fill(0) };
      this.state.set(padIndex, entry);
    } else if (entry.prev.length !== len) {
      // Pad reported a different button count (rare, but happens when a
      // device's profile is renegotiated). Resize without losing the
      // existing toggle states for indices that survive.
      while (entry.prev.length < len) {
        entry.prev.push(0);
      }
      while (entry.sticky.length < len) {
        entry.sticky.push(0);
      }
      entry.prev.length = len;
      entry.sticky.length = len;
    }
    for (let i = 0; i < len; i++) {
      const curr = buttonsAnalog[i] ?? 0;
      const prev = entry.prev[i] ?? 0;
      if (curr > 0.5 && prev <= 0.5) {
        entry.sticky[i] = entry.sticky[i] === 1 ? 0 : 1;
      }
      entry.prev[i] = curr;
    }
    return [...entry.sticky];
  }

  // Drop state for pads no longer connected, so stale toggle values don't
  // resurface if a pad reconnects on the same Gamepad.index later.
  prune(connectedIndices: readonly number[]): void {
    const live = new Set(connectedIndices);
    for (const k of this.state.keys()) {
      if (!live.has(k)) {
        this.state.delete(k);
      }
    }
  }

  // Wipe all state — used when the operator toggles sticky mode off and
  // back on, so a pad doesn't resume mid-toggle from a stale snapshot.
  reset(): void {
    this.state.clear();
  }
}

// Stable ref wrapper. The state instance survives across renders; the
// hook just hands the same instance back each time.
export function useStickyButtons(): StickyButtonState {
  const ref = useRef<StickyButtonState | undefined>(undefined);
  if (!ref.current) {
    ref.current = new StickyButtonState();
  }
  return ref.current;
}
