// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useEffect, useRef, useState } from "react";

// One physical pad's per-tick reading. `index` is the slot position the
// browser assigned (Gamepad.index — stable for as long as the pad stays
// connected, NOT the order in our connected list). `id` is the vendor
// string the browser surfaces (Gamepad.id) — used both as a display name
// and for substring matching against JoystickFeedback.name.
export type PadSnapshot = {
  index: number;
  id: string;
  axes: number[];
  // Stored as analog 0..1 (matches useGamepad.ts) so triggers can drive
  // bar fills smoothly. The publish path threshold-clips to int 0/1.
  buttons: number[];
};

// Lightweight summary that re-renders the panel — used for the pads
// list and for keeping the visualizer / settings tree in sync. Excludes
// the per-tick axis/button arrays (those live in the snapshot ref).
export type PadSummary = {
  index: number;
  id: string;
  axesCount: number;
  buttonsCount: number;
};

// Polls navigator.getGamepads() each animation frame and exposes:
//   getSnapshot()  — current axis/button values for every connected pad
//   getLivePads()  — the actual Gamepad references (for vibrationActuator).
//                    Returned objects are owned by the browser and may be
//                    invalidated on the next tick; callers must re-fetch.
//   pads           — re-rendering summary list (for UI; stable identity
//                    per Gamepad.index until a pad connects/disconnects).
//
// Polling (rather than gamepadconnected listeners) matches useGamepad.ts
// — Chromium gates connect events behind a user gesture, so polling is
// the only way to surface a pad on first paint.
export function useGamepadList(): {
  getSnapshot: () => PadSnapshot[];
  getLivePads: () => (Gamepad | undefined)[];
  pads: PadSummary[];
} {
  const snapshotRef = useRef<PadSnapshot[]>([]);
  const liveRef = useRef<(Gamepad | undefined)[]>([]);
  const [pads, setPads] = useState<PadSummary[]>([]);

  useEffect(() => {
    let raf = 0;
    // Track the last summary signature so we only re-render the panel
    // when a pad connects, disconnects, or changes its reported counts.
    let lastSig = "";
    const tick = () => {
      const list =
        typeof navigator.getGamepads === "function" ? Array.from(navigator.getGamepads()) : [];
      const snaps: PadSnapshot[] = [];
      const live: (Gamepad | undefined)[] = [];
      const summary: PadSummary[] = [];
      for (const pad of list) {
        if (!pad || !pad.connected) {
          continue;
        }
        snaps.push({
          index: pad.index,
          id: pad.id,
          axes: Array.from(pad.axes),
          buttons: pad.buttons.map((b) => b.value),
        });
        live.push(pad);
        summary.push({
          index: pad.index,
          id: pad.id,
          axesCount: pad.axes.length,
          buttonsCount: pad.buttons.length,
        });
      }
      snapshotRef.current = snaps;
      liveRef.current = live;
      const sig = summary.map((p) => `${p.index}:${p.id}:${p.axesCount}/${p.buttonsCount}`).join("|");
      if (sig !== lastSig) {
        lastSig = sig;
        setPads(summary);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, []);

  return {
    getSnapshot: () => snapshotRef.current,
    getLivePads: () => liveRef.current,
    pads,
  };
}
