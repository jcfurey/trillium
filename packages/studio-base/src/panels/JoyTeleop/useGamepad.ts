// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useEffect, useRef, useState } from "react";

export type GamepadSnapshot = {
  name: string;
  axes: readonly number[];
  buttons: readonly number[];
};

export type ConnectedPadInfo = {
  id: string;
  index: number;
};

// Polls navigator.getGamepads() each animation frame and exposes the
// latest snapshot via a getter. We poll instead of relying on the
// gamepadconnected event because Chromium only fires that event after a
// user gesture (typically a button press); polling lets the panel show
// "Gamepad: …" the instant the first frame arrives without forcing the
// caller to subscribe to a re-rendering value.
//
// `selector`:
//   "auto"        — first connected pad (legacy behavior)
//   <Gamepad.id>  — match a specific pad by its id string. When multiple
//                   connected pads share the same id, the lowest pad.index
//                   wins the tiebreak. If no connected pad matches, the
//                   snapshot is undefined and the publish loop sends zeros.
//
// Returns:
//   getSnapshot()      — latest values for the publish loop
//   present            — re-rendering boolean for the UI to switch modes
//   name               — re-rendering pad name for the status display
//   connectedPads      — re-rendering list of currently-connected pads
//                        (sorted by index). Only mutates when the set
//                        changes, so the settings tree only rebuilds on
//                        connect/disconnect, not every frame.
//   selectedConnected  — true when `selector` resolved to a live pad
export function useGamepad(selector: "auto" | string = "auto"): {
  getSnapshot: () => GamepadSnapshot | undefined;
  present: boolean;
  name: string | undefined;
  connectedPads: ConnectedPadInfo[];
  selectedConnected: boolean;
} {
  const ref = useRef<GamepadSnapshot | undefined>(undefined);
  const [present, setPresent] = useState<boolean>(false);
  const [name, setName] = useState<string | undefined>(undefined);
  const [connectedPads, setConnectedPads] = useState<ConnectedPadInfo[]>([]);
  const [selectedConnected, setSelectedConnected] = useState<boolean>(false);
  const padsSigRef = useRef<string>("");

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const pads = typeof navigator.getGamepads === "function" ? navigator.getGamepads() : [];
      const connected: ConnectedPadInfo[] = [];
      for (const p of pads) {
        if (p && p.connected) {
          connected.push({ id: p.id, index: p.index });
        }
      }
      connected.sort((a, b) => a.index - b.index);

      // Only re-render when the connected set actually changes — steady-state
      // hot path stays zero-setState even though we rebuild `connected` per frame.
      const sig = connected.map((p) => `${p.index}:${p.id}`).join("|");
      if (sig !== padsSigRef.current) {
        padsSigRef.current = sig;
        setConnectedPads(connected);
      }

      // Resolve the selected pad. "auto" → first; else match by id, lowest
      // index wins (the connected list is already sorted by index).
      let pad: Gamepad | undefined;
      if (selector === "auto") {
        for (const p of pads) {
          if (p && p.connected) {
            pad = p;
            break;
          }
        }
      } else {
        for (const info of connected) {
          if (info.id === selector) {
            const candidate = pads[info.index];
            if (candidate && candidate.connected) {
              pad = candidate;
              break;
            }
          }
        }
      }

      const resolved = pad != undefined;
      if (resolved !== selectedConnected) {
        setSelectedConnected(resolved);
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
  }, [present, name, selector, selectedConnected]);

  return {
    getSnapshot: () => ref.current,
    present,
    name,
    connectedPads,
    selectedConnected,
  };
}
