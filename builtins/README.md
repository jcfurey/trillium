# Built-in Trillium extensions

`.foxe` files served at `/extensions/builtin/` are auto-registered by
`BuiltinExtensionLoader` on every browser session — no per-client install.
The Dockerfile assembles that directory from two sources:

1. **In-tree extensions** under `trillium/extensions/<name>/` — anything with
   a `package.json` + `package` script is built during the image build and
   the resulting `.foxe` is staged automatically. Adding one is just: drop
   a folder, give it a `package` script, rebuild the image.

2. **Prebuilt drops** staged here (`trillium/builtins/`) — for `.foxe`
   files whose sources don't live in this repo. Populated by host-side
   build scripts (e.g. `scripts/utilities/build_cloudini_foxe.sh`, which
   fetches a release artifact from upstream cloudini and drops it here).
   The `.foxe` files and `index.json` are gitignored.

`index.json` is regenerated at image-build time from whatever `.foxe`
files actually landed in the bundle — there's no manifest to keep in sync
by hand.
