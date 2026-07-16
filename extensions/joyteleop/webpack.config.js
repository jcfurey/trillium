// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// Webpack config for the self-contained JoyTeleop Foxglove extension.
//
// Bundles src/index.tsx and everything it imports (the panel + vendored
// Stack/EmptyState/ThemeProvider + MUI/emotion/tss-react) into a single
// dist/extension.js. react, react-dom, and @foxglove/extension are
// externalized because the host page provides them at runtime; bundling them
// would duplicate React and break hooks. The output is zipped into a .foxe by
// `foxglove-extension package`.

const path = require("path");

module.exports = (_env, argv) => {
  const isDevelopment = argv.mode === "development";

  return {
    mode: argv.mode || "production",
    context: __dirname,
    entry: "./src/index.tsx",
    output: {
      path: path.resolve(__dirname, "dist"),
      filename: "extension.js",
      library: { type: "commonjs2" },
      devtoolModuleFilenameTemplate: "[absolute-resource-path]",
    },
    devtool: isDevelopment ? "eval-source-map" : "source-map",
    externals: {
      react: "commonjs react",
      "react-dom": "commonjs react-dom",
      "@foxglove/extension": "commonjs @foxglove/extension",
    },
    resolve: {
      extensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
    },
    module: {
      rules: [
        {
          test: /\.tsx?$/,
          exclude: /node_modules/,
          use: {
            loader: "ts-loader",
            options: {
              transpileOnly: true,
              compilerOptions: {
                jsx: "react-jsx",
                noEmit: false,
                sourceMap: true,
              },
            },
          },
        },
        {
          test: /\.css$/,
          use: ["style-loader", "css-loader"],
        },
        {
          test: /\.(png|jpg|jpeg|gif|svg)$/,
          type: "asset/inline",
        },
      ],
    },
    performance: { hints: false },
    optimization: { minimize: !isDevelopment, splitChunks: false },
    stats: { errorDetails: true },
  };
};
