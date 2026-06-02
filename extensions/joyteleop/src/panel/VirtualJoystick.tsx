// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import {
  useCallback,
  useImperativeHandle,
  useRef,
  useState,
  forwardRef,
  PointerEvent as ReactPointerEvent,
} from "react";
import { makeStyles } from "tss-react/mui";

import Stack from "../vendored/Stack";

import type { GamepadSnapshot } from "./useGamepad";

// Mirror Linux xpad axis layout (the same teleop-docker is built around):
//   axes[0] = left stick X        axes[3] = right stick Y
//   axes[1] = left stick Y        axes[6] = D-pad X (unused here)
//   axes[2] = right stick X       axes[7] = D-pad Y (unused here)
// Buttons:
//   0 A, 1 B, 2 X, 3 Y, 4 LB, 5 RB, 6 Back, 7 Start, 8 Logo, 9 LStick, 10 RStick
const VIRTUAL_NAME = "Virtual (on-screen)";
const BUTTON_LABELS = ["A", "B", "X", "Y", "LB", "RB", "Back", "Start"] as const;
const BUTTON_INDEX: Record<(typeof BUTTON_LABELS)[number], number> = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  Back: 6,
  Start: 7,
};

export type VirtualJoystickHandle = {
  getSnapshot: () => GamepadSnapshot;
};

const useStyles = makeStyles()((theme) => ({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1.5),
    width: "100%",
    height: "100%",
    padding: theme.spacing(1),
    boxSizing: "border-box",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sticks: {
    display: "flex",
    flexDirection: "row",
    gap: theme.spacing(2),
    flex: "1 1 auto",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    minHeight: 0,
  },
  stickWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: theme.spacing(0.5),
  },
  stickLabel: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.palette.text.secondary,
    userSelect: "none",
  },
  stickArea: {
    position: "relative",
    width: 140,
    height: 140,
    borderRadius: "50%",
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.action.hover,
    touchAction: "none",
    cursor: "grab",
    "&:active": { cursor: "grabbing" },
  },
  knob: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: theme.palette.primary.main,
    border: `2px solid ${theme.palette.background.paper}`,
    boxShadow: theme.shadows[2],
    pointerEvents: "none",
    transform: "translate(-50%, -50%)",
  },
  buttons: {
    display: "flex",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing(0.5),
    justifyContent: "center",
    padding: theme.spacing(0.5, 0),
  },
  button: {
    minWidth: 44,
    height: 32,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: theme.shape.borderRadius,
    background: theme.palette.action.hover,
    color: theme.palette.text.primary,
    fontSize: theme.typography.caption.fontSize,
    cursor: "pointer",
    userSelect: "none",
    touchAction: "none",
    "&:hover": { background: theme.palette.action.selected },
    "&.pressed": {
      background: theme.palette.primary.main,
      color: theme.palette.primary.contrastText,
      borderColor: theme.palette.primary.dark,
    },
  },
}));

type Vec2 = { x: number; y: number };
const ZERO: Vec2 = { x: 0, y: 0 };

type StickProps = {
  label: string;
  onChange: (v: Vec2) => void;
};

