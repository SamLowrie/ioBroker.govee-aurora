'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    buildBrightnessMessage,
    buildPowerMessage,
    buildPredefinedSceneMessage,
    buildSceneFrames,
    buildSceneMessage,
    validateColors,
    xorChecksum,
} = require('../lib/protocol');
const { MUSIC_BY_ID, MUSIC_BY_SELECTION, MUSIC_TRACKS } = require('../lib/music');
const PREDEFINED_SCENES = require('../data/H6093-predefined_scenes.json').H6093;

const TE1 = {
    aurora: {
        general: { speed: 14, direction: 0 },
        waves: {
            enabled: true,
            brightness: 20,
            mode: 1,
            speed: 24,
            colors: [[0, 255, 0], [0, 0, 255]],
        },
        lightFlow: {
            enabled: true,
            brightness: 34,
            mode: 1,
            speed: 50,
            colors: [[255, 255, 255]],
        },
    },
    stars: {
        enabled: true,
        brightness: 9,
        blinking: true,
        blinkingRate: 7,
        orbit: true,
        orbitSpeed: 9,
    },
    music: { id: 0 },
};

test('builds the known te1 A3 payload byte for byte', () => {
    const frames = buildSceneFrames(TE1);
    assert.equal(frames.length, 4);
    assert.equal(frames[0].toString('hex'), 'a300010358011e000e0002011401180200ff001b');
    assert.equal(frames[1].toString('hex'), 'a3010000ff0122013201ffffff010901070109b5');
    assert.equal(frames[2].toString('hex'), 'a3ff00000000000000000000000000000000005c');
});

test('all generated frames are 20 bytes with valid XOR checksums', () => {
    const frames = buildSceneFrames(TE1);
    for (const frame of frames) {
        assert.equal(frame.length, 20);
        assert.equal(frame[19], xorChecksum(frame));
    }
});

test('uses a separate terminal A3 frame when continuation data fills a frame', () => {
    const frames = buildSceneFrames(TE1);
    assert.equal(frames[0][3], 3);
    assert.equal(frames[1][1], 1);
    assert.equal(frames[2][1], 0xff);
});

test('supports the maximum of eight colors in both lists', () => {
    const colors = Array.from({ length: 8 }, (_, index) => [index, 255 - index, index * 2]);
    const scene = structuredClone(TE1);
    scene.aurora.waves.colors = colors;
    scene.aurora.lightFlow.colors = colors;
    const frames = buildSceneFrames(scene);
    assert.equal(frames[0][6], 69);
    assert.equal(frames[0][3], 5);
    assert.equal(frames.filter(frame => frame[0] === 0xa3).length, 5);
});

test('builds the ptReal JSON wrapper and base64 frames', () => {
    const message = buildSceneMessage(TE1);
    assert.equal(message.msg.cmd, 'ptReal');
    assert.equal(message.msg.data.command.length, 4);
    assert.equal(Buffer.from(message.msg.data.command[0], 'base64').length, 20);
});

test('writes the scene music ID to activation-frame offset 5', () => {
    const scene = structuredClone(TE1);
    scene.music.id = 16;
    const activation = buildSceneFrames(scene).at(-1);
    assert.equal(activation[5], 16);
    assert.equal(activation[19], xorChecksum(activation));
});

test('keeps the music tracks in Govee Home app order', () => {
    assert.deepEqual(MUSIC_TRACKS.map(track => track.id), [
        0, 3, 16, 14, 15, 10, 6, 18, 17, 7, 8, 9, 5, 13, 11, 4, 12, 2, 1,
    ]);
    assert.equal(MUSIC_BY_ID.get(16).label, 'Festival - Music Box');
    assert.equal(MUSIC_BY_SELECTION.get('track-17').id, 2);
});

test('validates color arrays strictly', () => {
    assert.deepEqual(validateColors('colors', [[0, 1, 255]]), [[0, 1, 255]]);
    assert.throws(() => validateColors('colors', []), /between 1 and 8/);
    assert.throws(() => validateColors('colors', [[0, 1]]), /RGB triple/);
    assert.throws(() => validateColors('colors', [[0, 1, 256]]), /0 to 255/);
});

test('builds the standard Govee LAN power and brightness messages', () => {
    assert.deepEqual(buildPowerMessage(true), { msg: { cmd: 'turn', data: { value: 1 } } });
    assert.deepEqual(buildPowerMessage(false), { msg: { cmd: 'turn', data: { value: 0 } } });
    assert.deepEqual(buildBrightnessMessage(75), { msg: { cmd: 'brightness', data: { value: 75 } } });
    assert.throws(() => buildBrightnessMessage(101), /0 to 100/);
});

test('validates and preserves every predefined scene payload', () => {
    assert.equal(Object.keys(PREDEFINED_SCENES).length, 55);
    for (const scene of Object.values(PREDEFINED_SCENES)) {
        const message = buildPredefinedSceneMessage(scene.cmd);
        assert.equal(message.msg.cmd, 'ptReal');
        assert.deepEqual(message.msg.data.command, scene.cmd);
    }
});

test('rejects a damaged predefined scene frame', () => {
    const damaged = [...PREDEFINED_SCENES['1001'].cmd];
    const frame = Buffer.from(damaged[0], 'base64');
    frame[2] ^= 1;
    damaged[0] = frame.toString('base64');
    assert.throws(() => buildPredefinedSceneMessage(damaged), /invalid XOR checksum/);
});
