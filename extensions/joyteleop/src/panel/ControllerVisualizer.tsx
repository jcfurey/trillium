// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useEffect, useRef } from "react";
import { makeStyles } from "tss-react/mui";

import type { GamepadSnapshot } from "./useGamepad";

type Props = {
  // Pull-style snapshot accessor — visualizer drives its own rAF instead
  // of forcing the parent to re-render every frame.
  getSnapshot: () => GamepadSnapshot | undefined;
  axesCount: number;
  buttonsCount: number;
  axisLabels: readonly string[];
  buttonLabels: readonly string[];
  deviceName?: string;
  // When false, render an overlay banner explaining the browser's
  // user-gesture requirement. Axes/buttons still render so the user can
  // see what the published Joy will look like before connecting.
  present: boolean;
};

const useStyles = makeStyles()((theme) => ({
  root: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    height: "100%",
    padding: theme.spacing(1.5),
    boxSizing: "border-box",
    gap: theme.spacing(1.5),
    overflow: "auto",
  },
  header: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.palette.text.secondary,
    fontFamily: theme.typography.fontMonospace,
    textAlign: "center",
    userSelect: "none",
  },
  sectionTitle: {
    fontSize: theme.typography.caption.fontSize,
    color: theme.palette.text.secondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: theme.spacing(0.5),
    userSelect: "none",
  },
  axesGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(36px, auto) 1fr 44px",
    gap: theme.spacing(0.5),
    alignItems: "center",
  },
  axisLabel: {
    fontSize: theme.typography.caption.fontSize,
    fontFamily: theme.typography.fontMonospace,
    color: theme.palette.text.primary,
    textAlign: "right",
    userSelect: "none",
  },
  axisBar: {
    position: "relative",
    height: 10,
    borderRadius: 5,
    background: theme.palette.action.hover,
    border: `1px solid ${theme.palette.divider}`,
    overflow: "hidden",
  },
  axisCenter: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 1,
    background: theme.palette.divider,
    transform: "translateX(-0.5px)",
  },
  axisFill: {
    position: "absolute",
    top: 0,
    bottom: 0,
    background: theme.palette.primary.main,
    transition: "left 16ms linear, width 16ms linear",
  },
  axisValue: {
    fontSize: theme.typography.caption.fontSize,
    fontFamily: theme.typography.fontMonospace,
    color: theme.palette.text.secondary,
    textAlign: "right",
    userSelect: "none",
  },
  buttonsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(56px, 1fr))",
    gap: theme.spacing(0.5),
  },
  button: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 2,
    padding: theme.spacing(0.5),
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.action.hover,
    fontSize: theme.typography.caption.fontSize,
    color: theme.palette.text.primary,
    userSelect: "none",
    transition: "background 80ms linear, border-color 80ms linear",
  },
  buttonPressed: {
    background: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    borderColor: theme.palette.primary.dark,
  },
  buttonIndex: {
    fontFamily: theme.typography.fontMonospace,
    fontSize: 9,
    opacity: 0.6,
  },
  hint: {
    padding: theme.spacing(0.75, 1),
    borderRadius: theme.shape.borderRadius,
    background: theme.palette.warning.main,
    color: theme.palette.warning.contrastText,
    fontSize: theme.typography.caption.fontSize,
    textAlign: "center",
    userSelect: "none",
  },
}));

export function ControllerVisualizer({
  getSnapshot,
  axesCount,
  buttonsCount,
  axisLabels,
  buttonLabels,
  deviceName,
  present,
}: Props): JSX.Element {
  const { classes, cx } = useStyles();

  // Refs to per-axis / per-button DOM nodes — we mutate them directly each
  // animation frame instead of going through React state, so a 60-Hz pad
  // doesn't trigger a full panel re-render every frame.
  const axisFillRefs = useRef<Array<HTMLDivElement | null>>([]);
  const axisValueRefs = useRef<Array<HTMLDivElement | null>>([]);
  const buttonRefs = useRef<Array<HTMLDivElement | null>>([]);
  const lastButtonState = useRef<number[]>([]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const snap = getSnapshot();
      const axes = snap?.axes ?? [];
      const buttons = snap?.buttons ?? [];

      for (let i = 0; i < axesCount; i++) {
        const v = clamp(axes[i] ?? 0, -1, 1);
        const fill = axisFillRefs.current[i];
        if (fill) {
          // Render as a fill from center outward — left side for negative,
          // right side for positive. Width is |v| * 50%.
          if (v >= 0) {
            fill.style.left = "50%";
            fill.style.width = `${v * 50}%`;
          } else {
            fill.style.left = `${50 + v * 50}%`;
            fill.style.width = `${-v * 50}%`;
          }
        }
        const valEl = axisValueRefs.current[i];
        if (valEl) {
          valEl.textContent = v.toFixed(2);
        }
      }

      // Buttons — only touch the DOM when state changed.
      for (let i = 0; i < buttonsCount; i++) {
        const pressed = (buttons[i] ?? 0) > 0 ? 1 : 0;
        if (lastButtonState.current[i] !== pressed) {
          lastButtonState.current[i] = pressed;
          const el = buttonRefs.current[i];
          if (el) {
            if (pressed === 1) {
              el.classList.add(classes.buttonPressed);
            } else {
              el.classList.remove(classes.buttonPressed);
            }
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [axesCount, buttonsCount, classes.buttonPressed, getSnapshot]);

  const axisRows = new Array(axesCount).fill(0);
  const buttonCells = new Array(buttonsCount).fill(0);

  return (
    <div className={classes.root}>
      <div className={classes.header}>{deviceName ?? "Gamepad"}</div>

      {!present && (
        <div className={classes.hint}>
          No gamepad detected — plug one in and press any button on it (with this window focused) to
          wake the browser Gamepad API.
        </div>
      )}

      <div>
        <div className={classes.sectionTitle}>Axes</div>
        <div className={classes.axesGrid}>
          {axisRows.map((_, i) => (
            <Row
              key={i}
              index={i}
              label={axisLabels[i] ?? `A${i}`}
              fillRefs={axisFillRefs}
              valueRefs={axisValueRefs}
              classes={classes}
            />
          ))}
        </div>
      </div>

      <div>
        <div className={classes.sectionTitle}>Buttons</div>
        <div className={classes.buttonsGrid}>
          {buttonCells.map((_, i) => (
            <div
              key={i}
              ref={(el) => {
                buttonRefs.current[i] = el;
              }}
              className={cx(classes.button)}
            >
              <span>{buttonLabels[i] ?? `B${i}`}</span>
              <span className={classes.buttonIndex}>{i}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

type RowProps = {
  index: number;
  label: string;
  fillRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  valueRefs: React.MutableRefObject<Array<HTMLDivElement | null>>;
  classes: ReturnType<typeof useStyles>["classes"];
};

function Row({ index, label, fillRefs, valueRefs, classes }: RowProps): JSX.Element {
  return (
    <>
      <div className={classes.axisLabel}>{label}</div>
      <div className={classes.axisBar}>
        <div className={classes.axisCenter} />
        <div
          ref={(el) => {
            fillRefs.current[index] = el;
          }}
          className={classes.axisFill}
          style={{ left: "50%", width: "0%" }}
        />
      </div>
      <div
        ref={(el) => {
          valueRefs.current[index] = el;
        }}
        className={classes.axisValue}
      >
        0.00
      </div>
    </>
  );
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
