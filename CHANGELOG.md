# Changelog

All notable changes to this project are documented in this file.

## 0.3.3

- Removed the redundant user-facing `scene.music.id` state.
- `scene.music.selection` is now the only music control and retains Govee
  Home's thematic order; the device ID is derived internally.

## 0.3.2

- Selecting `global.predefinedScene` now immediately activates that scene.
- Removed the redundant `commands.pushPredefinedScene` trigger.
- Manual `commands.pushScene` now sends independently of `global.autoPush`.

## 0.3.1

- Removed the misleading configurable port; H6093 commands always target UDP port 4003.

## 0.3.0

- Initial release.

## 0.2.0

- Added byte-exact replay of 55 extracted Govee Home predefined scenes.
- Added `global.predefinedScene` and `commands.pushPredefinedScene`.
- Renamed the adapter to `govee-aurora`.

## 0.1.1

- Added H6093 built-in music IDs and an app-ordered music selection.

## 0.1.0

- Initial local UDP scene editor for the Govee H6093 Aurora projector.
- Added direct power and brightness commands.
- Added complete DIY-scene payload construction with validated RGB lists and
  XOR checksums.
