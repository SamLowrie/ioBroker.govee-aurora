#!/usr/bin/env python3
"""Decode and validate extracted Govee H6093 ptReal scene payloads.

This tool is read-only: it never changes a file and never sends UDP data.

Examples:
    python3 decode_h6093_scene.py --scenes H6093-tap-to-run-scenes.json --list
    python3 decode_h6093_scene.py --scenes H6093-tap-to-run-scenes.json --id 1001
    python3 decode_h6093_scene.py --scenes H6093-tap-to-run-scenes.json --check
"""

import argparse
import base64
import binascii
import json
import sys
from pathlib import Path


FRAME_SIZE = 20
MODE_NAMES = {1: "gradient", 2: "breathing", 3: "rainbow", 4: "twinkle"}


def xor_checksum(frame: bytes) -> int:
    value = 0
    for byte in frame[:-1]:
        value ^= byte
    return value


def load_scenes(path: Path) -> dict[str, dict]:
    """Load either {"H6093": {...}} or a directly nested scene mapping."""
    raw = json.loads(path.read_text(encoding="utf-8").replace("\\=", "="))
    if isinstance(raw, list) and len(raw) == 1:
        raw = raw[0]
    if not isinstance(raw, dict):
        raise ValueError("scene file must contain a JSON object")
    if isinstance(raw.get("H6093"), dict):
        raw = raw["H6093"]
    if not all(isinstance(value, dict) and "cmd" in value for value in raw.values()):
        raise ValueError("no H6093 scene mapping found")
    return raw


def find_scene(scenes: dict[str, dict], scene_id: str | None, name: str | None) -> tuple[str, dict]:
    if scene_id is not None:
        if scene_id not in scenes:
            raise ValueError(f"unknown scene ID: {scene_id}")
        return scene_id, scenes[scene_id]
    matches = [(key, scene) for key, scene in scenes.items()
               if str(scene.get("name", "")).casefold() == name.casefold()]
    if not matches:
        raise ValueError(f"no scene named {name!r}")
    if len(matches) > 1:
        ids = ", ".join(key for key, _ in matches)
        raise ValueError(f"scene name {name!r} is ambiguous; use --id ({ids})")
    return matches[0]


def decode_frames(scene: dict) -> list[bytes]:
    command = scene.get("cmd")
    if not isinstance(command, list) or not command:
        raise ValueError("scene has no non-empty command list")
    frames = []
    for index, encoded in enumerate(command, start=1):
        if not isinstance(encoded, str):
            raise ValueError(f"frame {index} is not a Base64 string")
        try:
            frame = base64.b64decode(encoded.strip('"'), validate=True)
        except binascii.Error as exc:
            raise ValueError(f"frame {index} is not valid Base64") from exc
        if len(frame) != FRAME_SIZE:
            raise ValueError(f"frame {index} has {len(frame)} bytes, expected {FRAME_SIZE}")
        if frame[-1] != xor_checksum(frame):
            raise ValueError(f"frame {index} has an invalid XOR checksum")
        frames.append(frame)
    return frames


def a3_frames(frames: list[bytes]) -> list[bytes]:
    """Return the contiguous A3 sequence at the start of a scene command."""
    result = []
    for frame in frames:
        if frame[0] != 0xA3:
            break
        result.append(frame)
    return result


def stream_locations(frames: list[bytes]) -> list[tuple[int, int]]:
    """Map variable-stream byte offsets to one-based frame and byte offsets."""
    a3 = a3_frames(frames)
    if not a3 or a3[0][1] != 0:
        return []
    locations = [(1, offset) for offset in range(0x06, 0x13)]
    for frame_number, frame in enumerate(a3[1:], start=2):
        locations.extend((frame_number, offset) for offset in range(0x02, 0x13))
    return locations


