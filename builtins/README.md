# Built-in Trillium extensions

`.foxe` files served at `/extensions/builtin/` are auto-registered by
`BuiltinExtensionLoader` on every browser session — no per-client install.
`extensions/build_extensions.sh` assembles that directory from two sources:

1. **In-tree extensions** under `trillium/extensions/<name>/` — anything with
   a `package.json` + `package` script is built during the bundle build. Its
   `.foxe` is baked in as a builtin unless the marketplace registry lists it
   (an entry whose `foxe` is `extensions/<name>.foxe`), in which case it is
   served as a marketplace extension instead.

2. **Prebuilt drops** staged here (`trillium/builtins/`) — for `.foxe`
   files whose sources don't live in this repo, populated by host-side
   build scripts that fetch a release artifact and drop it here. The
   `.foxe` files and `index.json` are gitignored.

`index.json` is regenerated at build time from whatever `.foxe` files
actually landed in the bundle — there's no manifest to keep in sync by hand.
