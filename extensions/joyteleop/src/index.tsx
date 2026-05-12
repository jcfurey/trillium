// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// JoyTeleop Foxglove extension entry point.
//
// Wraps the existing in-tree JoyTeleopPanel (which is already written
// against PanelExtensionContext, the public extension API) so it can ship
// as a baked .foxe and be auto-registered by BuiltinExtensionLoader rather
// than hard-coded into studio-base's panels/index.ts.
//
// At build time webpack inlines JoyTeleopPanel and its transitive deps
// (studio-base internals, MUI, emotion, etc.) into a single bundle. At
// runtime react / react-dom / @foxglove/studio are supplied by the host
// page (see webpack.config.js externals) so the bundle stays interoperable
// with whatever React version the host pins.

import { ExtensionContext, PanelExtensionContext } from "@foxglove/studio";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import JoyTeleopPanel from "@foxglove/studio-base/panels/JoyTeleop/JoyTeleopPanel";

function initJoyTeleopPanel(context: PanelExtensionContext): () => void {
  const root = createRoot(context.panelElement);
  root.render(
    <StrictMode>
      <JoyTeleopPanel context={context} />
    </StrictMode>,
  );
  return () => {
    root.unmount();
  };
}

export function activate(extensionContext: ExtensionContext): void {
  extensionContext.registerPanel({
    name: "JoyTeleop",
    initPanel: initJoyTeleopPanel,
  });
}
