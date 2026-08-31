'use strict';

const FRAME_SIZE = 20;

function xorChecksum(frame) {
    let value = 0;
    for (let index = 0; index < FRAME_SIZE - 1; index += 1) {
        value ^= frame[index];
    }
    return value;
}

function finishFrame(frame) {
    frame[FRAME_SIZE - 1] = xorChecksum(frame);
    return frame;
}

function requireInteger(name, value, minimum, maximum) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer from ${minimum} to ${maximum}`);
    }
    return value;
}

function requireBoolean(name, value) {
    if (typeof value !== 'boolean') {
        throw new Error(`${name} must be a boolean`);
    }
    return value ? 1 : 0;
}

function validateColors(name, colors) {
    if (!Array.isArray(colors) || colors.length < 1 || colors.length > 8) {
        throw new Error(`${name} must contain between 1 and 8 RGB colors`);
    }
    return colors.map((color, colorIndex) => {
        if (!Array.isArray(color) || color.length !== 3) {
            throw new Error(`${name}[${colorIndex}] must be an RGB triple`);
        }
        return color.map((component, componentIndex) =>
            requireInteger(`${name}[${colorIndex}][${componentIndex}]`, component, 0, 255),
        );
    });
}

function validateScene(scene) {
    if (!scene || typeof scene !== 'object') {
        throw new Error('scene must be an object');
    }
    const waveColors = validateColors('waves.colors', scene.aurora?.waves?.colors);
    const lightFlowColors = validateColors('lightFlow.colors', scene.aurora?.lightFlow?.colors);

    return {
        aurora: {
            general: {
                direction: requireInteger('aurora.direction', scene.aurora?.general?.direction, 0, 1),
                speed: requireInteger('aurora.speed', scene.aurora?.general?.speed, 0, 100),
            },
            waves: {
                enabled: requireBoolean('waves.enabled', scene.aurora?.waves?.enabled),
                brightness: requireInteger('waves.brightness', scene.aurora?.waves?.brightness, 0, 100),
                colors: waveColors,
                mode: requireInteger('waves.mode', scene.aurora?.waves?.mode, 1, 4),
                speed: requireInteger('waves.speed', scene.aurora?.waves?.speed, 0, 100),
            },
            lightFlow: {
                enabled: requireBoolean('lightFlow.enabled', scene.aurora?.lightFlow?.enabled),
                brightness: requireInteger(
                    'lightFlow.brightness',
                    scene.aurora?.lightFlow?.brightness,
                    0,
                    100,
                ),
                colors: lightFlowColors,
                mode: requireInteger('lightFlow.mode', scene.aurora?.lightFlow?.mode, 1, 4),
                speed: requireInteger('lightFlow.speed', scene.aurora?.lightFlow?.speed, 0, 100),
            },
        },
        stars: {
            enabled: requireBoolean('stars.enabled', scene.stars?.enabled),
            brightness: requireInteger('stars.brightness', scene.stars?.brightness, 0, 100),
            blinking: requireBoolean('stars.blinking', scene.stars?.blinking),
            blinkingRate: requireInteger('stars.blinkingRate', scene.stars?.blinkingRate, 0, 100),
            orbit: requireBoolean('stars.orbit', scene.stars?.orbit),
            orbitSpeed: requireInteger('stars.orbitSpeed', scene.stars?.orbitSpeed, 0, 100),
        },
        music: {
            id: requireInteger('music.id', scene.music?.id, 0, 255),
        },
    };
}

function flattenColors(colors) {
    return colors.flatMap(color => color);
}

/**
 * Build the complete binary H6093 DIY scene command.
 *
 * The variable-data length includes the two length bytes at Frame 1 offsets
 * 6 and 7. A full 17-byte continuation is followed by a separate, mandatory
 * A3 FF terminal frame.
 */
function buildSceneFrames(input) {
    const scene = validateScene(input);
    const variableLength =
        21 + 3 * scene.aurora.waves.colors.length + 3 * scene.aurora.lightFlow.colors.length;

    const stream = [
        variableLength & 0xff,
        (variableLength >> 8) & 0xff,
        scene.aurora.general.speed,
        scene.aurora.general.direction,
        2,
        scene.aurora.waves.enabled,
        scene.aurora.waves.brightness,
        scene.aurora.waves.mode,
        scene.aurora.waves.speed,
        scene.aurora.waves.colors.length,
        ...flattenColors(scene.aurora.waves.colors),
        scene.aurora.lightFlow.enabled,
        scene.aurora.lightFlow.brightness,
        scene.aurora.lightFlow.mode,
        scene.aurora.lightFlow.speed,
        scene.aurora.lightFlow.colors.length,
        ...flattenColors(scene.aurora.lightFlow.colors),
        scene.stars.enabled,
        scene.stars.brightness,
        scene.stars.blinking,
        scene.stars.blinkingRate,
        scene.stars.orbit,
        scene.stars.orbitSpeed,
    ];

    if (stream.length !== variableLength) {
        throw new Error(`Internal payload-length error: expected ${variableLength}, got ${stream.length}`);
    }

    const remainingAfterFirst = Math.max(0, stream.length - 13);
    const a3FrameCount = 2 + Math.floor(remainingAfterFirst / 17);
    const frames = [];

    const first = Buffer.alloc(FRAME_SIZE);
    first[0] = 0xa3;
    first[1] = 0x00;
    first[2] = 0x01;
    first[3] = a3FrameCount;
    first[4] = 0x58;
    first[5] = 0x01;
    stream.slice(0, 13).forEach((value, index) => {
        first[6 + index] = value;
    });
    frames.push(finishFrame(first));

    let position = 13;
    let continuation = 1;
    while (stream.length - position >= 17) {
        const frame = Buffer.alloc(FRAME_SIZE);
        frame[0] = 0xa3;
        frame[1] = continuation;
        stream.slice(position, position + 17).forEach((value, index) => {
            frame[2 + index] = value;
        });
        frames.push(finishFrame(frame));
        position += 17;
        continuation += 1;
    }

    const terminal = Buffer.alloc(FRAME_SIZE);
    terminal[0] = 0xa3;
    terminal[1] = 0xff;
    stream.slice(position).forEach((value, index) => {
        terminal[2 + index] = value;
    });
    frames.push(finishFrame(terminal));

    if (frames.length !== a3FrameCount) {
        throw new Error(`Internal A3 frame-count error: expected ${a3FrameCount}, got ${frames.length}`);
    }

    // Captured from a successfully replayed H6093 DIY scene. Bytes 2 and 3
    // are still undocumented, so this is intentionally kept as one template.
    const activation = Buffer.alloc(FRAME_SIZE);
    activation[0] = 0x33;
    activation[1] = 0x05;
    activation[2] = 0x0a;
    activation[3] = 0x9e;
    activation[5] = scene.music.id;
    frames.push(finishFrame(activation));

    return frames;
}

function buildSceneMessage(scene) {
    return {
        msg: {
            cmd: 'ptReal',
            data: {
                command: buildSceneFrames(scene).map(frame => frame.toString('base64')),
            },
        },
    };
}

/**
 * Wrap an extracted predefined-scene command without rebuilding its opaque A3
 * data. Frame length and checksums are validated, but the Base64 strings are
 * otherwise replayed unchanged.
 */
function buildPredefinedSceneMessage(command) {
    if (!Array.isArray(command) || command.length < 1) {
        throw new Error('predefined scene command must contain at least one frame');
    }

    const validated = command.map((encoded, index) => {
        if (typeof encoded !== 'string' || encoded.length === 0) {
            throw new Error(`predefined scene frame ${index + 1} must be a Base64 string`);
        }
        const frame = Buffer.from(encoded, 'base64');
        if (frame.length !== FRAME_SIZE) {
            throw new Error(`predefined scene frame ${index + 1} must decode to 20 bytes`);
        }
        if (frame[FRAME_SIZE - 1] !== xorChecksum(frame)) {
            throw new Error(`predefined scene frame ${index + 1} has an invalid XOR checksum`);
        }
        return encoded;
    });

    return {
        msg: {
            cmd: 'ptReal',
            data: { command: validated },
        },
    };
}

function buildPowerMessage(enabled) {
    return { msg: { cmd: 'turn', data: { value: enabled ? 1 : 0 } } };
}

function buildBrightnessMessage(value) {
    return {
        msg: {
            cmd: 'brightness',
            data: { value: requireInteger('brightness', value, 0, 100) },
        },
    };
}

module.exports = {
    buildBrightnessMessage,
    buildPowerMessage,
    buildPredefinedSceneMessage,
    buildSceneFrames,
    buildSceneMessage,
    validateColors,
    validateScene,
    xorChecksum,
};
