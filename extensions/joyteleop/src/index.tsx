// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/

// JoyTeleop Foxglove extension entry point.
//
// Self-contained: the panel and its dependencies live under src/ and the
// bundle pulls in MUI/emotion/tss-react. react / react-dom / @foxglove/extension
// are externalized (provided by the host at runtime — see webpack.config.js) so
// the bundle stays interoperable with whatever React the host pins.

import { ExtensionContext, PanelExtensionContext } from "@foxglove/extension";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import JoyTeleopPanel from "./panel/JoyTeleopPanel";

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
