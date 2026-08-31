# Govee H6093 local UDP protocol notes

> **Status:** Experimental, reverse engineered from Govee Home Android
> Tap-to-Run payloads for the H6093 Star Light Projector. This is not an
> official Govee specification.

This document describes the local scene protocol used by the adapter. Fields
marked **confirmed** were varied independently in the Govee Home DIY editor
and compared in captured payloads. **Unknown** fields are retained from known
working payloads but their meaning is not yet known.

## Transport and JSON envelope

Send a UTF-8 JSON datagram to the projector IPv4 address, UDP port `4003`:

```json
{"msg":{"cmd":"ptReal","data":{"command":["<Base64 20-byte frame>"]}}}
```

`command` contains the full ordered frame sequence. The H6093 normally does
not reply to scene datagrams; a successful send only confirms local delivery
to the UDP stack.

The standard LAN commands used for global controls are:

```json
{"msg":{"cmd":"turn","data":{"value":1}}}
{"msg":{"cmd":"brightness","data":{"value":75}}}
```

Power uses `0`/`1`; brightness is `0`–`100`.

## Frame and checksum

Every frame is 20 bytes long.

| Bytes | Meaning |
| --- | --- |
| `0x00` | Frame family: `0xA3` extended scene data or `0x33` activation |
| `0x01` | A3 fragment marker or `0x33` command byte |
| `0x02`–`0x12` | Frame-specific payload (17 bytes) |
| `0x13` | XOR checksum |

The final byte equals the XOR of every preceding byte (`0x00` through `0x12`).

## DIY scene frame sequence

A complete generated DIY scene has these frames, in order:

1. One first frame, `A3 00`.
2. Zero or more continuation frames, `A3 01`, `A3 02`, ...
3. One mandatory terminal frame, `A3 FF`.
4. One `33 05` activation frame.

The first A3 frame has a six-byte header and stores 13 variable stream bytes
at offsets `0x06`–`0x12`. Continuation and terminal frames store 17 stream
bytes at offsets `0x02`–`0x12`. Unused terminal bytes are zero padded. The
terminal frame is still sent when a continuation frame ended exactly on the
last stream byte. This is the known **DIY** layout; predefined scenes can use
a different A3 header and additional opaque data.

### First A3-frame header

| Offset | Field / value | Status |
| --- | --- | --- |
| `0x00` | `0xA3` extended scene data | Confirmed |
| `0x01` | `0x00` first-fragment marker | Confirmed |
| `0x02` | `0x01` | Unknown, observed constant |
| `0x03` | Number of A3 frames, including first and terminal | Confirmed |
| `0x04` | `0x58` | Unknown, observed constant |
| `0x05` | `0x01` | Unknown, observed constant |
| `0x06` | Variable-data length, low byte | Confirmed |
| `0x07` | Variable-data length, high byte | Strongly inferred (little endian) |

The variable-data length includes its two own bytes. With the known layout it
is:

```text
21 + 3 × waveColorCount + 3 × lightFlowColorCount
```

Both colour lists support one through eight RGB triples. All observed streams
were shorter than 256 bytes, so the high byte has not been independently
verified with a large payload.

## Variable scene-data stream

Offsets below are offsets within the variable stream. Stream offsets `0x00`
through `0x0C` occupy first-frame offsets `0x06` through `0x12`; further bytes
continue at offset `0x02` of continuation frames.

