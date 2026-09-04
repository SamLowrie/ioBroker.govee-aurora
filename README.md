# ioBroker Govee Aurora adapter

This experimental adapter controls one Govee H6093 Star Light Projector
directly over the local network. It uses no cloud service, multicast, or
discovery. Each adapter instance targets exactly one configured IPv4 address.
The plugin will **only** work for the H6093 Aurora Star Light Projector,
all other Hardware will most certainly fail.

The H6093 scene protocol is undocumented and was reverse engineered from
Govee Home Tap-to-Run payloads. UDP commands do not normally receive an
acknowledgement, so a successful send only confirms that the local operating
system accepted the datagram.

This project is mainly AI written. I (SmaLowrie) decoded the protocol with
the help and tools from AI. The ioBroker plugin itself is 100% written by
Codex Terra.

Motivation for the plugin has benn that the govee-local plugin lacks any features
and the govee-smart plugin does not seem to work together with the aurora-projector
and lacks features.

This plugin is by no way a complete implementation of the protocol or all features.
As as is, I hope someone will be happy to finally controll their aurora projector. 
Let me now!

## Configuration

Configure the projector's fixed IPv4 address. A DHCP reservation is recommended
so that the address does not change. The adapter always sends to the H6093's
fixed UDP control port `4003`; it does not listen on that port.

## Objects

- `global.power` sends a standard Govee LAN power command.
- `global.brightness` sends a standard Govee LAN brightness command.
- `global.autoPush` pushes the complete scene after every valid `scene.*`
  change. It is disabled by default.
- `global.predefinedScene` selects one of the 55 extracted Govee Home scenes.
  Changing the selection does not send anything.
- `commands.pushScene` is a trigger. Set it to `true` to build and send the
  complete scene. It returns to `false` automatically.
- `commands.pushPredefinedScene` sends the complete captured payload selected
  by `global.predefinedScene` and then returns to `false`.
- `scene.*` contains editable scene parameters only. Editing these values does
  not change global power or brightness.
- `scene.music.id` is written to byte `0x05` of the scene activation frame.
  `0` is sound off in the pushed scene; non-zero values are device-specific
  built-in sound IDs. It does not start or stop app music playback.
- `scene.music.selection` is synchronized with `scene.music.id` and provides
  the music list in the same thematic order as the Govee Home app. The extra
  state is necessary because JavaScript sorts purely numeric object keys and
  therefore cannot preserve the app order in the numeric ID dropdown.
- `commands.lastResult`, `commands.lastError`, and `commands.lastSent` provide
  local send diagnostics.

Both color states are JSON strings containing one to eight RGB triples:

```json
[[255,228,255],[255,255,255]]
```

Every component must be an integer from 0 through 255. The adapter derives the
color count from the array, rebuilds the variable-length A3 frame stream, and
recalculates all XOR checksums.

Modes are stored as numeric protocol IDs and exposed as dropdown values:

| ID | Mode |
| --- | --- |
| 1 | Gradient |
| 2 | Breathing |
| 3 | Rainbow |
| 4 | Twinkle |

## Install from GitHub (Custom URL)

Create a **public** GitHub repository named `ioBroker.govee-aurora` and push
this directory as its repository root. In ioBroker Admin, open the adapters
page, click the Octocat icon (**Install adapter from own URL**), select **ANY**,
and enter:

```text
https://github.com/<your-account>/ioBroker.govee-aurora.git
```

After installation, add an instance, enter the H6093 IPv4 address, save, and
restart the instance. The adapter does not need to be published on npm for this
GitHub custom-URL installation method.

## Local installation

Copy the complete `iobroker` directory to the ioBroker host. The most direct
development installation is performed from the ioBroker installation root:

```bash
cd /path/to/iobroker-adapter-source
npm test

cd /opt/iobroker
npm install /path/to/iobroker-adapter-source
iobroker upload govee-aurora
iobroker add govee-aurora
```

Alternatively, create an npm archive and pass it to the controller's custom
URL installer:

```bash
cd /path/to/iobroker
npm pack
iobroker url /path/to/iobroker/iobroker.govee-aurora-0.2.0.tgz --debug
iobroker add govee-aurora
```

Open the new adapter instance in the ioBroker Admin UI, enter the H6093 IPv4
address, save, and restart the instance.

## Development checks

```bash
npm run check
npm test
```

The protocol test includes a byte-for-byte comparison with the previously
captured `te1` DIY scene.

## Protocol documentation

The reverse-engineered local UDP protocol, including confirmed scene fields,
frame layout, checksums, and known limitations, is documented in
[docs/PROTOCOL.md](docs/PROTOCOL.md).

## Optional scripts

The adapter does not load or run the contents of [`scripts/`](scripts/).
It contains separately documented tools for protocol analysis and optional
JavaScript-adapter automations that users install manually.

## Current limitations

- No discovery, multicast, cloud access, or state polling.
- The predefined-scene library is static and must be updated with the adapter.
- Predefined scenes are replayed as opaque captured payloads. Their individual
  parameters are intentionally not exposed as ioBroker objects.
- Scene sends use a known working captured DIY activation frame whose internal
  activation bytes remain undocumented.
- There is no device acknowledgement for successful UDP scene commands.

## Changelog

### **WORK IN PROGRESS**
- (copilot) Adapter requires node.js >= 22 now

See [CHANGELOG.md](CHANGELOG.md).
