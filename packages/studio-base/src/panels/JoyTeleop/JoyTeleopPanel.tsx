// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as _ from "lodash-es";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { DeepPartial } from "ts-essentials";

import { ros2jazzy } from "@foxglove/rosmsg-msgs-common";
import {
  PanelExtensionContext,
  SettingsTreeAction,
  SettingsTreeNode,
  SettingsTreeNodes,
  Topic,
} from "@foxglove/studio";
import EmptyState from "@foxglove/studio-base/components/EmptyState";
import Stack from "@foxglove/studio-base/components/Stack";
import ThemeProvider from "@foxglove/studio-base/theme/ThemeProvider";

import { ControllerVisualizer } from "./ControllerVisualizer";
import {
  CONTROLLER_PRESETS,
  ControllerPresetId,
  PRESET_OPTIONS,
  identityMap,
  presetLabelsFor,
} from "./controllerPresets";
import { GamepadMimic } from "./GamepadMimic";
import { useManualInput, mergeOverride } from "./useManualInput";
import { VirtualJoystick, VirtualJoystickHandle } from "./VirtualJoystick";
import { useGamepad, GamepadSnapshot } from "./useGamepad";

type DisplayStyle = "mimic" | "list";

const DISPLAY_STYLE_OPTIONS: Array<{ label: string; value: DisplayStyle }> = [
  { label: "Gamepad mimic", value: "mimic" },
  { label: "List (axis bars + buttons)", value: "list" },
];

type JoyTeleopPanelProps = {
  context: PanelExtensionContext;
};

type Config = {
  topic: string;
  frameId: string;
  publishRate: number;
  preset: ControllerPresetId;
  axes: number;
  buttons: number;
  axisLabels: string[];
  buttonLabels: string[];
  // Remap from published index → source physical index. Published axis i
  // reads from gamepad.axes[axisMap[i]] (same for buttons). Default is
  // identity (raw passthrough). Lets the user re-route a physical input to
  // a different Joy slot without touching teleop_twist_joy on the robot.
  axisMap: number[];
  buttonMap: number[];
  // Virtual deadman: while the user holds Space (and the panel is hovered),
  // virtual click-drag/slider input is merged into the published Joy AND
  // this button index is synthesized as pressed. Mirrors the physical L1
  // deadman that teleop_twist_joy expects to be held during motion. Set
  // to -1 to publish virtual input without a synthesized deadman.
  virtualDeadmanButton: number;
  deadzone: number;
  forceVirtual: boolean;
  displayStyle: DisplayStyle;
  heartbeat: {
    enabled: boolean;
    topic: string;
    rate: number;
  };
};

const DEFAULT_PRESET: ControllerPresetId = "xbox";

const DEFAULT_CONFIG: Config = {
  topic: "/teleop/joy",
  frameId: "",
  publishRate: 20,
  preset: DEFAULT_PRESET,
  axes: CONTROLLER_PRESETS[DEFAULT_PRESET].axes,
  buttons: CONTROLLER_PRESETS[DEFAULT_PRESET].buttons,
  axisLabels: [...CONTROLLER_PRESETS[DEFAULT_PRESET].axisLabels],
  buttonLabels: [...CONTROLLER_PRESETS[DEFAULT_PRESET].buttonLabels],
  axisMap: identityMap(CONTROLLER_PRESETS[DEFAULT_PRESET].axes),
  buttonMap: identityMap(CONTROLLER_PRESETS[DEFAULT_PRESET].buttons),
  // Default to L1/LB (button 4) — teleop_twist_joy's typical enable_button.
  virtualDeadmanButton: 4,
  deadzone: 0.1,
  forceVirtual: false,
  displayStyle: "mimic",
  heartbeat: {
    enabled: false,
    topic: "/teleop/heartbeat",
    rate: 1.0,
  },
};

const JOY_DATATYPES = new Map([
  ["builtin_interfaces/Time", ros2jazzy["builtin_interfaces/Time"]],
  ["std_msgs/Header", ros2jazzy["std_msgs/Header"]],
  ["sensor_msgs/Joy", ros2jazzy["sensor_msgs/Joy"]],
]);

const BOOL_DATATYPES = new Map([["std_msgs/Bool", ros2jazzy["std_msgs/Bool"]]]);

