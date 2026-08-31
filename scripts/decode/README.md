# H6093 scene-analysis tools

These Python 3 tools help investigate the locally used Govee H6093 scene
format. They work with **Tap-to-Run** shortcuts from the Govee Home app. The
protocol is undocumented; confirmed fields and current limitations are in
[`../../docs/PROTOCOL.md`](../../docs/PROTOCOL.md).

`decode_h6093_scene.py` is deliberately read-only: it neither changes files
nor sends network traffic. `extract_h6093_tap_to_run.py` only downloads the
user's Govee Home configuration and writes the extracted payloads. Neither
tool controls the projector.

## Requirements

- Python 3.10 or newer. No third-party packages are needed.
- A Govee Home account with the H6093 configured.
- One Tap-to-Run shortcut per scene or snapshot that you want to inspect. The
  shortcut must target the H6093 directly.

Do not commit an extracted scene file if its scene names or payloads are
private. Never publish a Govee bearer token or password.

## 1. Extract Tap-to-Run payloads

First save each desired scene in a separate Govee Home shortcut. In the
English Govee Home app:

1. Open **Shortcuts** from the app's main navigation.
2. Select **+** to create a new shortcut.
3. Add an action for the **H6093 Star Light Projector**.
4. Select exactly one scene: either a built-in scene from **Scene** or one of
   your saved custom/DIY scenes.
5. Save the shortcut with a distinctive name, for example `test-wave-speed-50`.

Do not combine several devices or several actions in the same shortcut when
creating captures for analysis. The extractor finds H6093 `ptReal` commands
inside the shortcut configuration, but one scene per shortcut makes IDs,
names, and later byte comparisons unambiguous.

After creating or updating the shortcuts, run one of:

```bash
python3 extract_h6093_tap_to_run.py --email you@example.com --output my-scenes.json
python3 extract_h6093_tap_to_run.py --token '<bearer-token>' --output my-scenes.json
```

With `--email`, the password is requested without echoing it and is not stored
by the script. A bearer token avoids the password prompt but is equally
sensitive and may be visible in shell history; prefer the email option.

The output has the form:

```json
{"H6093":{"1001":{"name":"Example","cmd":["Base64 frame", "..."]}}}
```

IDs are local to that extraction and can change when shortcuts are added,
removed, or reordered. Use scene names only when they are unique; otherwise
use the listed ID.

## 2. Inspect and validate scenes

```bash
# List local IDs and names.
python3 decode_h6093_scene.py --scenes my-scenes.json --list

# Check frame size, XOR checksums, A3 fragment count, and DIY data length.
python3 decode_h6093_scene.py --scenes my-scenes.json --check

# Decode one scene by its local ID or exact name.
python3 decode_h6093_scene.py --scenes my-scenes.json --id 1001
python3 decode_h6093_scene.py --scenes my-scenes.json --name 'My scene'
```

The decoder shows every byte in hexadecimal and decimal, alongside a label.
`unknown` is intentional: it means that field has not yet been experimentally
identified for the H6093. The decoder validates every selected frame before
printing it and exits non-zero for malformed Base64, invalid frame size, or a
bad XOR checksum. For a predefined/extended layout it validates framing but
does not interpret the DIY length bytes, because those header positions have a
different meaning in such captures.

## Suggested decoding workflow

1. Start with a DIY scene and save a Tap-to-Run shortcut.
2. Duplicate it; alter **exactly one** setting in the Govee Home editor and
   save another shortcut.
3. Extract again, then decode both payloads.
4. Compare the frames and account for the changed XOR checksum at byte `19`.
5. Repeat with multiple values for the same setting before treating a byte as
   confirmed. Update `docs/PROTOCOL.md` with the observation and evidence.

The checked payload structure uses 20-byte frames and an XOR checksum in byte
`19`. A3 (`0xA3`) frames carry the variable scene stream; a final `0x33 0x05`
frame activates the captured scene. Predefined app scenes may include extra
data beyond the editable DIY layout, so preserve and replay them unchanged.

## Included example data

`H6093-scenes.json` is an existing captured scene library retained as a
reference input for the decoder. It is not generated during installation and
is never used by the adapter at runtime.
