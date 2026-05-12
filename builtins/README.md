# Built-in Trillium extensions

`.foxe` files staged here are baked into the served bundle by the
`trillium/Dockerfile` (`COPY builtins/ /src/extensions/`) and auto-registered
by `BuiltinExtensionLoader` on every browser session — no per-client install.

The directory is populated by build scripts (e.g.
`scripts/utilities/build_cloudini_foxe.sh`); the `.foxe` files and
`index.json` are gitignored.
