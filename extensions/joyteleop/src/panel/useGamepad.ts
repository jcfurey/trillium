// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// The single-pad polling hook this file used to export was superseded by
// useGamepadList — JoyTeleopPanel now enumerates every connected pad and
// publishes them in joystick_interfaces/JoystickList. The GamepadSnapshot
// type is retained as the shape consumed by the visualizers (GamepadMimic,
// ControllerVisualizer, VirtualJoystick, TriggerSliderOverlay), which all
// accept a `getSnapshot: () => GamepadSnapshot | undefined` callback.

export type GamepadSnapshot = {
  name: string;
  axes: readonly number[];
  buttons: readonly number[];
};
