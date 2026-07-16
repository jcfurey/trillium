// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// Copied from XENONFFM/foxglove-control-extension v1.0.0-beta.6 (MIT).
//   Copyright (c) 2024 Joshua Newans
//   Copyright (c) 2022 Ryan Govostes
// Incorporated into this MPL-2.0 panel; the upstream MIT terms continue
// to apply to this file's content.

import type * as React from "react";

import { ControllerRendererProps } from "../gamepadTypes";
import { getStickMotionStroke, getStickPressFill } from "../renderContext";

export function XboxController({ ctx }: ControllerRendererProps): React.ReactElement {
  const leftStickBaseX = 177;
  const leftStickBaseY = 211.6;
  const rightStickBaseX = 289;
  const rightStickBaseY = 256.2;
  const dpadCenterX = 213.1;
  const dpadCenterY = 258.9;

  return (
    <svg
      id="gamepad-svg"
      className="gamepad-viz"
      viewBox="96 112 308 252"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g id="Controller">
        <path
          id="Controller_Base"
          d="M351,172.4c-1-2.6-3.1-4.6-5.7-5.5l-32.5-12.3c-5.5-2.1-11.5-1.7-16.7,1l-8.4,4.4h-75.4l-8.3-4.4c-5.2-2.7-11.3-3.1-16.7-1l-32.6,12.3c-2.6,1-4.7,3-5.7,5.5l-2.5,6.2v34.4h207v-34.3L351,172.4z"
          fill="var(--gp-highlight)"
          stroke="var(--gp-base)"
          strokeWidth="2"
        />
        <g id="Highlights" fill="var(--gp-highlight)" stroke="var(--gp-base)" strokeWidth="2">
          <path
            id="Controller_outline"
            d="M360,184.4c-1.3-2.8-3.7-4.9-6.6-5.9l-38.3-12.8c-6-2-12.5-0.2-16.7,4.5L278.5,193c-1.2,1.4-3,2.2-4.9,2.3h-47.2c-1.9,0-3.7-0.8-4.9-2.3l-19.9-22.9c-4.1-4.7-10.7-6.5-16.7-4.5l-38.3,12.8c-2.9,1-5.3,3.1-6.6,5.9c-11.7,25-66.2,148.8-9.9,162c3.4,0.8,7-0.2,9.5-2.8l40.5-40.5c3.5-3.5,8.3-5.5,13.3-5.5h113.2c5,0,9.8,2,13.3,5.5l40.5,40.5c2.5,2.5,6.1,3.5,9.5,2.8C426.3,333.2,371.7,209.5,360,184.4z"
          />
        </g>
        <g id="Features">
          <line x1="212.3" y1="160" x2="204.8" y2="174.1" strokeWidth="2" stroke="var(--gp-base)" />
          <line x1="287.7" y1="160" x2="295.2" y2="174.1" strokeWidth="2" stroke="var(--gp-base)" />
        </g>
      </g>

      <g id="Buttons">
        <path
          id="l1"
          d="M146.4,178l2.422,-6.008c1,-2.5 3.1,-4.5 5.7,-5.5l32.6,-12.3c5.4,-2.1 11.5,-1.7 16.7,1l8.3,4.4l-7.394,13.904l-3.306,-3.804c-4.1,-4.7 -10.7,-6.5 -16.7,-4.5l-38.3,12.8c-0.008,0.003 -0.015,0.005 -0.022,0.008Z"
          fill={ctx.getButtonFill("l1")}
          stroke={ctx.getButtonColor("l1")}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          id="r1"
          d="M295.4,173.6l-7.423,-13.955l8.4,-4.4c5.2,-2.7 11.2,-3.1 16.7,-1l32.5,12.3c2.6,0.9 4.7,2.9 5.7,5.5l2.424,6.108c-0.008,-0.003 -0.016,-0.006 -0.024,-0.008l-38.3,-12.8c-6,-2 -12.5,-0.2 -16.7,4.5l-3.277,3.755Z"
          fill={ctx.getButtonFill("r1")}
          stroke={ctx.getButtonColor("r1")}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <circle
          id="view"
          cx="230.1"
          cy="211.5"
          r="6.6"
          fill={ctx.getButtonFill("view")}
          stroke={ctx.getButtonColor("view")}
          strokeWidth="2"
        />
        <circle
          id="menu"
          cx="269.9"
          cy="211.5"
          r="6.6"
          fill={ctx.getButtonFill("menu")}
          stroke={ctx.getButtonColor("menu")}
          strokeWidth="2"
        />
        <rect
          id="share"
          x="241.1"
          y="226.5"
          width="18"
          height="10"
          rx="5"
          fill={ctx.getButtonFill("share")}
          stroke={ctx.getButtonColor("share")}
          strokeWidth="2"
        />

        <circle
          cx="213.1"
          cy="258.9"
          r="19.15"
          fill={ctx.getButtonFill("dpad")}
          stroke={ctx.getButtonColor("dpad")}
          strokeWidth="2"
        />
        {/* Quadrant ids make the D-pad click-hittable (svgInteraction walks up
            from the event target looking for ids in SVG_BUTTON_INDEX), same as
            the DualSense/Generic visuals. */}
        <g id="dpad" transform={`translate(${dpadCenterX + 6}, ${dpadCenterY - 6})`}>
          <path
            id="up"
            d="M-12.005,-12.156c1.916,-0.644 3.968,-0.994 6.1,-0.994c2.058,0 4.041,0.325 5.9,0.928m-12,0.066l0,12.156l12,0l0,-12.222"
            fill={ctx.getButtonFill("up")}
            stroke={ctx.getButtonColor("up")}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            id="right"
            d="M12.156,0c0.644,1.916 0.994,3.968 0.994,6.1c0,2.058 -0.325,4.041 -0.928,5.9m-0.066,-12l-12.156,0l0,12l12.222,0"
            fill={ctx.getButtonFill("right")}
            stroke={ctx.getButtonColor("right")}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            id="down"
            d="M0,24.006c-1.916,0.644 -3.968,0.994 -6.1,0.994c-2.058,0 -4.041,-0.325 -5.9,-0.928m12,-0.066l-0,-12.156l-12,-0l0,12.222"
            fill={ctx.getButtonFill("down")}
            stroke={ctx.getButtonColor("down")}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            id="left"
            d="M-24.161,12c-0.644,-1.916 -0.994,-3.968 -0.994,-6.1c0,-2.058 0.325,-4.041 0.928,-5.9m0.066,12l12.156,-0l0,-12l-12.222,0"
            fill={ctx.getButtonFill("left")}
            stroke={ctx.getButtonColor("left")}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>

        <circle
          id="y"
          cx="323"
          cy="191.5"
          r="9.8"
          fill={ctx.getButtonFill("y")}
          stroke={ctx.getButtonColor("y")}
          strokeWidth="2"
        />
        <circle
          id="b"
          cx="343.1"
          cy="211.6"
          r="9.8"
          fill={ctx.getButtonFill("b")}
          stroke={ctx.getButtonColor("b")}
          strokeWidth="2"
        />
        <circle
          id="a"
          cx="323"
          cy="231.8"
          r="9.8"
          fill={ctx.getButtonFill("a")}
          stroke={ctx.getButtonColor("a")}
          strokeWidth="2"
        />
        <circle
          id="x"
          cx="302.8"
          cy="211.7"
          r="9.8"
          fill={ctx.getButtonFill("x")}
          stroke={ctx.getButtonColor("x")}
          strokeWidth="2"
        />

        <circle
          id="xbox"
          cx="250.1"
          cy="177.5"
          r="13"
          fill={ctx.getButtonFill("xbox")}
          stroke={ctx.getButtonColor("xbox")}
          strokeWidth="2"
        />

        <rect
          id="l2"
          x="160"
          y="130"
          width="40"
          height="12"
          rx="6"
          fill={ctx.getButtonFill("l2")}
          stroke={ctx.getButtonColor("l2")}
          strokeWidth="2"
        />
        <rect
          id="r2"
          x="300"
          y="130"
          width="40"
          height="12"
          rx="6"
          fill={ctx.getButtonFill("r2")}
          stroke={ctx.getButtonColor("r2")}
          strokeWidth="2"
        />
      </g>

      <g id="Axis">
        <g id="L3">
          <circle
            id="L3_infill"
            cx={leftStickBaseX}
            cy={leftStickBaseY}
            r="22.2"
            fill={getStickPressFill(ctx.lstickMagnitude, ctx.idleFill)}
            stroke={getStickMotionStroke(ctx.lstickMagnitude, ctx.idleOutline)}
            strokeWidth="2"
          />
          <circle
            id="L3_outline"
            cx={leftStickBaseX + ctx.lstickAxisX * 9}
            cy={leftStickBaseY + ctx.lstickAxisY * 9}
            r="13"
            fill={getStickPressFill(ctx.lPressed, ctx.idleFill)}
            stroke={getStickMotionStroke(ctx.lPressed, ctx.idleOutline)}
            strokeWidth="2"
          />
        </g>
        <g id="R3">
          <circle
            id="R3_infill"
            cx={rightStickBaseX}
            cy={rightStickBaseY}
            r="22.2"
            fill={getStickPressFill(ctx.rstickMagnitude, ctx.idleFill)}
            stroke={getStickMotionStroke(ctx.rstickMagnitude, ctx.idleOutline)}
            strokeWidth="2"
          />
          <circle
            id="R3_outline"
            cx={rightStickBaseX + ctx.rstickAxisX * 9}
            cy={rightStickBaseY + ctx.rstickAxisY * 9}
            r="13"
            fill={getStickPressFill(ctx.rPressed, ctx.idleFill)}
            stroke={getStickMotionStroke(ctx.rPressed, ctx.idleOutline)}
            strokeWidth="2"
          />
        </g>
      </g>
    </svg>
  );
}