// Curated dropdown options for axis / button labels. The settings tree
// uses `input: "autocomplete"` so the user can either pick from these or
// type a free-form value — anything they enter is preserved.
const AXIS_LABEL_OPTIONS = [
  "LX",
  "LY",
  "RX",
  "RY",
  "LT",
  "RT",
  "L2",
  "R2",
  "D-X",
  "D-Y",
  "(unused)",
] as const;

const BUTTON_LABEL_OPTIONS = [
  // Xbox face
  "A",
  "B",
  "X",
  "Y",
  // PlayStation face
  "Cross",
  "Circle",
  "Square",
  "Triangle",
  // Bumpers / triggers
  "LB",
  "RB",
  "LT",
  "RT",
  "L1",
  "R1",
  "L2",
  "R2",
  // Center
  "Back",
  "Start",
  "Share",
  "Options",
  "Logo",
  "PS",
  "Touchpad",
  // Stick clicks
  "LStick",
  "RStick",
  // D-pad as buttons
  "D-Up",
  "D-Down",
  "D-Left",
  "D-Right",
  "(unused)",
] as const;

// Merge the curated list with the user's current value so it always shows
// up in the dropdown (settings-tree autocomplete only suggests from items;
// any current free-form value is still kept as the field value).
function mergeLabelOptions(current: string, base: readonly string[]): string[] {
  if (base.includes(current as (typeof base)[number])) {
    return [...base];
  }
  return current ? [current, ...base] : [...base];
}

