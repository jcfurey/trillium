// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

import { McapTypes } from "@mcap/core";

// Per-chunk decompression cap. The MCAP chunk header carries an attacker-controlled
// "decompressedSize" that we previously passed straight to the WASM decompressor; a malicious
// or truncated file claiming hundreds of GB would force WASM to attempt the allocation, which
// crashes the tab on most browsers. 256 MB comfortably fits any legitimate single chunk
// (Foxglove's recommended chunk size is ~4 MB) without imposing a cap a real-world bag would hit.
const MAX_DECOMPRESSED_CHUNK_BYTES = 256 * 1024 * 1024;

function checkDecompressedSize(algo: string, decompressedSize: bigint): number {
  if (decompressedSize < 0n || decompressedSize > BigInt(MAX_DECOMPRESSED_CHUNK_BYTES)) {
    throw new Error(
      `MCAP ${algo} chunk reports an unreasonable decompressedSize (${decompressedSize} bytes; ` +
        `max ${MAX_DECOMPRESSED_CHUNK_BYTES}). The file is likely truncated or malformed.`,
    );
  }
  return Number(decompressedSize);
}

let handlersPromise: Promise<McapTypes.DecompressHandlers> | undefined;
export async function loadDecompressHandlers(): Promise<McapTypes.DecompressHandlers> {
  return await (handlersPromise ??= _loadDecompressHandlers());
}

// eslint-disable-next-line no-underscore-dangle
async function _loadDecompressHandlers(): Promise<McapTypes.DecompressHandlers> {
  const [decompressZstd, decompressLZ4, bzip2] = await Promise.all([
    import("@foxglove/wasm-zstd").then(async (mod) => {
      await mod.isLoaded;
      return mod.decompress;
    }),
    import("@foxglove/wasm-lz4").then(async (mod) => {
      await mod.default.isLoaded;
      return mod.default;
    }),
    import("@foxglove/wasm-bz2").then(async (mod) => await mod.default.init()),
  ]);

  return {
    lz4: (buffer, decompressedSize) =>
      decompressLZ4(buffer, checkDecompressedSize("lz4", decompressedSize)),

    bz2: (buffer, decompressedSize) =>
      bzip2.decompress(buffer, checkDecompressedSize("bz2", decompressedSize), { small: false }),

    zstd: (buffer, decompressedSize) =>
      decompressZstd(buffer, checkDecompressedSize("zstd", decompressedSize)),
  };
}
