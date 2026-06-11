// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// Vertical slider widgets positioned absolutely over the L2 / R2 trigger
// groups inside a controller SVG. Drag to set an analog override (0..1)
// for buttons[6] / buttons[7]. Slider VALUE LATCHES — releasing the mouse
// leaves the value at the last drag position so the user can sustain a
// partial press (e.g., 30% throttle for testing). Click the bottom strip
// to reset to 0.
//
// Why an HTML overlay instead of inline SVG widgets: the trigger-element
// position varies per controller renderer, but the slider UX should look
// the same everywhere. We query the SVG for the trigger's bounding rect
// after mount and position the slider in HTML, with a ResizeObserver to
// follow layout changes.

import {
  PointerEvent as ReactPointerEvent,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { makeStyles } from "tss-react/mui";

import type { GamepadSnapshot } from "./useGamepad";
import type { ManualInputApi } from "./useManualInput";

type Props = {
  // Wrap div holding the SVG. We query within it for trigger group ids
  // and position our overlays relative to it.
  wrapRef: RefObject<HTMLDivElement>;
  // Snapshot accessor — we read the post-merge snapshot so the slider
  // bar can reflect either the physical trigger (when a pad is connected)
  // or the manual override (when the user is dragging the slider). Either
  // way the bar visually mirrors what's being published.
  getSnapshot: () => GamepadSnapshot | undefined;
  manualInput: ManualInputApi;
  // String key whose change triggers a re-bind: visual mode + presence.
  // We rerun layout queries when the SVG re-renders.
  rebindKey: string;
};

// Trigger SVG element ids by side. We try each in order — case-insensitive
// — and use the first match. Order matters: prefer the OUTER group (which
// has the largest bounding box) so the overlay sits over the whole trigger.
const TRIGGER_IDS: Record<"left" | "right", string[]> = {
  left: ["L2", "l2", "L2_outline", "l2_outline"],
  right: ["R2", "r2", "R2_outline", "r2_outline"],
};

const TRIGGER_BUTTON_INDEX: Record<"left" | "right", number> = { left: 6, right: 7 };

// Slider widget dimensions (CSS pixels). Tall enough to give precise drag
// resolution; narrow enough to not occlude the trigger graphic.
const SLIDER_W = 18;
const SLIDER_H = 64;

const useStyles = makeStyles()((theme) => ({
  slider: {
    position: "absolute",
    width: SLIDER_W,
    height: SLIDER_H,
    background: theme.palette.action.hover,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: SLIDER_W / 2,
    boxShadow: theme.shadows[2],
    cursor: "ns-resize",
    touchAction: "none",
    userSelect: "none",
    zIndex: 5,
    overflow: "hidden",
    transition: "border-color 80ms linear",
    "&:hover": {
      borderColor: theme.palette.primary.main,
    },
  },
  fill: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    background: theme.palette.primary.main,
    pointerEvents: "none",
    transition: "height 16ms linear",
  },
  knob: {
    position: "absolute",
    left: -2,
    right: -2,
    height: 4,
    background: theme.palette.primary.contrastText,
    border: `1px solid ${theme.palette.primary.dark}`,
    borderRadius: 2,
    boxShadow: theme.shadows[1],
    pointerEvents: "none",
  },
  label: {
    position: "absolute",
    top: -16,
    left: "50%",
    transform: "translateX(-50%)",
    fontSize: 10,
    fontFamily: theme.typography.fontMonospace,
    color: theme.palette.text.secondary,
    userSelect: "none",
    pointerEvents: "none",
  },
}));

type Pos = {
  // Position relative to the wrap's content box, in CSS pixels.
  // The slider's CENTER aligns to (x, y - SLIDER_H/2 - margin).
  x: number;
  y: number;
};

function findTriggerRect(wrap: HTMLDivElement, ids: readonly string[]): DOMRect | undefined {
  for (const id of ids) {
    // Use attribute selector — getElementById is document-scoped and may
    // return a node from another panel if the same id is reused.
    const el = wrap.querySelector<SVGGraphicsElement>(`[id="${id}"]`);
    if (el && typeof el.getBoundingClientRect === "function") {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        return rect;
      }
    }
  }
  return undefined;
}

type TriggerSliderProps = {
  pos: Pos | undefined;
  side: "left" | "right";
  manualInput: ManualInputApi;
  getSnapshot: () => GamepadSnapshot | undefined;
};