function buildSettingsTree(
  config: Config,
  topics: readonly Topic[],
  status: string,
): SettingsTreeNodes {
  const joyTopics = topics
    .filter((t) => t.schemaName === "sensor_msgs/msg/Joy" || t.schemaName === "sensor_msgs/Joy")
    .map((t) => t.name);
  // Counts and labels are always editable. Selecting a preset just loads
  // its defaults; selecting "Custom" doesn't enable extra editing — it's
  // the right thing to pick when you intend to start from a blank slate.
  // Child node KEYS ("axisLabels" / "buttonLabels") and field KEYS
  // ("0", "1", ...) line up with Config.axisLabels[i] / Config.buttonLabels[i]
  // so the same path.slice(1) handler that maps every other field works here too.
  const axisLabelsNode: SettingsTreeNode = {
    label: "Axis labels",
    fields: Object.fromEntries(
      new Array(config.axes).fill(0).map((_, i) => {
        const value = config.axisLabels[i] ?? `A${i}`;
        return [
          String(i),
          {
            label: `Axis ${i}`,
            input: "autocomplete" as const,
            value,
            items: mergeLabelOptions(value, AXIS_LABEL_OPTIONS),
          },
        ];
      }),
    ),
  };
  const buttonLabelsNode: SettingsTreeNode = {
    label: "Button labels",
    fields: Object.fromEntries(
      new Array(config.buttons).fill(0).map((_, i) => {
        const value = config.buttonLabels[i] ?? `B${i}`;
        return [
          String(i),
          {
            label: `Button ${i}`,
            input: "autocomplete" as const,
            value,
            items: mergeLabelOptions(value, BUTTON_LABEL_OPTIONS),
          },
        ];
      }),
    ),
  };
  // Remap subtrees. Each row is a number field whose value is the *source*
  // physical index that feeds the published index. "Capture next input"
  // arms a one-shot listener; the next axis the user moves / button they
  // press fills the lowest-still-default slot. Reset returns to identity.
  const axisMapNode: SettingsTreeNode = {
    label: "Axis remap",
    actions: [
      { type: "action", id: "capture-next-axis", label: "Capture next axis", icon: "Add" },
      { type: "action", id: "reset-axis-map", label: "Reset to identity", icon: "Settings" },
    ],
    fields: Object.fromEntries(
      new Array(config.axes).fill(0).map((_, i) => [
        String(i),
        {
          label: `Pub axis ${i} ← src`,
          input: "number" as const,
          value: config.axisMap[i] ?? i,
          min: 0,
          max: 31,
          step: 1,
          help: `Read gamepad.axes[N] into published axes[${i}]`,
        },
      ]),
    ),
  };
  const buttonMapNode: SettingsTreeNode = {
    label: "Button remap",
    actions: [
      { type: "action", id: "capture-next-button", label: "Capture next button", icon: "Add" },
      { type: "action", id: "reset-button-map", label: "Reset to identity", icon: "Settings" },
    ],
    fields: Object.fromEntries(
      new Array(config.buttons).fill(0).map((_, i) => [
        String(i),
        {
          label: `Pub btn ${i} ← src`,
          input: "number" as const,
          value: config.buttonMap[i] ?? i,
          min: 0,
          max: 31,
          step: 1,
          help: `Read gamepad.buttons[N] into published buttons[${i}]`,
        },
      ]),
    ),
  };
  // path[0] is "general", remaining segments index into Config so a single
  // slice(1) in the action handler maps the path straight onto Config.
  const general: SettingsTreeNode = {
    label: "General",
    actions: [
      {
        type: "action",
        id: "detect-from-pad",
        label: "Detect from connected pad",
        icon: "Settings",
      },
    ],
    fields: {
      topic: {
        label: "Joy topic",
        input: "autocomplete",
        value: config.topic,
        items: joyTopics,
      },
      frameId: {
        label: "Frame ID",
        input: "string",
        value: config.frameId,
        placeholder: "(empty)",
      },
      publishRate: {
        label: "Publish rate (Hz)",
        input: "number",
        value: config.publishRate,
        min: 1,
        max: 200,
      },
      preset: {
        label: "Controller preset",
        input: "select",
        value: config.preset,
        options: PRESET_OPTIONS,
      },
      axes: {
        label: "Axes count",
        input: "number",
        value: config.axes,
        min: 1,
        max: 32,
      },
      buttons: {
        label: "Buttons count",
        input: "number",
        value: config.buttons,
        min: 1,
        max: 32,
      },
      deadzone: {
        label: "Deadzone",
        input: "number",
        value: config.deadzone,
        min: 0,
        max: 1,
        step: 0.05,
      },
      forceVirtual: {
        label: "Force virtual",
        input: "boolean",
        value: config.forceVirtual,
        help: "Show on-screen sticks even when a real gamepad is connected.",
      },
      virtualDeadmanButton: {
        label: "Virtual deadman btn",
        input: "number",
        value: config.virtualDeadmanButton,
        min: -1,
        max: 31,
        step: 1,
        help: "Hold Space (panel hovered) to arm virtual click-drag input. While armed, this button index is also synthesized pressed so teleop_twist_joy's enable gate releases. -1 disables the synthesis but Space still arms the override.",
      },
      displayStyle: {
        label: "Display style",
        input: "select",
        value: config.displayStyle,
        options: DISPLAY_STYLE_OPTIONS,
      },
      status: { label: "Input", input: "string", value: status, readonly: true },
    },
    children: {
      heartbeat: {
        label: "Heartbeat",
        fields: {
          enabled: { label: "Enabled", input: "boolean", value: config.heartbeat.enabled },
          topic: { label: "Topic", input: "string", value: config.heartbeat.topic },
          rate: {
            label: "Rate (Hz)",
            input: "number",
            value: config.heartbeat.rate,
            min: 0.1,
            max: 50,
            step: 0.5,
          },
        },
      },
      axisLabels: axisLabelsNode,
      buttonLabels: buttonLabelsNode,
      axisMap: axisMapNode,
      buttonMap: buttonMapNode,
    },
  };

  return { general };
}

// Read source[map[i]] with deadzone. `map` may be shorter than `length`;
// missing slots default to identity (i → i) so a freshly-grown axes count
// publishes the new physical slots until the user remaps.
function applyDeadzone(
  values: readonly number[],
  map: readonly number[],
  deadzone: number,
  length: number,
): number[] {
  const out = new Array<number>(length).fill(0);
  for (let i = 0; i < length; i++) {
    const src = map[i] ?? i;
    const v = values[src] ?? 0;
    out[i] = Math.abs(v) < deadzone ? 0 : v;
  }
  return out;
}

function clipButtons(
  values: readonly number[],
  map: readonly number[],
  length: number,
): number[] {
  const out = new Array<number>(length).fill(0);
  for (let i = 0; i < length; i++) {
    const src = map[i] ?? i;
    // useGamepad now stores analog button values (0..1) so triggers can
    // smoothly fill the visualizer bars. Threshold at half-press for the
    // published binary Joy.buttons (matches what teleop_twist_joy expects
    // for deadman/turbo).
    out[i] = (values[src] ?? 0) > 0.5 ? 1 : 0;
  }
  return out;
}

function nowStamp(): { sec: number; nanosec: number } {
  const ms = Date.now();
  return { sec: Math.floor(ms / 1000), nanosec: (ms % 1000) * 1_000_000 };
}