function AnalogStick({ label, onChange }: StickProps): JSX.Element {
  const { classes } = useStyles();
  const areaRef = useRef<HTMLDivElement>(ReactNull);
  const [pos, setPos] = useState<Vec2>(ZERO);
  const activePointerId = useRef<number | undefined>(undefined);

  // Browser pointer position → normalized (-1..1) with Y flipped to match
  // gamepad convention (forward stick = -Y).
  const compute = useCallback((clientX: number, clientY: number): Vec2 => {
    const el = areaRef.current;
    if (!el) {
      return ZERO;
    }
    const rect = el.getBoundingClientRect();
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
  }, []);

  const update = useCallback(
    (clientX: number, clientY: number) => {
      const v = compute(clientX, clientY);
      setPos(v);
      // Y is flipped: stick up (negative screen Y) = positive forward axis in
      // the physical xpad convention (-1 fwd / +1 back). Joy consumers vary;
      // we follow xpad/teleop-docker which reports forward as +1 on axis 1
      // (left stick Y), so we pass through as -screen_y to match.
      onChange({ x: v.x, y: -v.y });
    },
    [compute, onChange],
  );

  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.target as Element).setPointerCapture(e.pointerId);
      activePointerId.current = e.pointerId;
      update(e.clientX, e.clientY);
    },
    [update],
  );

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerId.current !== e.pointerId) {
        return;
      }
      update(e.clientX, e.clientY);
    },
    [update],
  );

  const onUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (activePointerId.current !== e.pointerId) {
        return;
      }
      activePointerId.current = undefined;
      setPos(ZERO);
      onChange(ZERO);
    },
    [onChange],
  );

  return (
    <div className={classes.stickWrap}>
      <span className={classes.stickLabel}>{label}</span>
      <div
        ref={areaRef}
        className={classes.stickArea}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          className={classes.knob}
          style={{ left: `${50 + pos.x * 35}%`, top: `${50 + pos.y * 35}%` }}
        />
      </div>
    </div>
  );
}

export const VirtualJoystick = forwardRef<VirtualJoystickHandle>(
  function VirtualJoystick(_props, ref): JSX.Element {
    const { classes, cx } = useStyles();
    // Mutable input state; never re-renders by itself — the publish loop
    // pulls via getSnapshot, the on-screen knobs/buttons re-render via
    // their own local state.
    const left = useRef<Vec2>(ZERO);
    const right = useRef<Vec2>(ZERO);
    const [pressed, setPressed] = useState<Set<number>>(() => new Set());

    const pressedRef = useRef(pressed);
    pressedRef.current = pressed;

    useImperativeHandle(
      ref,
      () => ({
        getSnapshot: (): GamepadSnapshot => {
          const axes = [
            left.current.x,
            left.current.y,
            right.current.x,
            right.current.y,
            0,
            0,
            0,
            0,
          ];
          // Up to 11 buttons (xpad layout). Only the 8 we expose can be set.
          const buttons = new Array(11).fill(0);
          for (const i of pressedRef.current) {
            if (i >= 0 && i < buttons.length) {
              buttons[i] = 1;
            }
          }
          return { name: VIRTUAL_NAME, axes, buttons };
        },
      }),
      [],
    );

    const onLeft = useCallback((v: Vec2) => {
      left.current = v;
    }, []);
    const onRight = useCallback((v: Vec2) => {
      right.current = v;
    }, []);

    // eslint-disable-next-line @foxglove/no-boolean-parameters
    const setButton = useCallback((idx: number, down: boolean) => {
      setPressed((prev) => {
        const next = new Set(prev);
        if (down) {
          next.add(idx);
        } else {
          next.delete(idx);
        }
        return next;
      });
    }, []);

    return (
      <Stack className={classes.root}>
        <div className={classes.sticks}>
          <AnalogStick label="Left (linear)" onChange={onLeft} />
          <AnalogStick label="Right (angular)" onChange={onRight} />
        </div>
        <div className={classes.buttons}>
          {BUTTON_LABELS.map((label) => {
            const idx = BUTTON_INDEX[label];
            const down = pressed.has(idx);
            return (
              <button
                key={label}
                type="button"
                className={cx(classes.button, { pressed: down })}
                onPointerDown={(e) => {
                  e.preventDefault();
                  (e.target as Element).setPointerCapture(e.pointerId);
                  setButton(idx, true);
                }}
                onPointerUp={(e) => {
                  e.preventDefault();
                  setButton(idx, false);
                }}
                onPointerCancel={() => {
                  setButton(idx, false);
                }}
                onPointerLeave={(e) => {
                  if ((e.buttons & 1) === 0) {
                    return;
                  }
                  setButton(idx, false);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      </Stack>
    );
  },
);