| Stream offset | Field | Range / values | Status |
| --- | --- | --- | --- |
| `0x00`–`0x01` | Variable-data length, little endian | See above | Confirmed / inferred |
| `0x02` | Aurora motor / movement speed | `0`–`100` | Confirmed |
| `0x03` | Aurora flow direction | `0` down, `1` up | Confirmed |
| `0x04` | Aurora/effect field | Observed constant `2` | Unknown |
| `0x05` | Aurora wave enabled | `0` off, `1` on | Confirmed |
| `0x06` | Aurora wave relative brightness | `0`–`100` | Confirmed |
| `0x07` | Aurora wave mode | `1`–`4`, table below | Confirmed |
| `0x08` | Aurora wave speed | `0`–`100` | Confirmed |
| `0x09` | Aurora wave colour count | `1`–`8` | Confirmed |
| following | Aurora wave colours | `count` RGB triples | Confirmed |
| following | Light-flow enabled | `0` off, `1` on | Confirmed |
| following | Light-flow relative brightness | `0`–`100` | Confirmed |
| following | Light-flow mode | `1`–`4`, table below | Confirmed |
| following | Light-flow speed | `0`–`100` | Confirmed |
| following | Light-flow colour count | `1`–`8` | Confirmed |
| following | Light-flow colours | `count` RGB triples | Confirmed |
| following | Laser stars enabled | `0` off, `1` on | Confirmed |
| following | Laser stars relative brightness | `0`–`100` | Confirmed |
| following | Laser stars blinking enabled | `0` off, `1` on | Confirmed |
| following | Laser stars blinking rate | `0`–`100` | Confirmed |
| following | Laser stars orbit enabled | `0` off, `1` on | Confirmed |
| following | Laser stars orbit speed | `0`–`100` | Confirmed |

There are no confirmed separator bytes between the colour lists. Values after
the wave-colour list are ordinary light-flow fields, not an inter-sequence
marker.

### Mode IDs

| ID | Protocol mode |
| --- | --- |
| `1` | Gradient |
| `2` | Breathing |
| `3` | Rainbow |
| `4` | Twinkle |

The Govee Home UI may order Rainbow and Twinkle differently from their numeric
protocol IDs.

## Activation frame

The variable stream is followed by this captured working activation template:

```text
33 05 0A 9E 00 <music-id> 00 00 00 00 00 00 00 00 00 00 00 00 00 <xor>
```

| Offset | Field | Status |
| --- | --- | --- |
| `0x00` | `0x33`, standard Govee command frame | Confirmed family |
| `0x01` | `0x05`, effect/activation command | Confirmed use |
| `0x02`–`0x03` | `0x0A 0x9E` | Unknown; copied from working capture |
| `0x04` | `0x00` | Unknown / observed constant |
| `0x05` | Music ID | Confirmed writable field |
| `0x06`–`0x12` | Zero padding | Observed / retained |
| `0x13` | XOR checksum | Confirmed |

The music ID is sent with a scene, but it is not a known independent command
for starting or stopping app music playback.

## Reference payload: `te1`

This captured DIY scene is the adapter's byte-for-byte regression reference:

- Aurora: speed `14`, direction down.
- Wave: on, brightness `20`, gradient, speed `24`, green then blue.
- Light flow: on, brightness `34`, gradient, speed `50`, white.
- Stars: on, brightness `9`, blinking on/rate `7`, orbit on/speed `9`.
- Music ID `0`.

```text
A3 00 01 03 58 01 1E 00 0E 00 02 01 14 01 18 02 00 FF 00 1B
A3 01 00 00 FF 01 22 01 32 01 FF FF FF 01 09 01 07 01 09 B5
A3 FF 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 5C
33 05 0A 9E 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00 A2
```

## Predefined scenes

Predefined Govee Home scenes can contain additional or differently structured
data that has not been completely decoded. They are kept in
`data/H6093-predefined_scenes.json` and replayed unchanged. The adapter only
validates that each Base64 entry decodes to exactly 20 bytes and has a valid
XOR checksum.

Do not rebuild predefined scenes from the DIY field model: this could omit
unknown effect data. Conversely, a captured predefined scene may not map
one-to-one to editable DIY fields.

## Known limits

- No reliable local discovery or state read-back is implemented.
- The first-frame constants `0x02`, `0x04`, and `0x05` remain unknown.
- Activation-frame bytes `0x02`–`0x04` remain unknown.
- No standalone command for changing a single scene field has been proven;
  the working method sends the complete A3 scene sequence and activation frame.
