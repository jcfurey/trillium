// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { MessageDefinition } from "@foxglove/message-definition";
import { ros2jazzy } from "@foxglove/rosmsg-msgs-common";

// Hand-written MessageDefinitions for the joystick_interfaces package
// (https://github.com/jcfurey/intrepid_ws/tree/main/src/packages/system/joystick_library/joystick_interfaces).
// These types aren't shipped in @foxglove/rosmsg-msgs-common, so the panel
// has to declare them in-band when it advertises a topic.

const Joystick: MessageDefinition = {
  name: "joystick_interfaces/Joystick",
  definitions: [
    { name: "index", type: "int32", isArray: false },
    { name: "name", type: "string", isArray: false },
    { name: "serial", type: "string", isArray: false },
    { name: "guid", type: "string", isArray: false },
    { name: "axes", type: "float32", isArray: true },
    { name: "axis_labels", type: "string", isArray: true },
    { name: "buttons", type: "int32", isArray: true },
    { name: "button_labels", type: "string", isArray: true },
  ],
};

const JoystickList: MessageDefinition = {
  name: "joystick_interfaces/JoystickList",
  definitions: [
    { name: "header", type: "std_msgs/Header", isComplex: true, isArray: false },
    { name: "host_id", type: "string", isArray: false },
    { name: "joysticks", type: "joystick_interfaces/Joystick", isComplex: true, isArray: true },
  ],
};

const JoystickFeedback: MessageDefinition = {
  name: "joystick_interfaces/JoystickFeedback",
  definitions: [
    { name: "TYPE_LED", type: "uint8", isConstant: true, value: 0, valueText: "0" },
    { name: "TYPE_RUMBLE", type: "uint8", isConstant: true, value: 1, valueText: "1" },
    { name: "TYPE_BUZZER", type: "uint8", isConstant: true, value: 2, valueText: "2" },
    { name: "name", type: "string", isArray: false },
    { name: "serial", type: "string", isArray: false },
    { name: "guid", type: "string", isArray: false },
    { name: "type", type: "uint8", isArray: false },
    { name: "intensity", type: "float32", isArray: true },
    { name: "duration", type: "float32", isArray: false },
  ],
};

const JoystickFeedbackList: MessageDefinition = {
  name: "joystick_interfaces/JoystickFeedbackList",
  definitions: [
    { name: "header", type: "std_msgs/Header", isComplex: true, isArray: false },
    { name: "host_id", type: "string", isArray: false },
    {
      name: "feedbacks",
      type: "joystick_interfaces/JoystickFeedback",
      isComplex: true,
      isArray: true,
    },
  ],
};

// Datatype maps to pass to context.advertise / context.subscribe. Both maps
// pull std_msgs/Header (and its builtin_interfaces/Time dep) from the
// shared rosmsg-msgs-common bundle so the wire encoding stays consistent
// with the rest of the studio.
export const JOYSTICK_LIST_DATATYPES: ReadonlyMap<string, MessageDefinition> = new Map<
  string,
  MessageDefinition
>([
  ["builtin_interfaces/Time", ros2jazzy["builtin_interfaces/Time"]],
  ["std_msgs/Header", ros2jazzy["std_msgs/Header"]],
  ["joystick_interfaces/Joystick", Joystick],
  ["joystick_interfaces/JoystickList", JoystickList],
]);

export const JOYSTICK_FEEDBACK_LIST_DATATYPES: ReadonlyMap<string, MessageDefinition> = new Map<
  string,
  MessageDefinition
>([
  ["builtin_interfaces/Time", ros2jazzy["builtin_interfaces/Time"]],
  ["std_msgs/Header", ros2jazzy["std_msgs/Header"]],
  ["joystick_interfaces/JoystickFeedback", JoystickFeedback],
  ["joystick_interfaces/JoystickFeedbackList", JoystickFeedbackList],
]);

// JoystickFeedback constants exported for the rumble dispatcher.
export const FEEDBACK_TYPE_LED = 0;
export const FEEDBACK_TYPE_RUMBLE = 1;
export const FEEDBACK_TYPE_BUZZER = 2;

// Schema names match what the panel passes as the second arg to
// context.advertise / what consumers will see in `Topic.schemaName`.
export const JOYSTICK_LIST_SCHEMA = "joystick_interfaces/JoystickList";
export const JOYSTICK_FEEDBACK_LIST_SCHEMA = "joystick_interfaces/JoystickFeedbackList";

// TypeScript shapes for the messages the panel constructs at runtime.
// Mirrors the .msg layout above; no ROS-specific wrapper.
export type JoystickMsg = {
  index: number;
  name: string;
  serial: string;
  guid: string;
  axes: number[];
  axis_labels: string[];
  buttons: number[];
  button_labels: string[];
};

export type JoystickListMsg = {
  header: { stamp: { sec: number; nanosec: number }; frame_id: string };
  host_id: string;
  joysticks: JoystickMsg[];
};

export type JoystickFeedbackMsg = {
  name: string;
  serial: string;
  guid: string;
  type: number;
  intensity: number[];
  duration: number;
};

export type JoystickFeedbackListMsg = {
  header: { stamp: { sec: number; nanosec: number }; frame_id: string };
  host_id: string;
  feedbacks: JoystickFeedbackMsg[];
};
