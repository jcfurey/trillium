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
  presetLabelsFor,
} from "./controllerPresets";
import { GamepadMimic } from "./GamepadMimic";
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
    },
  };

  return { general };
}

function applyDeadzone(values: readonly number[], deadzone: number, length: number): number[] {
  const out = new Array<number>(length).fill(0);
  for (let i = 0; i < length; i++) {
    const v = values[i] ?? 0;
    out[i] = Math.abs(v) < deadzone ? 0 : v;
  }
  return out;
}

function clipButtons(values: readonly number[], length: number): number[] {
  const out = new Array<number>(length).fill(0);
  for (let i = 0; i < length; i++) {
    // useGamepad now stores analog button values (0..1) so triggers can
    // smoothly fill the visualizer bars. Threshold at half-press for the
    // published binary Joy.buttons (matches what teleop_twist_joy expects
    // for deadman/turbo).
    out[i] = (values[i] ?? 0) > 0.5 ? 1 : 0;
  }
  return out;
}

function nowStamp(): { sec: number; nanosec: number } {
  const ms = Date.now();
  return { sec: Math.floor(ms / 1000), nanosec: (ms % 1000) * 1_000_000 };
}

// Apply preset on top of the current Config — preserves topic/heartbeat etc.,
// but overrides axes/buttons counts and labels with the preset's defaults.
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
    // the visualizer never sees `undefined` slots.
    const preset = CONTROLLER_PRESETS[merged.preset] ?? CONTROLLER_PRESETS[DEFAULT_PRESET];
    const { axisLabels, buttonLabels } = presetLabelsFor(preset.id, merged.axes, merged.buttons);
    return {
      ...merged,
      axisLabels: merged.axisLabels.map((l, i) => l ?? axisLabels[i] ?? `A${i}`),
      buttonLabels: merged.buttonLabels.map((l, i) => l ?? buttonLabels[i] ?? `B${i}`),
    };
  });

  const gamepad = useGamepad();
  const virtualRef = useRef<VirtualJoystickHandle | null>(null);

  // Stable ref into the latest gamepad reading so the settings action
  // handler (called on user click) can read live counts without a stale
  // closure on `gamepad`.
  const gamepadLiveRef = useRef(gamepad);
  gamepadLiveRef.current = gamepad;

  // forceVirtual is the only switch — when false, we always render the
  // visualizer (even with no pad detected, so it's obvious we're waiting on
  // the user-gesture wake-up). When true, the on-screen sticks take over
  // as the input source.
  const useVirtual = config.forceVirtual;
  const status = useVirtual
    ? "Virtual (on-screen)"
    : gamepad.present
    ? `Gamepad: ${gamepad.name ?? "connected"}`
    : "Waiting for gamepad input";

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
    if (action.action !== "update") {
      return;
    }
    const { path, value } = action.payload;
    setConfig((prev) => {
      // Preset change → reload counts + labels in one shot.
      if (path.length === 2 && path[0] === "general" && path[1] === "preset") {
        return applyPreset(prev, value as ControllerPresetId);
      }
      // axes/buttons count change → resize label arrays, padding new slots
      // from the active preset's defaults.
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

  const configRef = useRef(config);
  configRef.current = config;
  const useVirtualRef = useRef(useVirtual);
  useVirtualRef.current = useVirtual;

  // Snapshot accessor used by both the publish loop and the visualizer.
  const getActiveSnapshot = useCallback((): GamepadSnapshot | undefined => {
    if (useVirtualRef.current) {
      return virtualRef.current?.getSnapshot();
    }
    return gamepadLiveRef.current.getSnapshot();
  }, []);

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
      const axes = applyDeadzone(snap?.axes ?? [], cfg.deadzone, cfg.axes);
      const buttons = clipButtons(snap?.buttons ?? [], cfg.buttons);
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
    </ThemeProvider>
  );
}

export default JoyTeleopPanel;
