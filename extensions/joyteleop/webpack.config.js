// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// Webpack config for the JoyTeleop Foxglove extension.
//
// Bundles src/index.ts (and everything it transitively imports — including
// JoyTeleopPanel + studio-base internals + MUI + emotion etc.) into a single
// dist/extension.js. React, react-dom, and @foxglove/studio are externalized
// because the host page already provides them at runtime; bundling them
// would duplicate React across the host and the extension and break hooks.
//
// The output is consumed by ./scripts/package-foxe.mjs which zips dist/ +
// package.json into a .foxe file. The Dockerfile then COPYs that .foxe into
// /src/extensions/builtin/ where BuiltinExtensionLoader picks it up.

const path = require("path");

module.exports = {
  target: "web",
  entry: "./src/index.tsx",
  output: {
    path: path.resolve(__dirname, "dist"),
    filename: "extension.js",
    libraryTarget: "commonjs2",
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".jsx"],
    alias: {
      // Mirror the alias studio-base/webpack.ts uses for in-host builds, so
      // deep imports like "@foxglove/studio-base/components/Stack" resolve
      // to packages/studio-base/src/components/Stack.tsx instead of trying
      // to follow the workspace package's main entry.
      "@foxglove/studio-base": path.resolve(__dirname, "../../packages/studio-base/src"),
    },
  },
  module: {
    rules: [
      {
        test: /\.(ts|tsx)$/,
        exclude: /node_modules/,
        use: {
          loader: "ts-loader",
          options: {
            transpileOnly: true,
            compilerOptions: {
              // ts-loader is the only TS compiler in this build; make sure it
              // emits JSX as React calls regardless of the workspace's root
              // tsconfig (which says "noEmit": true).
              jsx: "react-jsx",
              noEmit: false,
              module: "esnext",
              moduleResolution: "node",
              target: "es2020",
            },
          },
        },
      },
      {
        test: /\.(png|jpg|gif|svg)$/,
        type: "asset/inline",
      },
      {
        test: /\.css$/,
        use: ["style-loader", "css-loader"],
      },
    ],
  },
  externals: {
    // Provided by the Foxglove host at runtime — bundling them would cause
    // multiple React copies and broken hook semantics.
    react: "react",
    "react-dom": "react-dom",
    "@foxglove/studio": "@foxglove/studio",
  },
  performance: {
    // The extension bundle is large because it pulls in studio-base internals
    // (Stack, EmptyState, ThemeProvider) and their MUI/emotion deps. That's
    // expected for a panel originally written against studio-base internals;
    // silence webpack's default "asset too big" warnings.
    hints: false,
  },
};
