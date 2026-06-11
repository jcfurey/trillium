// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { CompressedImage, RawImage } from "@foxglove/schemas";
import { PartialMessage } from "@foxglove/studio-base/panels/ThreeDeeRender/SceneExtension";

import { normalizeByteArray, normalizeHeader, normalizeTime } from "../../normalizeMessages";
import { Image as RosImage, CompressedImage as RosCompressedImage } from "../../ros";

function normalizeImageData(data: Int8Array): Int8Array;
function normalizeImageData(data: PartialMessage<Uint8Array> | undefined): Uint8Array;
function normalizeImageData(data: unknown): Int8Array | Uint8Array;
function normalizeImageData(data: unknown): Int8Array | Uint8Array {
  if (data == undefined) {
    return new Uint8Array(0);
  } else if (data instanceof Int8Array || data instanceof Uint8Array) {
    return data;
  } else {
    return new Uint8Array(0);
  }
}

/**
 * Verify that a raw image's data buffer length matches its declared dimensions. Without this,
 * a malformed message (data missing, or stride/dimensions wrong) silently feeds an empty/short
 * buffer into the decoder, which then writes garbage pixels to the output. Throw instead so the
 * existing setImage error path shows a useful diagnostic.
 *
 * Skips the empty-default case (step×height === 0) so test fixtures and not-yet-populated
 * messages still pass through.
 */
function assertRawImageDataLength(
  data: Int8Array | Uint8Array,
  step: number,
  height: number,
  encoding: string,
): void {
  const expected = step * height;
  if (expected !== 0 && data.byteLength !== expected) {
    throw new Error(
      `Image data length (${data.byteLength} bytes) does not match step × height ` +
        `(${step} × ${height} = ${expected} bytes) for encoding "${encoding}"`,
    );
  }
}

export function normalizeRosImage(message: PartialMessage<RosImage>): RosImage {
  const height = message.height ?? 0;
  const width = message.width ?? 0;
  const encoding = message.encoding ?? "";
  const step = message.step ?? 0;
  const data = normalizeImageData(message.data);
  assertRawImageDataLength(data, step, height, encoding);
  return {
    header: normalizeHeader(message.header),
    height,
    width,
    encoding,
    is_bigendian: message.is_bigendian ?? false,
    step,
    data,
  };
}

export function normalizeRosCompressedImage(
  message: PartialMessage<RosCompressedImage>,
): RosCompressedImage {
  return {
    header: normalizeHeader(message.header),
    format: message.format ?? "",
    data: normalizeByteArray(message.data),
  };
}

export function normalizeRawImage(message: PartialMessage<RawImage>): RawImage {
  const height = message.height ?? 0;
  const width = message.width ?? 0;
  const encoding = message.encoding ?? "";
  const step = message.step ?? 0;
  const data = normalizeImageData(message.data);
  assertRawImageDataLength(data, step, height, encoding);
  return {
    timestamp: normalizeTime(message.timestamp),
    frame_id: message.frame_id ?? "",
    height,
    width,
    encoding,
    step,
    data,
  };
}

export function normalizeCompressedImage(
  message: PartialMessage<CompressedImage>,
): CompressedImage {
  return {
    timestamp: normalizeTime(message.timestamp),
    frame_id: message.frame_id ?? "",
    format: message.format ?? "",
    data: normalizeByteArray(message.data),
  };
}
