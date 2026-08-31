# ioBroker Govee Aurora adapter

This experimental adapter controls one Govee H6093 Star Light Projector
directly over the local network. It uses no cloud service, multicast, or
discovery. Each adapter instance targets exactly one configured IPv4 address.

The H6093 scene protocol is undocumented and was reverse engineered from
Govee Home Tap-to-Run payloads. UDP commands do not normally receive an
acknowledgement, so a successful send only confirms that the local operating
system accepted the datagram.

## Configuration

Configure the projector's fixed IPv4 address. The default UDP control port is
`4003`. A DHCP reservation is recommended so that the address does not change.

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

## Current limitations

- No discovery, multicast, cloud access, or state polling.
- The predefined-scene library is static and must be updated with the adapter.
- Predefined scenes are replayed as opaque captured payloads. Their individual
  parameters are intentionally not exposed as ioBroker objects.
- Scene sends use a known working captured DIY activation frame whose internal
  activation bytes remain undocumented.
- There is no device acknowledgement for successful UDP scene commands.
