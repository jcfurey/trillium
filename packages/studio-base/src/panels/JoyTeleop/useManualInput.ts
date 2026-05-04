// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useMemo, useRef } from "react";

// Manual override values applied on top of the live gamepad / virtual-stick
// snapshot. Lets the user drive sticks and buttons by clicking the SVG (or
// dragging an HTML slider) without disconnecting their physical pad. Stored
// as sparse maps so "unset" is distinct from "set to 0".
export type ManualOverride = {
  axes: Record<number, number>;
  buttons: Record<number, number>;
};

export type ManualInputApi = {
  getOverride: () => ManualOverride;
  setAxis: (idx: number, value: number | undefined) => void;
  setButton: (idx: number, value: number | undefined) => void;
  clearAll: () => void;
};

// Hook returning a stable api whose mutations don't trigger React re-renders.
// The publish loop pulls via getOverride() each tick — so updates flow at
// the publish rate without thrashing the panel tree.
export function useManualInput(): ManualInputApi {
  const ref = useRef<ManualOverride>({ axes: {}, buttons: {} });

  return useMemo<ManualInputApi>(
    () => ({
      getOverride: () => ref.current,
      setAxis: (idx, value) => {
        if (value == undefined) {
          delete ref.current.axes[idx];
        } else {
          ref.current.axes[idx] = value;
        }
      },
      setButton: (idx, value) => {
        if (value == undefined) {
          delete ref.current.buttons[idx];
        } else {
          ref.current.buttons[idx] = value;
        }
      },
      clearAll: () => {
        ref.current = { axes: {}, buttons: {} };
      },
    }),
    [],
  );
}

// Merge an override over a base snapshot. Override entries win where defined;
// missing entries fall through. `axesLen`/`buttonsLen` ensure the result has
// well-defined lengths even when the base snapshot is shorter than the
// override (e.g. virtual stick disconnected, manual overrides still apply).
export function mergeOverride(
  baseAxes: readonly number[] | undefined,
  baseButtons: readonly number[] | undefined,
  override: ManualOverride,
  axesLen: number,
  buttonsLen: number,
): { axes: number[]; buttons: number[] } {
  const axes = new Array<number>(axesLen).fill(0);
  for (let i = 0; i < axesLen; i++) {
    axes[i] = override.axes[i] ?? baseAxes?.[i] ?? 0;
  }
  const buttons = new Array<number>(buttonsLen).fill(0);
  for (let i = 0; i < buttonsLen; i++) {
    buttons[i] = override.buttons[i] ?? baseButtons?.[i] ?? 0;
  }
  return { axes, buttons };
}
