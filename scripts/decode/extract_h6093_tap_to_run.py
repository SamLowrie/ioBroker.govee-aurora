#!/usr/bin/env python3
"""Download and extract H6093 ptReal payloads from Govee Home Tap-to-Run rules.

Create a Tap-to-Run shortcut that directly targets the H6093 for every scene
you want to analyse. This tool downloads the Govee Home configuration and
stores the original command frames; it never reconstructs or sends a command.
"""

import argparse
import base64
import binascii
import getpass
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path


LOGIN_URL = "https://community-api.govee.com/os/v1/login"
HOME_URL = "https://app2.govee.com/bff-app/v1/exec-plat/home"
FRAME_SIZE = 20


def request_json(url: str, headers: dict[str, str], body: dict | None = None) -> dict:
    encoded = None if body is None else json.dumps(body).encode()
    request = urllib.request.Request(url, data=encoded, headers=headers)
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def login(email: str) -> str:
    password = getpass.getpass("Govee password (not saved): ")
    response = request_json(LOGIN_URL, {"Content-Type": "application/json"},
                            {"email": email, "password": password})
    if response.get("status") != 200 or not response.get("data", {}).get("token"):
        raise ValueError(f"Govee login failed: {response.get('message', 'unknown error')}")
    return response["data"]["token"]


def walk(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from walk(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk(child)


def label(rule: dict, fallback: str) -> str:
    try:
        value = json.loads(rule.get("cmdVal", "{}"))
    except json.JSONDecodeError:
        return fallback
    return value.get("scenesStr") or value.get("diyName") or value.get("snapshotName") or fallback


def xor_checksum(frame: bytes) -> int:
    value = 0
    for byte in frame[:-1]:
        value ^= byte
    return value


def valid_command(command: list[str]) -> bool:
    try:
        frames = [base64.b64decode(part, validate=True) for part in command]
    except (TypeError, binascii.Error):
        return False
    return bool(frames) and all(len(frame) == FRAME_SIZE and frame[-1] == xor_checksum(frame) for frame in frames)


def extract(document: dict) -> tuple[dict[str, dict], int]:
    found: list[tuple[str, list[str]]] = []
    seen: set[str] = set()
    rejected = 0
    for item in walk(document):
        device, rules = item.get("deviceObj"), item.get("rule")
        if not isinstance(device, dict) or device.get("sku") != "H6093" or not isinstance(rules, list):
            continue
        for index, rule in enumerate(rules, start=1):
            try:
                message = json.loads(rule.get("iotMsg", "{}"))
                msg, command = message["msg"], message["msg"]["data"]["command"]
            except (KeyError, TypeError, json.JSONDecodeError):
                continue
            if msg.get("cmd") != "ptReal" or not isinstance(command, list):
                continue
            command = [str(part).strip('"') for part in command]
            if not valid_command(command):
                rejected += 1
                continue
            marker = json.dumps(command, separators=(",", ":"))
            if marker not in seen:
                found.append((label(rule, f"Tap-to-Run {index}"), command))
                seen.add(marker)
    scenes = {str(1001 + index): {"name": name, "cmd": command}
              for index, (name, command) in enumerate(found)}
    return scenes, rejected


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    auth = parser.add_mutually_exclusive_group(required=True)
    auth.add_argument("--token", help="Govee Home bearer token; do not share it or commit it")
    auth.add_argument("--email", help="Govee Home email; password is prompted and not saved")
    parser.add_argument("--output", type=Path, default=Path("H6093-tap-to-run-scenes.json"),
                        help="destination JSON file (default: %(default)s)")
    args = parser.parse_args()
    token = args.token or login(args.email)
    document = request_json(HOME_URL, {
        "Authorization": f"Bearer {token}", "Content-Type": "application/json", "appVersion": "5.6.01",
    })
    scenes, rejected = extract(document)
    args.output.write_text(json.dumps({"H6093": scenes}, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(scenes)} valid, unique H6093 Tap-to-Run scene(s) to {args.output}")
    if rejected:
        print(f"Skipped {rejected} ptReal command(s) with invalid frame data.", file=sys.stderr)
    if not scenes:
        print("No H6093 ptReal command found. Verify that every shortcut targets the H6093 directly.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, json.JSONDecodeError, urllib.error.URLError) as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(2)
