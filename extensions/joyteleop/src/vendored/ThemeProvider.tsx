// This Source Code Form is subject to the terms of the Mozilla Public
// License, v2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/
//
// Self-contained theme provider for the standalone JoyTeleop extension.
//
// The extension renders into context.panelElement via its own React root
// (createRoot), so it does NOT inherit the host's MUI theme context — React
// context does not cross root boundaries. The panel therefore supplies its own
// MUI theme + emotion cache here. This is a minimal replacement for
// @foxglove/studio-base/theme/ThemeProvider that drops the fork-local
// @foxglove/theme and react-i18next dependencies; it provides stock MUI
// dark/light palettes plus the one custom token the panel uses
// (typography.fontMonospace).

import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { ThemeProvider as MuiThemeProvider, createTheme } from "@mui/material";
import { useEffect, useMemo } from "react";

declare module "@mui/material/styles" {
  interface TypographyVariants {
    fontMonospace: string;
  }
  interface TypographyVariantsOptions {
    fontMonospace?: string;
  }
}

const FONT_MONOSPACE = "'IBM Plex Mono', 'Roboto Mono', 'Courier New', monospace";

// prepend so MUI/emotion styles lose specificity ties to host styles, matching
// the upstream cache configuration.
const muiCache = createCache({ key: "joyteleop-mui", prepend: true });

export default function ThemeProvider({
  children,
  isDark,
}: React.PropsWithChildren<{ isDark: boolean }>): React.ReactElement {
  useEffect(() => {
    document.documentElement.setAttribute("data-color-mode", isDark ? "dark" : "light");
  }, [isDark]);

  const theme = useMemo(
    () =>
      createTheme({
        palette: { mode: isDark ? "dark" : "light" },
        typography: { fontMonospace: FONT_MONOSPACE },
      }),
    [isDark],
  );

  return (
    <CacheProvider value={muiCache}>
      <MuiThemeProvider theme={theme}>{children}</MuiThemeProvider>
    </CacheProvider>
  );
}
