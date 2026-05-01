// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useEffect, useRef, useState } from "react";

export type GamepadSnapshot = {
  name: string;
  axes: readonly number[];
  buttons: readonly number[];
};

// Polls navigator.getGamepads() each animation frame and exposes the
// latest snapshot via a getter. We poll instead of relying on the
// gamepadconnected event because Chromium only fires that event after a
// user gesture (typically a button press); polling lets the panel show
// "Gamepad: …" the instant the first frame arrives without forcing the
// caller to subscribe to a re-rendering value.
//
// Returns:
//   getSnapshot() — latest values for the publish loop
//   present       — re-rendering boolean for the UI to switch modes
//   name          — re-rendering pad name for the status display
export function useGamepad(): {
  getSnapshot: () => GamepadSnapshot | undefined;
  present: boolean;
  name: string | undefined;
} {
  const ref = useRef<GamepadSnapshot | undefined>(undefined);
  const [present, setPresent] = useState<boolean>(false);
  const [name, setName] = useState<string | undefined>(undefined);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
      let pad: Gamepad | undefined;
      for (const p of pads) {
        if (p && p.connected) {
          pad = p;
          break;
        }
      }
      if (pad) {
        const snap: GamepadSnapshot = {
          name: pad.id,
          axes: Array.from(pad.axes),
          // Carry the analog value (0..1) rather than thresholding to 0/1
          // so triggers (W3C Standard Gamepad buttons[6]/[7]) drive bar
          // fills smoothly. Downstream consumers that only care about
          // press/release can still test `value > 0` (or > 0.5 for a
          // half-press threshold).
          buttons: pad.buttons.map((b) => b.value),
        };
        ref.current = snap;
        if (!present) {
          setPresent(true);
        }
        if (name !== pad.id) {
          setName(pad.id);
        }
      } else if (ref.current) {
        ref.current = undefined;
        if (present) {
          setPresent(false);
        }
        if (name !== undefined) {
          setName(undefined);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [present, name]);

  return {
    getSnapshot: () => ref.current,
    present,
    name,
  };
}