function TriggerSlider({
  pos,
  side,
  manualInput,
  getSnapshot,
}: TriggerSliderProps): JSX.Element | null {
  const { classes } = useStyles();
  const fillRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef<number | undefined>(undefined);
  const buttonIndex = TRIGGER_BUTTON_INDEX[side];
  // Latched value (last user-set position). Persists across pointerup so
  // the bar stays where the user dragged it.
  const latchedRef = useRef<number | undefined>(undefined);

  // Animate the fill bar to follow whichever value is being published —
  // physical trigger (no override) or manual latched value (override set).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const snap = getSnapshot();
      const v = snap?.buttons[buttonIndex] ?? 0;
      const fill = fillRef.current;
      const knob = knobRef.current;
      if (fill) {
        fill.style.height = `${Math.max(0, Math.min(1, v)) * 100}%`;
      }
      if (knob) {
        knob.style.bottom = `${Math.max(0, Math.min(1, v)) * 100}%`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [buttonIndex, getSnapshot]);

  const valueFromPointer = useCallback((e: ReactPointerEvent<HTMLDivElement>): number => {
    const el = sliderRef.current;
    if (!el) {
      return 0;
    }
    const rect = el.getBoundingClientRect();
    // Top of the slider = 1, bottom = 0.
    const v = 1 - (e.clientY - rect.top) / rect.height;
    return Math.max(0, Math.min(1, v));
  }, []);

  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      const el = sliderRef.current;
      el?.setPointerCapture(e.pointerId);
      draggingRef.current = e.pointerId;
      const v = valueFromPointer(e);
      latchedRef.current = v;
      manualInput.setButton(buttonIndex, v);
    },
    [buttonIndex, manualInput, valueFromPointer],
  );

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (draggingRef.current !== e.pointerId) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const v = valueFromPointer(e);
      latchedRef.current = v;
      manualInput.setButton(buttonIndex, v);
    },
    [buttonIndex, manualInput, valueFromPointer],
  );

  const onUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (draggingRef.current !== e.pointerId) {
        return;
      }
      draggingRef.current = undefined;
      // Latch: keep the value where the user released. Click-on-bottom is
      // the way to reset to 0 (already covered by valueFromPointer ≈ 0).
      // A clean hover at the very bottom strip clears the override entirely.
      const v = latchedRef.current ?? 0;
      if (v <= 0.01) {
        manualInput.setButton(buttonIndex, undefined);
      }
    },
    [buttonIndex, manualInput],
  );

  if (!pos) {
    return null;
  }

  return (
    <div
      ref={sliderRef}
      className={classes.slider}
      style={{
        left: pos.x - SLIDER_W / 2,
        top: pos.y - SLIDER_H - 6,
      }}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      <span className={classes.label}>{side === "left" ? "L2" : "R2"}</span>
      <div ref={fillRef} className={classes.fill} style={{ height: 0 }} />
      <div ref={knobRef} className={classes.knob} style={{ bottom: 0 }} />
    </div>
  );
}

export function TriggerSliderOverlay({
  wrapRef,
  getSnapshot,
  manualInput,
  rebindKey,
}: Props): JSX.Element {
  const [leftPos, setLeftPos] = useState<Pos | undefined>(undefined);
  const [rightPos, setRightPos] = useState<Pos | undefined>(undefined);

  // Recompute slider positions whenever the SVG re-renders or the panel
  // resizes. We also poll once on a short timeout because some browsers
  // give a 0×0 rect immediately after mount.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return;
    }
    const recompute = () => {
      const wrapRect = wrap.getBoundingClientRect();
      const lRect = findTriggerRect(wrap, TRIGGER_IDS.left);
      const rRect = findTriggerRect(wrap, TRIGGER_IDS.right);
      setLeftPos(
        lRect
          ? { x: lRect.left + lRect.width / 2 - wrapRect.left, y: lRect.top - wrapRect.top }
          : undefined,
      );
      setRightPos(
        rRect
          ? { x: rRect.left + rRect.width / 2 - wrapRect.left, y: rRect.top - wrapRect.top }
          : undefined,
      );
    };
    recompute();
    const t = window.setTimeout(recompute, 60);

    const ro = new ResizeObserver(recompute);
    ro.observe(wrap);
    return () => {
      window.clearTimeout(t);
      ro.disconnect();
    };
  }, [wrapRef, rebindKey]);

  return (
    <>
      <TriggerSlider
        pos={leftPos}
        side="left"
        manualInput={manualInput}
        getSnapshot={getSnapshot}
      />
      <TriggerSlider
        pos={rightPos}
        side="right"
        manualInput={manualInput}
        getSnapshot={getSnapshot}
      />
    </>
  );
}
