// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { useCallback, useEffect } from "react";

import { MessageEvent, PanelExtensionContext } from "@foxglove/studio";

import {
  FEEDBACK_TYPE_RUMBLE,
  JoystickFeedbackListMsg,
  JoystickFeedbackMsg,
} from "./joystickListDatatypes";

// Browser-side accessor for the live Gamepad refs. Returned objects
// expose vibrationActuator (when supported); they may be invalidated
// between polls so callers should dereference inside their own tick.
type GetLivePads = () => (Gamepad | undefined)[];

type Args = {
  context: PanelExtensionContext;
  enabled: boolean;
  topic: string;
  // Re-fetched each frame so a pad that connected after mount still
  // gets matched without re-running the subscribe effect.
  getLivePads: GetLivePads;
};

// Subscribes the panel to a JoystickFeedbackList topic and returns a
// `dispatchFrame(currentFrame)` callback that the panel's onRender
// hook is expected to call. Splitting subscribe (effect-managed) from
// dispatch (caller-driven) avoids fighting the main panel for ownership
// of context.onRender.
//
// Browser caveat: navigator.getGamepads()'s vibrationActuator is gated
// behind a recent user gesture in some browsers (Chromium honors it on
// any focused page; Firefox needs a button press). Failures are caught
// and silently ignored — there's no useful recovery from the panel.
export function useFeedbackSubscription({
  context,
  enabled,
  topic,
  getLivePads,
}: Args): {
  dispatchFrame: (currentFrame: readonly MessageEvent[] | undefined) => void;
  active: boolean;
} {
  const active = enabled && topic !== "";

  useEffect(() => {
    if (!active) {
      return;
    }
    // Schema definition for the incoming topic comes from the data
    // source layer (bag header / WebSocket-bridge advertise); the panel
    // doesn't need to declare it on subscribe — only on publish.
    context.subscribe([{ topic, preload: false }]);
    return () => {
      context.unsubscribeAll();
    };
  }, [context, active, topic]);

  const dispatchFrame = useCallback(
    (currentFrame: readonly MessageEvent[] | undefined) => {
      if (!active || !currentFrame) {
        return;
      }
      const live = getLivePads();
      for (const event of currentFrame) {
        if (event.topic !== topic) {
          continue;
        }
        const msg = event.message as JoystickFeedbackListMsg | undefined;
        const feedbacks = msg?.feedbacks;
        if (!feedbacks) {
          continue;
        }
        for (const fb of feedbacks) {
          if (fb.type !== FEEDBACK_TYPE_RUMBLE) {
            // LED / buzzer aren't expressible through the Gamepad API;
            // accept the message but skip it.
            continue;
          }
          rumbleMatchingPads(fb, live);
        }
      }
    },
    [active, topic, getLivePads],
  );

  return { dispatchFrame, active };
}

function rumbleMatchingPads(fb: JoystickFeedbackMsg, live: (Gamepad | undefined)[]): void {
  // Empty target name = wildcard, rumble every pad. Browser doesn't
  // surface serial / guid so those fields are accepted but ignored.
  const wildcard = fb.name === "" && fb.serial === "" && fb.guid === "";
  const strong = clamp01(fb.intensity[0] ?? 0);
  // joystick_library uses intensity[1] for the weak motor when present;
  // single-element messages drive both motors at the same magnitude.
  const weak = clamp01(fb.intensity[1] ?? fb.intensity[0] ?? 0);
  const duration = Math.max(0, fb.duration);
  for (const pad of live) {
    if (!pad) {
      continue;
    }
    if (!wildcard && fb.name !== "" && !pad.id.includes(fb.name)) {
      continue;
    }
    // vibrationActuator is a recent addition; not all browsers expose
    // it on all pads. Single try/catch covers both the missing-actuator
    // case and playEffect rejecting (e.g., not-allowed-without-gesture).
    try {
      const actuator: GamepadHapticActuator | undefined = pad.vibrationActuator;
      if (actuator && typeof actuator.playEffect === "function") {
        void actuator.playEffect("dual-rumble", {
          duration,
          strongMagnitude: strong,
          weakMagnitude: weak,
        });
      }
    } catch {
      // intentional no-op
    }
  }
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) {
    return 0;
  }
  if (v < 0) {
    return 0;
  }
  if (v > 1) {
    return 1;
  }
  return v;
}