def location_annotations(frames: list[bytes]) -> dict[tuple[int, int], str]:
    """Return labels for confirmed fields of the currently known DIY layout."""
    annotations: dict[tuple[int, int], str] = {}
    a3 = a3_frames(frames)
    if not a3:
        return annotations

    first = a3[0]
    annotations.update({
        (1, 0x02): f"Unknown fixed A3 protocol/version field: {first[0x02]} (observed constant: 1)",
        (1, 0x03): f"Declared A3 frame count: {first[0x03]} (includes terminal A3 FF frame)",
    })
    if first[0x04] != 0x58 or first[0x05] != 0x01:
        annotations[(1, 0x04)] = f"Predefined/extended A3 format marker: 0x{first[0x04]:02X} (layout not decoded)"
        annotations[(1, 0x05)] = f"Predefined/extended A3 program field: {first[0x05]} (layout not decoded)"
        return annotations
    annotations[(1, 0x04)] = "DIY A3 format marker: 0x58"
    annotations[(1, 0x05)] = "DIY A3 program/variant field: 1"
    declared = first[0x06] | (first[0x07] << 8)
    annotations[(1, 0x06)] = f"Variable-data length, low byte: {first[0x06]} (little-endian value: {declared})"
    annotations[(1, 0x07)] = f"Variable-data length, high byte: {first[0x07]} (little-endian value: {declared})"

    locations = stream_locations(frames)
    values = [frames[frame - 1][offset] for frame, offset in locations]
    if len(values) < declared or declared < 10:
        return annotations
    values, locations = values[:declared], locations[:declared]

    def label(index: int, text: str) -> None:
        if index < len(locations):
            annotations[locations[index]] = text

    label(2, f"Aurora motor/movement speed: {values[2]}")
    label(3, f"Aurora flow direction: {'up' if values[3] else 'down'} ({values[3]})")
    label(4, f"Unknown Aurora/effect field: {values[4]} (observed constant: 2)")
    label(5, f"Aurora wave enabled: {'on' if values[5] else 'off'} ({values[5]})")
    label(6, f"Aurora wave relative brightness: {values[6]}")
    label(7, f"Aurora wave mode: {MODE_NAMES.get(values[7], 'unknown')} ({values[7]})")
    label(8, f"Aurora wave speed: {values[8]}")
    label(9, f"Aurora wave colour count: {values[9]} (supported range: 1..8)")

    def label_colours(start: int, count: int, title: str) -> None:
        components = ("red", "green", "blue")
        for item in range(count):
            rgb_start = start + 3 * item
            if rgb_start + 2 >= len(values):
                return
            rgb = values[rgb_start:rgb_start + 3]
            for component in range(3):
                label(rgb_start + component,
                      f"{title} colour {item + 1}/{count}, {components[component]} component "
                      f"(RGB {rgb[0]}, {rgb[1]}, {rgb[2]})")

    wave_count = values[9]
    wave_start = 10
    label_colours(wave_start, wave_count, "Aurora wave")
    flow_start = wave_start + 3 * wave_count
    if flow_start + 4 >= len(values):
        return annotations
    label(flow_start, f"Light-flow enabled: {'on' if values[flow_start] else 'off'} ({values[flow_start]})")
    label(flow_start + 1, f"Light-flow relative brightness: {values[flow_start + 1]}")
    label(flow_start + 2, f"Light-flow mode: {MODE_NAMES.get(values[flow_start + 2], 'unknown')} ({values[flow_start + 2]})")
    label(flow_start + 3, f"Light-flow speed: {values[flow_start + 3]}")
    flow_count_index = flow_start + 4
    flow_count = values[flow_count_index]
    label(flow_count_index, f"Light-flow colour count: {flow_count} (supported range: 1..8)")
    flow_colours_start = flow_count_index + 1
    label_colours(flow_colours_start, flow_count, "Light-flow")

    stars_start = flow_colours_start + 3 * flow_count
    star_fields = (
        ("Laser stars enabled", lambda value: "on" if value else "off"),
        ("Laser stars relative brightness", str),
        ("Laser stars blinking", lambda value: "on" if value else "off"),
        ("Laser stars blinking rate", str),
        ("Laser stars orbit", lambda value: "on" if value else "off"),
        ("Laser stars orbit speed", str),
    )
    for offset, (name, format_value) in enumerate(star_fields):
        index = stars_start + offset
        if index < len(values):
            label(index, f"{name}: {format_value(values[index])} ({values[index]})")
    return annotations


