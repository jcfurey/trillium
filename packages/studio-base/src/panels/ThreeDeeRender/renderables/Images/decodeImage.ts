// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import * as _ from "lodash-es";

import {
  decodeBGR8,
  decodeBGRA8,
  decodeBayerBGGR8,
  decodeBayerGBRG8,
  decodeBayerGRBG8,
  decodeBayerRGGB8,
  decodeFloat1c,
  decodeMono16,
  decodeMono8,
  decodeRGB8,
  decodeRGBA8,
  decodeUYVY,
  decodeYUYV,
} from "@foxglove/den/image";
import { RawImage } from "@foxglove/schemas";

import { CompressedImageTypes } from "./ImageTypes";
import { Image as RosImage } from "../../ros";
import { ColorModeSettings, getColorConverter } from "../colorMode";

export async function decodeCompressedImageToBitmap(
  image: CompressedImageTypes,
  resizeWidth?: number,
): Promise<ImageBitmap> {
  const bitmapData = new Blob([image.data], { type: `image/${image.format}` });
  return await createImageBitmap(bitmapData, { resizeWidth });
}

export const IMAGE_DEFAULT_COLOR_MODE_SETTINGS: Required<
  Omit<ColorModeSettings, "colorField" | "minValue" | "maxValue">
> = {
  colorMode: "gradient",
  flatColor: "#ffffff",
  gradient: ["#000000", "#ffffff"],
  colorMap: "turbo",
  explicitAlpha: 0,
};
const MIN_MAX_16_BIT = { minValue: 0, maxValue: 65535 };

/**
 * Downsample a 16-bit single-channel image to 8-bit by taking the high byte of each pixel.
 *
 * Used to support 16-bit Bayer encodings (bayer_rggb16, etc.) without writing dedicated
 * 16-bit Bayer demosaic code: convert to 8-bit first, then call the existing 8-bit decoder.
 * For visualization the lower 8 bits are not perceptually meaningful — image_pipeline does
 * the same shift when displaying high-bit-depth Bayer.
 *
 * Returns a tightly-packed Uint8Array (no row stride padding) and the new step (bytes per row,
 * which equals width since there's no padding).
 */
function downsample16To8(
  data: Uint8Array,
  width: number,
  height: number,
  step: number,
  is_bigendian: boolean,
): { data: Uint8Array; step: number } {
  if (step < width * 2) {
    throw new Error(`16-bit image row step (${step}) must be at least 2*width (${width * 2})`);
  }
  const out = new Uint8Array(width * height);
  const hiByteOffset = is_bigendian ? 0 : 1;
  for (let row = 0; row < height; row++) {
    const inRow = row * step;
    const outRow = row * width;
    for (let col = 0; col < width; col++) {
      out[outRow + col] = data[inRow + col * 2 + hiByteOffset]!;
    }
  }
  return { data: out, step: width };
}

export type RawImageOptions = ColorModeSettings;

/**
 * See also:
 * https://github.com/ros2/common_interfaces/blob/366eea24ffce6c87f8860cbcd27f4863f46ad822/sensor_msgs/include/sensor_msgs/image_encodings.hpp
 */
export function decodeRawImage(
  image: RosImage | RawImage,
  options: Partial<RawImageOptions>,
  output: Uint8ClampedArray,
): void {
  const { encoding, width, height, step } = image;
  const is_bigendian = "is_bigendian" in image ? image.is_bigendian : false;
  const rawData = image.data as Uint8Array;
  switch (encoding) {
    case "yuv422":
    case "uyvy":
      decodeUYVY(rawData, width, height, step, output);
      break;
    case "yuv422_yuy2":
    case "yuyv":
      decodeYUYV(rawData, width, height, step, output);
      break;
    case "rgb8":
      decodeRGB8(rawData, width, height, step, output);
      break;
    case "rgba8":
      decodeRGBA8(rawData, width, height, step, output);
      break;
    case "bgra8":
      decodeBGRA8(rawData, width, height, step, output);
      break;
    case "bgr8":
    case "8UC3":
      decodeBGR8(rawData, width, height, step, output);
      break;
    case "32FC1":
      decodeFloat1c(rawData, width, height, step, is_bigendian, output);
      break;
    case "bayer_rggb8":
      decodeBayerRGGB8(rawData, width, height, step, output);
      break;
    case "bayer_bggr8":
      decodeBayerBGGR8(rawData, width, height, step, output);
      break;
    case "bayer_gbrg8":
      decodeBayerGBRG8(rawData, width, height, step, output);
      break;
    case "bayer_grbg8":
      decodeBayerGRBG8(rawData, width, height, step, output);
      break;
    case "bayer_rggb16": {
      const ds = downsample16To8(rawData, width, height, step, is_bigendian);
      decodeBayerRGGB8(ds.data, width, height, ds.step, output);
      break;
    }
    case "bayer_bggr16": {
      const ds = downsample16To8(rawData, width, height, step, is_bigendian);
      decodeBayerBGGR8(ds.data, width, height, ds.step, output);
      break;
    }
    case "bayer_gbrg16": {
      const ds = downsample16To8(rawData, width, height, step, is_bigendian);
      decodeBayerGBRG8(ds.data, width, height, ds.step, output);
      break;
    }
    case "bayer_grbg16": {
      const ds = downsample16To8(rawData, width, height, step, is_bigendian);
      decodeBayerGRBG8(ds.data, width, height, ds.step, output);
      break;
    }
    case "mono8":
    case "8UC1":
      decodeMono8(rawData, width, height, step, output);
      break;
    case "mono16":
    case "16UC1": {
      // combine options with defaults. lodash merge makes sure undefined values in options are replaced with defaults
      // whereas a normal spread would allow undefined values to overwrite defaults
      const settings = _.merge({}, IMAGE_DEFAULT_COLOR_MODE_SETTINGS, MIN_MAX_16_BIT, options);
      if (settings.colorMode === "rgba-fields" || settings.colorMode === "flat") {
        throw Error(`${settings.colorMode} color mode is not supported for mono16 images`);
      }
      const min = settings.minValue;
      const max = settings.maxValue;
      const tempColor = { r: 0, g: 0, b: 0, a: 0 };
      const converter = getColorConverter(
        settings as ColorModeSettings & {
          colorMode: typeof settings.colorMode;
        },
        min,
        max,
      );
      decodeMono16(rawData, width, height, step, is_bigendian, output, {
        minValue: options.minValue,
        maxValue: options.maxValue,
        colorConverter: (value: number) => {
          converter(tempColor, value);
          return tempColor;
        },
      });
      break;
    }
    default:
      // Common ROS encodings the panel doesn't decode (yet): 16SC1, 32SC1, 32FC2/3/4, 64FC1,
      // 8UC2/4, 16UC2/3/4, multi-channel float images. cv_bridge supports them; this panel
      // would need per-format decoders or a generic float-channel viewer.
      throw new Error(
        `Unsupported image encoding "${encoding}". Supported: rgb8/rgba8, bgr8/bgra8, ` +
          `mono8/mono16, 8UC1/3, 16UC1, 32FC1, yuyv/uyvy, bayer_{rggb,bggr,gbrg,grbg}{8,16}.`,
      );
  }
}