// Apply preset on top of the current Config — preserves topic/heartbeat etc.,
// but overrides axes/buttons counts and labels with the preset's defaults.
// Remap also resets to identity since the preset implies a fresh layout.
function applyPreset(prev: Config, presetId: ControllerPresetId): Config {
  const preset = CONTROLLER_PRESETS[presetId];
  const { axisLabels, buttonLabels } = presetLabelsFor(presetId, preset.axes, preset.buttons);
  return {
    ...prev,
    preset: presetId,
    axes: preset.axes,
    buttons: preset.buttons,
    axisLabels,
    buttonLabels,
    axisMap: identityMap(preset.axes),
    buttonMap: identityMap(preset.buttons),
  };
}

function JoyTeleopPanel(props: JoyTeleopPanelProps): JSX.Element {
  const { context } = props;
  const { saveState } = context;

  const [topics, setTopics] = useState<readonly Topic[]>([]);
  const [colorScheme, setColorScheme] = useState<"dark" | "light">("light");
  const [renderDone, setRenderDone] = useState<() => void>(() => () => {});

  const [config, setConfig] = useState<Config>(() => {
    const partial = (context.initialState ?? {}) as DeepPartial<Config>;
    const merged = _.merge({}, DEFAULT_CONFIG, partial);
    // ts-essentials' DeepPartial widens arrays; lodash merge produces sparse
    // arrays when partial omits indices. Re-pad from the active preset so
    // the visualizer never sees `undefined` slots, and pad maps to identity.
    const preset = CONTROLLER_PRESETS[merged.preset] ?? CONTROLLER_PRESETS[DEFAULT_PRESET];
    const { axisLabels, buttonLabels } = presetLabelsFor(preset.id, merged.axes, merged.buttons);
    return {
      ...merged,
      axisLabels: new Array(merged.axes)
        .fill("")
        .map((_v, i) => merged.axisLabels[i] ?? axisLabels[i] ?? `A${i}`),
      buttonLabels: new Array(merged.buttons)
        .fill("")
        .map((_v, i) => merged.buttonLabels[i] ?? buttonLabels[i] ?? `B${i}`),
      axisMap: new Array(merged.axes).fill(0).map((_v, i) => merged.axisMap[i] ?? i),
      buttonMap: new Array(merged.buttons).fill(0).map((_v, i) => merged.buttonMap[i] ?? i),
    };
  });

  const gamepad = useGamepad();
  const virtualRef = useRef<VirtualJoystickHandle | null>(null);
  const manualInput = useManualInput();

  // Virtual-deadman arming. Space is the modifier key; we listen only
  // while the panel is "active" (hover or in-flight pointer interaction)
  // so global Space — bag playback toggle, etc. — still works elsewhere.
  // armedRef is read in the publish-loop hot path; armedDisplay is for
  // the ARMED banner only and re-renders when the state changes.
  const [panelActive, setPanelActive] = useState(false);
  const armedRef = useRef(false);
  const [armedDisplay, setArmedDisplay] = useState(false);

  useEffect(() => {
    if (!panelActive) {
      armedRef.current = false;
      setArmedDisplay(false);
      return;
    }
    const isTextInput = (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLElement)) {
        return false;
      }
      const tag = target.tagName;
      return (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.isContentEditable === true
      );
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat) {
        return;
      }
      if (isTextInput(e.target)) {
        return;
      }
      e.preventDefault();
      armedRef.current = true;
      setArmedDisplay(true);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") {
        return;
      }
      if (isTextInput(e.target)) {
        return;
      }
      e.preventDefault();
      armedRef.current = false;
      setArmedDisplay(false);
    };
    // Window blur (alt-tab, lost focus) should disarm — otherwise a held
    // Space can latch on with no way for the user to release it.
    const onBlur = () => {
      armedRef.current = false;
      setArmedDisplay(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      armedRef.current = false;
      setArmedDisplay(false);
    };
  }, [panelActive]);

  // Stable ref into the latest gamepad reading so the settings action
  // handler (called on user click) can read live counts without a stale
  // closure on `gamepad`.
  const gamepadLiveRef = useRef(gamepad);
  gamepadLiveRef.current = gamepad;

  // Live config ref shared by the capture watcher and the publish loop —
  // both need the latest value without retriggering the effect whenever an
  // unrelated field (e.g. label) changes.
  const configRef = useRef(config);
  configRef.current = config;

  // Sequential capture mode for the remap settings actions. Each tick of
  // the watcher fills one slot and advances to the next; when nextIndex
  // hits the count, the mode clears.
  const [captureMode, setCaptureMode] = useState<
    { kind: "axis" | "button"; nextIndex: number } | undefined
  >(undefined);

  // forceVirtual is the only switch — when false, we always render the
  // visualizer (even with no pad detected, so it's obvious we're waiting on
  // the user-gesture wake-up). When true, the on-screen sticks take over
  // as the input source.
  const useVirtual = config.forceVirtual;
  const baseStatus = useVirtual
    ? "Virtual (on-screen)"
    : gamepad.present
    ? `Gamepad: ${gamepad.name ?? "connected"}`
    : "Waiting for gamepad input";
  const status =
    captureMode != undefined
      ? `${baseStatus}  •  Capturing ${captureMode.kind} → pub ${captureMode.kind} ${captureMode.nextIndex}`
      : baseStatus;

  const settingsActionHandler = useCallback((action: SettingsTreeAction) => {
    // Detect button on the General node — pull the live gamepad's actual
    // axes/buttons counts and label them with the current preset's defaults.
    if (action.action === "perform-node-action" && action.payload.id === "detect-from-pad") {
      const snap = gamepadLiveRef.current.getSnapshot();
      if (!snap) {
        return;
      }
      setConfig((prev) => {
        const axes = snap.axes.length;
        const buttons = snap.buttons.length;
        const { axisLabels, buttonLabels } = presetLabelsFor(prev.preset, axes, buttons);
        return {
          ...prev,
          axes,
          buttons,
          axisLabels,
          buttonLabels,
        };
      });
      return;
    }
    // Remap subtree actions.
    if (action.action === "perform-node-action") {
      switch (action.payload.id) {
        case "reset-axis-map":
          setConfig((prev) => ({ ...prev, axisMap: identityMap(prev.axes) }));
          return;
        case "reset-button-map":
          setConfig((prev) => ({ ...prev, buttonMap: identityMap(prev.buttons) }));
          return;
        case "capture-next-axis":
          // Toggle: clicking again while armed cancels.
          setCaptureMode((prev) =>
            prev?.kind === "axis" ? undefined : { kind: "axis", nextIndex: 0 },
          );
          return;
        case "capture-next-button":
          setCaptureMode((prev) =>
            prev?.kind === "button" ? undefined : { kind: "button", nextIndex: 0 },
          );
          return;
        default:
          break;
      }
    }
    if (action.action !== "update") {
      return;
    }
    const { path, value } = action.payload;
    setConfig((prev) => {
      // Preset change → reload counts + labels in one shot.
      if (path.length === 2 && path[0] === "general" && path[1] === "preset") {
        return applyPreset(prev, value as ControllerPresetId);
      }
      // axes/buttons count change → resize label + map arrays, padding new
      // slots from the active preset's defaults / identity map.
      if (
        path.length === 2 &&
        path[0] === "general" &&
        (path[1] === "axes" || path[1] === "buttons")
      ) {
        const next = _.cloneDeep(prev);
        _.set(next, path.slice(1), value);
        const { axisLabels, buttonLabels } = presetLabelsFor(next.preset, next.axes, next.buttons);
        next.axisLabels = new Array(next.axes)
          .fill("")
          .map((_, i) => prev.axisLabels[i] ?? axisLabels[i] ?? `A${i}`);
        next.buttonLabels = new Array(next.buttons)
          .fill("")
          .map((_, i) => prev.buttonLabels[i] ?? buttonLabels[i] ?? `B${i}`);
        next.axisMap = new Array(next.axes).fill(0).map((_, i) => prev.axisMap[i] ?? i);
        next.buttonMap = new Array(next.buttons).fill(0).map((_, i) => prev.buttonMap[i] ?? i);
        return next;
      }
      const next = _.cloneDeep(prev);
      _.set(next, path.slice(1), value);
      return next;
    });
  }, []);

  useLayoutEffect(() => {
    context.watch("topics");
    context.watch("colorScheme");

    context.onRender = (renderState, done) => {
      setTopics(renderState.topics ?? []);
      setRenderDone(() => done);
      if (renderState.colorScheme) {
        setColorScheme(renderState.colorScheme);
      }
    };
  }, [context]);

  // Capture watcher. While captureMode is active, take a baseline reading
  // and poll: the first physical axis to displace > 0.5 from baseline (or
  // first button to cross > 0.5 from a non-pressed start) is recorded into
  // the next slot. Advance through slots; clear mode when count is reached.
  useEffect(() => {
    if (captureMode == undefined) {
      return;
    }
    const baseline = gamepadLiveRef.current.getSnapshot();
    if (!baseline) {
      return;
    }
    const baseAxes = [...baseline.axes];
    const baseButtons = [...baseline.buttons];
    let raf = 0;
    const tick = () => {
      const snap = gamepadLiveRef.current.getSnapshot();
      if (snap) {
        if (captureMode.kind === "axis") {
          let detected = -1;
          for (let i = 0; i < snap.axes.length; i++) {
            const v = snap.axes[i] ?? 0;
            const b = baseAxes[i] ?? 0;
            if (Math.abs(v - b) > 0.5) {
              detected = i;
              break;
            }
          }
          if (detected >= 0) {
            const captured = detected;
            setConfig((prev) => {
              const map = [...prev.axisMap];
              map[captureMode.nextIndex] = captured;
              return { ...prev, axisMap: map };
            });
            const next = captureMode.nextIndex + 1;
            setCaptureMode(
              next >= configRef.current.axes ? undefined : { kind: "axis", nextIndex: next },
            );
            return;
          }
        } else {
          let detected = -1;
          for (let i = 0; i < snap.buttons.length; i++) {
            const v = snap.buttons[i] ?? 0;
            const b = baseButtons[i] ?? 0;
            if (v > 0.5 && b <= 0.5) {
              detected = i;
              break;
            }
          }
          if (detected >= 0) {
            const captured = detected;
            setConfig((prev) => {
              const map = [...prev.buttonMap];
              map[captureMode.nextIndex] = captured;
              return { ...prev, buttonMap: map };
            });
            const next = captureMode.nextIndex + 1;
            setCaptureMode(
              next >= configRef.current.buttons ? undefined : { kind: "button", nextIndex: next },
            );
            return;
          }
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
    };
  }, [captureMode]);

  useEffect(() => {
    context.updatePanelSettingsEditor({
      actionHandler: settingsActionHandler,
      nodes: buildSettingsTree(config, topics, status),
    });
    saveState(config);
  }, [config, context, saveState, settingsActionHandler, status, topics]);

  // Joy advertise + publish loop
  const { topic: joyTopic, publishRate } = config;
  const canPublish = context.publish != undefined && context.advertise != undefined;

  const useVirtualRef = useRef(useVirtual);
  useVirtualRef.current = useVirtual;

  // Snapshot accessor used by both the publish loop and the visualizer.
  // Manual override (click-drag on the SVG, trigger sliders) is gated by
  // the Space-held arming flag — a virtual deadman so the user can't drive
  // by accident with a stray click. While armed, the configured deadman
  // button index is synthesized as pressed so teleop_twist_joy's gate
  // releases (mirrors holding L1 on a real pad).
  const getActiveSnapshot = useCallback((): GamepadSnapshot | undefined => {
    const base = useVirtualRef.current
      ? virtualRef.current?.getSnapshot()
      : gamepadLiveRef.current.getSnapshot();
    if (!armedRef.current) {
      return base;
    }
    const override = manualInput.getOverride();
    const cfg = configRef.current;
    const dm = cfg.virtualDeadmanButton;
    const buttonsLen = Math.max(cfg.buttons, base?.buttons.length ?? 0, dm + 1);
    const { axes, buttons } = mergeOverride(
      base?.axes,
      base?.buttons,
      override,
      Math.max(cfg.axes, base?.axes.length ?? 0),
      buttonsLen,
    );
    if (dm >= 0 && dm < buttons.length) {
      buttons[dm] = 1;
    }
    return {
      name: base?.name ?? "Manual override",
      axes,
      buttons,
    };
  }, [manualInput]);

  useLayoutEffect(() => {
    if (!canPublish || !joyTopic) {
      return;
    }
    context.advertise?.(joyTopic, "sensor_msgs/Joy", { datatypes: JOY_DATATYPES });
    return () => {
      context.unadvertise?.(joyTopic);
    };
  }, [context, canPublish, joyTopic]);

  useLayoutEffect(() => {
    if (!canPublish || !joyTopic || publishRate <= 0) {
      return;
    }
    const intervalMs = 1000 / publishRate;
    const tick = () => {
      const cfg = configRef.current;
      const snap = getActiveSnapshot();
      const axes = applyDeadzone(snap?.axes ?? [], cfg.axisMap, cfg.deadzone, cfg.axes);
      const buttons = clipButtons(snap?.buttons ?? [], cfg.buttonMap, cfg.buttons);
      context.publish?.(joyTopic, {
        header: { stamp: nowStamp(), frame_id: cfg.frameId },
        axes,
        buttons,
      });
    };
    tick();
    const handle = setInterval(tick, intervalMs);
    return () => {
      clearInterval(handle);
    };
  }, [context, canPublish, joyTopic, publishRate, getActiveSnapshot]);

  // Heartbeat advertise + publish loop
  const heartbeat = config.heartbeat;
  const heartbeatActive =
    canPublish && heartbeat.enabled && heartbeat.topic !== "" && heartbeat.rate > 0;

  useLayoutEffect(() => {
    if (!heartbeatActive) {
      return;
    }
    context.advertise?.(heartbeat.topic, "std_msgs/Bool", { datatypes: BOOL_DATATYPES });
    return () => {
      context.unadvertise?.(heartbeat.topic);
    };
  }, [context, heartbeatActive, heartbeat.topic]);

  useLayoutEffect(() => {
    if (!heartbeatActive) {
      return;
    }
    const intervalMs = 1000 / heartbeat.rate;
    const send = () => {
      context.publish?.(heartbeat.topic, { data: true });
    };
    send();
    const handle = setInterval(send, intervalMs);
    return () => {
      clearInterval(handle);
    };
  }, [context, heartbeatActive, heartbeat.topic, heartbeat.rate]);

  useLayoutEffect(() => {
    renderDone();
  }, [renderDone]);

  const message = useMemo(() => {
    if (!canPublish) {
      return "Connect to a data source that supports publishing.";
    }
    if (!joyTopic) {
      return "Set a Joy topic in panel settings.";
    }
    return undefined;
  }, [canPublish, joyTopic]);

  return (
    <ThemeProvider isDark={colorScheme === "dark"}>
      <div
        style={{ height: "100%", width: "100%", display: "flex", flexDirection: "column" }}
        onPointerEnter={() => {
          setPanelActive(true);
        }}
        onPointerLeave={() => {
          setPanelActive(false);
        }}
      >
        <ArmedBanner armed={armedDisplay} hovered={panelActive} />
        <Stack fullHeight>
          {message != undefined ? (
            <Stack flex="auto" alignItems="center" justifyContent="center">
              <EmptyState>{message}</EmptyState>
            </Stack>
          ) : useVirtual ? (
            <VirtualJoystick ref={virtualRef} />
          ) : config.displayStyle === "mimic" ? (
            <GamepadMimic
              getSnapshot={getActiveSnapshot}
              preset={config.preset}
              deviceName={status}
              present={gamepad.present}
              deadzone={config.deadzone}
              manualInput={manualInput}
            />
          ) : (
            <ControllerVisualizer
              getSnapshot={getActiveSnapshot}
              axesCount={config.axes}
              buttonsCount={config.buttons}
              axisLabels={config.axisLabels}
              buttonLabels={config.buttonLabels}
              deviceName={status}
              present={gamepad.present}
            />
          )}
        </Stack>
      </div>
    </ThemeProvider>
  );
}

// Tiny status strip at the top of the panel — green dot + "ARMED" while
// Space is held, faded "Hold Space to arm" hint while just hovered. Stays
// out of the way otherwise.
function ArmedBanner({ armed, hovered }: { armed: boolean; hovered: boolean }): JSX.Element {
  if (!hovered && !armed) {
    return <div style={{ height: 0 }} />;
  }
  const text = armed ? "ARMED — virtual deadman held" : "Hold Space to arm virtual input";
  const bg = armed ? "rgba(46, 160, 67, 0.85)" : "rgba(120, 120, 120, 0.55)";
  return (
    <div
      style={{
        background: bg,
        color: "#fff",
        fontSize: 11,
        padding: "2px 8px",
        textAlign: "center",
        fontFamily: "monospace",
        userSelect: "none",
        letterSpacing: 0.5,
      }}
    >
      {text}
    </div>
  );
}

export default JoyTeleopPanel;