def describe_byte(frame_number: int, frame: bytes, offset: int,
                  annotation: str | None) -> str:
    if offset == 0x13:
        expected = xor_checksum(frame)
        return "XOR checksum (OK)" if frame[offset] == expected else f"XOR checksum (expected 0x{expected:02X})"
    if annotation:
        return annotation
    if frame[0] == 0xA3:
        if offset == 0:
            return "A3 extended scene-payload frame"
        if offset == 1:
            return "A3 fragment marker: first fragment" if frame[offset] == 0 else (
                "A3 fragment marker: final fragment" if frame[offset] == 0xFF else
                f"A3 fragment marker: continuation {frame[offset]}")
        if frame[1] == 0xFF and frame[offset] == 0 and all(byte == 0 for byte in frame[offset:-1]):
            return "zero-filled padding in required terminal A3 frame"
        return "unknown A3 scene-payload data"
    if frame[0] == 0x33:
        if offset == 0:
            return "standard Govee command frame"
        if offset == 1 and frame[offset] == 0x05:
            return "Govee colour/effect command; used as activation frame"
        if offset == 5:
            return "Built-in sound selection: off (0)" if frame[offset] == 0 else f"Built-in sound selection: ID {frame[offset]}"
        return "unknown standard-command data"
    return "unknown frame type/data"


def decode_scene(scene_id: str, scene: dict) -> None:
    frames = decode_frames(scene)
    annotations = location_annotations(frames)
    print(f"Scene {scene_id}: {scene.get('name', '<unnamed>')}")
    print("Unknown means: not yet experimentally identified for the H6093.")
    for frame_number, frame in enumerate(frames, start=1):
        print(f"\nFrame {frame_number} ({len(frame)} bytes, {frame.hex(' ')}):")
        for offset, value in enumerate(frame):
            detail = describe_byte(frame_number, frame, offset, annotations.get((frame_number, offset)))
            print(f"  0x{offset:02X} / {offset:>2}  {value:>3}  0x{value:02X}  {detail}")


def check_scene(scene_id: str, scene: dict) -> tuple[bool, str]:
    try:
        frames = decode_frames(scene)
    except ValueError as exc:
        return False, str(exc)
    a3 = a3_frames(frames)
    if not a3:
        return True, "valid non-A3 command"
    declared_frames = a3[0][3]
    terminal_ok = a3[-1][1] == 0xFF
    basic_ok = len(a3) == declared_frames and terminal_ok
    if a3[0][4] != 0x58 or a3[0][5] != 0x01:
        return basic_ok, (f"extended/predefined A3 layout; A3 {len(a3)}/{declared_frames}; "
                          f"terminal {'OK' if terminal_ok else 'missing'}")
    declared_length = a3[0][6] | (a3[0][7] << 8)
    available_length = len(stream_locations(frames))
    ok = basic_ok and available_length >= declared_length
    return ok, (f"DIY A3 {len(a3)}/{declared_frames}; data {available_length}/{declared_length}; "
                f"terminal {'OK' if terminal_ok else 'missing'}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenes", type=Path, required=True, help="JSON created by extract_h6093_tap_to_run.py")
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--list", action="store_true", help="list available scene IDs and names")
    action.add_argument("--check", action="store_true", help="validate all scenes without decoding every byte")
    selector = parser.add_mutually_exclusive_group()
    selector.add_argument("--id", help="scene ID")
    selector.add_argument("--name", help="exact scene name (case-insensitive)")
    args = parser.parse_args()
    if not args.list and not args.check and not (args.id or args.name):
        parser.error("choose --list, --check, --id, or --name")
    if (args.list or args.check) and (args.id or args.name):
        parser.error("--list/--check cannot be combined with --id or --name")

    scenes = load_scenes(args.scenes)
    if args.list:
        for scene_id, scene in scenes.items():
            print(f"{scene_id:>6}  {scene.get('name', '<unnamed>')}")
        return 0
    if args.check:
        failures = 0
        for scene_id, scene in scenes.items():
            ok, result = check_scene(scene_id, scene)
            print(f"{'OK  ' if ok else 'FAIL'} {scene_id:>6}  {scene.get('name', '<unnamed>')}: {result}")
            failures += not ok
        return 1 if failures else 0
    scene_id, scene = find_scene(scenes, args.id, args.name)
    decode_scene(scene_id, scene)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(2)
