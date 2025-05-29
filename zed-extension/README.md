# Zed extension to run TJS language server

### For now, to get it setup locally for development
We need to change launch command in `src/lib.rs` to not be the absolute path to the language server file (didn't manage to get it working when running command in path, so pointing it directly to the file for now).

Symlink the `zed-extension` folder to `~/.local/share/zed/extensions/tjs`.

Run `cargo build` to build the extension.

Now should show up among extensions in Zed

Add the server to your configuration file (this one overrides to only use tjs language server for javascript)
```
  "languages": {
    "JavaScript": {
      "language_servers": ["tjs"]
    }
  }
```

Restart Zed, to debug the extension, open the command "open language server logs" select "tjs" for the workspace/window you have open.

If you can't see the server in that list, probably there was an issue starting the actual language server. Check the zed logs `zed: open log` for any issues regardning the tjs server.
