# `night1.js` — slow, evolving night scene

`night1.js` is an optional script for the ioBroker JavaScript adapter. It
creates a night-time H6093 scene that changes so slowly that individual steps
are intended to be barely noticeable. It does **not** use the projector's
built-in animation timing alone: it continuously makes small changes to the
Govee Aurora adapter's editable scene states and lets `global.autoPush` send
the resulting full scene.

The script is an example automation, not part of the adapter runtime. It must
be installed manually and is not started automatically by installing the
adapter.

## What it changes

When enabled, the script first applies its own initial scene and pushes it:

- Aurora movement starts stopped; later, it occasionally selects a direction
  and a low movement speed (configured as `1`–`30`).
- Aurora wave and light-flow colours slowly ramp one RGB component at a time.
  With the supplied values, one full colour-channel transition can take many
  seconds.
- Wave and light-flow brightness ramp in single-value steps.
- Laser-star brightness fades, while blinking and orbit are occasionally
  enabled for a random duration.

Workers use random probabilities and random cooldown periods, so their timing
is deliberately non-repeating. Most time ranges in `config` are in **minutes**;
`transition_speed` and `ramp_step_ms` are milliseconds.

The colour workers replace the relevant colour list with one RGB triple. Do
not run this script when you need to retain a multi-colour DIY gradient.

## Prerequisites

- A configured and running `govee-aurora.0` adapter instance.
- The ioBroker **JavaScript** adapter, with permission to create and write
  states under `0_userdata.0`.
- The H6093 should be reachable by the adapter before the script is enabled.

The script currently contains this adapter namespace near its top:

```javascript
const sky = 'govee-aurora.0';
```

For another instance, such as `govee-aurora.1`, change this value before
importing the script. The control-state path can also be changed there:

```javascript
const script_control_state = '0_userdata.0.home.control.aurora_night.enabled';
```

## Installation

1. In ioBroker Admin, open the **Scripts** tab (JavaScript adapter).
2. Create a new JavaScript script, for example in a folder named `govee-aurora`.
3. Open [night1.js](night1.js), copy its complete content, and paste it into
   the new JavaScript script.
4. Review the `sky`, `script_control_state`, and `config` values at the top.
   In particular, lower probabilities or increase cooldowns if you want fewer
   scene updates.
5. Save the script and enable it with the play button in the Scripts tab.

Enabling the JavaScript script only makes it listen for the control state. It
does not start the night effect until the control state described below is set
to `true`.

## Start and stop through `0_userdata.0`

After the script has been saved and enabled, it creates this boolean state:

```text
0_userdata.0.home.control.aurora_night.enabled
```

Use the ioBroker **Objects** tab (or any automation, VIS widget, Blockly
script, etc.) to set it:

| Value | Result |
| --- | --- |
| `true` | Reset to the script's initial scene, push it once, and start the slow random effects. |
| `false` | Stop pending timers and ramps. The projector keeps the last scene that was sent. |

The state is retained by ioBroker. If the JavaScript script is restarted while
the value is `true`, it starts the effect again and resets to its initial
scene. Set the state to `false` before editing, removing, or disabling the
script if you want to ensure that it stays stopped.

## Configuration notes

- Set `config.debug` to `true` to log timer scheduling and ramp activity in
  the JavaScript adapter log.
- `show_probability`, `effect_probability`, and `toggle_probability` are
  percentages (`0`–`100`). A failed probability check usually returns the
  affected value to zero/off until its next scheduled run.
- The script enables `govee-aurora.0.global.autoPush` while running. Avoid
  changing the same `scene.*` objects manually or from another automation at
  the same time, as the last writer wins and each change can send a scene.
- Stopping the script does not restore the previous adapter scene or disable
  `global.autoPush`. Set the desired final scene explicitly afterwards, and
  disable `global.autoPush` manually if it is no longer wanted.

## Safety and expected traffic

Small ramp steps can cause frequent full-scene UDP sends (every 200 or 300 ms
while a brightness or colour ramp is active). This is intentional for the
smooth visual effect, but it is more network traffic than a normal manually
pushed scene. Start with the supplied conservative settings and observe the
projector before reducing ramp intervals or cooldowns.
