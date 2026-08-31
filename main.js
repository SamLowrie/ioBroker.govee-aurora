'use strict';

const dgram = require('node:dgram');
const net = require('node:net');
const utils = require('@iobroker/adapter-core');
const {
    buildBrightnessMessage,
    buildPowerMessage,
    buildPredefinedSceneMessage,
    buildSceneMessage,
    validateColors,
} = require('./lib/protocol');
const { MUSIC_BY_ID, MUSIC_BY_SELECTION } = require('./lib/music');
const PREDEFINED_SCENES = require('./data/H6093-predefined_scenes.json').H6093;

const DEFAULTS = Object.freeze({
    'scene.stars.enabled': true,
    'scene.stars.brightness': 50,
    'scene.stars.blinking': false,
    'scene.stars.blinkingRate': 50,
    'scene.stars.orbit': false,
    'scene.stars.orbitSpeed': 50,
    'scene.aurora.general.direction': 0,
    'scene.aurora.general.speed': 50,
    'scene.aurora.waves.enabled': true,
    'scene.aurora.waves.brightness': 100,
    'scene.aurora.waves.colors': '[[0,255,0],[0,0,255]]',
    'scene.aurora.waves.mode': 1,
    'scene.aurora.waves.speed': 50,
    'scene.aurora.lightFlow.enabled': true,
    'scene.aurora.lightFlow.brightness': 100,
    'scene.aurora.lightFlow.colors': '[[255,255,255]]',
    'scene.aurora.lightFlow.mode': 1,
    'scene.aurora.lightFlow.speed': 50,
    'scene.music.id': 0,
    'scene.music.selection': 'track-00',
    'global.power': false,
    'global.brightness': 100,
    'global.autoPush': false,
    'global.predefinedScene': '1001',
    'commands.pushScene': false,
    'commands.pushPredefinedScene': false,
    'commands.lastResult': '',
    'commands.lastError': '',
    'commands.lastSent': 0,
});

const BOOLEAN_STATES = new Set([
    'scene.stars.enabled',
    'scene.stars.blinking',
    'scene.stars.orbit',
    'scene.aurora.waves.enabled',
    'scene.aurora.lightFlow.enabled',
    'global.power',
    'global.autoPush',
]);

const NUMBER_RANGES = Object.freeze({
    'scene.stars.brightness': [0, 100],
    'scene.stars.blinkingRate': [0, 100],
    'scene.stars.orbitSpeed': [0, 100],
    'scene.aurora.general.direction': [0, 1],
    'scene.aurora.general.speed': [0, 100],
    'scene.aurora.waves.brightness': [0, 100],
    'scene.aurora.waves.mode': [1, 4],
    'scene.aurora.waves.speed': [0, 100],
    'scene.aurora.lightFlow.brightness': [0, 100],
    'scene.aurora.lightFlow.mode': [1, 4],
    'scene.aurora.lightFlow.speed': [0, 100],
    'global.brightness': [0, 100],
});

const COLOR_STATES = new Set([
    'scene.aurora.waves.colors',
    'scene.aurora.lightFlow.colors',
]);

class GoveeAurora extends utils.Adapter {
    constructor(options = {}) {
        super({ ...options, name: 'govee-aurora' });
        this.socket = undefined;
        this.projectorIp = '';
        this.projectorPort = 4003;
        this.values = { ...DEFAULTS };
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        await this.setStateAsync('info.connection', { val: false, ack: true });

        await this.setObjectNotExistsAsync('global.predefinedScene', {
            type: 'state',
            common: {
                name: 'Predefined scene',
                type: 'string',
                role: 'text',
                read: true,
                write: true,
                def: '1001',
            },
            native: {},
        });
        await this.setObjectNotExistsAsync('commands.pushPredefinedScene', {
            type: 'state',
            common: {
                name: 'Push predefined scene',
                type: 'boolean',
                role: 'button',
                read: true,
                write: true,
                def: false,
            },
            native: {},
        });

        this.projectorIp = String(this.config.ip || '').trim();
        this.projectorPort = Number(this.config.port || 4003);
        await this.setStateAsync('projector.ip', { val: this.projectorIp, ack: true });
        await this.extendObjectAsync('global.predefinedScene', {
            common: {
                states: Object.fromEntries(
                    Object.entries(PREDEFINED_SCENES).map(([id, scene]) => [id, scene.name]),
                ),
            },
        });

        if (net.isIP(this.projectorIp) !== 4) {
            this.log.error('A valid projector IPv4 address must be configured.');
            await this.setStateAsync('commands.lastError', {
                val: 'A valid projector IPv4 address must be configured.',
                ack: true,
            });
            return;
        }
        if (!Number.isInteger(this.projectorPort) || this.projectorPort < 1 || this.projectorPort > 65535) {
            this.log.error('The configured UDP port must be an integer from 1 to 65535.');
            return;
        }

        await this.loadStateValues();
        this.socket = dgram.createSocket('udp4');
        this.socket.on('error', error => {
            this.log.error(`UDP socket error: ${error.message}`);
            void this.setStateAsync('commands.lastError', { val: error.message, ack: true });
        });
        await new Promise(resolve => {
            this.socket.once('listening', resolve);
            this.socket.bind(0, '0.0.0.0');
        });
        await this.setStateAsync('info.connection', { val: true, ack: true });
        this.subscribeStates('*');
        this.log.info(`Ready to control H6093 at ${this.projectorIp}:${this.projectorPort}`);
    }

    async loadStateValues() {
        for (const [id, defaultValue] of Object.entries(DEFAULTS)) {
            const state = await this.getStateAsync(id);
            if (!state || state.val === null || state.val === undefined) {
                this.values[id] = defaultValue;
                await this.setStateAsync(id, { val: defaultValue, ack: true });
                continue;
            }
            try {
                const value = this.normalizeValue(id, state.val);
                this.values[id] = value;
                if (state.val !== value || !state.ack) {
                    await this.setStateAsync(id, { val: value, ack: true });
                }
            } catch (error) {
                this.log.warn(`${id}: ${error.message}; restoring the default value`);
                this.values[id] = defaultValue;
                await this.setStateAsync(id, { val: defaultValue, ack: true });
            }
        }

        // The numeric ID is the canonical value. This preserves an existing
        // ID during an adapter upgrade where the ordered selection state is
        // being created for the first time.
        const musicSelection = MUSIC_BY_ID.get(this.values['scene.music.id']).selection;
        this.values['scene.music.selection'] = musicSelection;
        await this.setStateAsync('scene.music.selection', { val: musicSelection, ack: true });
    }

    normalizeValue(id, rawValue) {
        if (BOOLEAN_STATES.has(id)) {
            if (rawValue === true || rawValue === 1 || rawValue === 'true') return true;
            if (rawValue === false || rawValue === 0 || rawValue === 'false') return false;
            throw new Error('value must be boolean');
        }

        if (Object.hasOwn(NUMBER_RANGES, id)) {
            const value = Number(rawValue);
            const [minimum, maximum] = NUMBER_RANGES[id];
            if (!Number.isInteger(value) || value < minimum || value > maximum) {
                throw new Error(`value must be an integer from ${minimum} to ${maximum}`);
            }
            return value;
        }

        if (id === 'scene.music.id') {
            const value = Number(rawValue);
            if (!Number.isInteger(value) || !MUSIC_BY_ID.has(value)) {
                throw new Error(`unknown built-in music ID: ${rawValue}`);
            }
            return value;
        }

        if (id === 'scene.music.selection') {
            const value = String(rawValue);
            if (!MUSIC_BY_SELECTION.has(value)) {
                throw new Error(`unknown built-in music selection: ${rawValue}`);
            }
            return value;
        }

        if (id === 'global.predefinedScene') {
            const value = String(rawValue);
            if (!Object.hasOwn(PREDEFINED_SCENES, value)) {
                throw new Error(`unknown predefined scene ID: ${rawValue}`);
            }
            return value;
        }

        if (COLOR_STATES.has(id)) {
            if (typeof rawValue !== 'string') {
                throw new Error('colors must be a JSON string');
            }
            let colors;
            try {
                colors = JSON.parse(rawValue);
            } catch (error) {
                throw new Error(`invalid color JSON: ${error.message}`);
            }
            return JSON.stringify(validateColors(id, colors));
        }

        return rawValue;
    }

    async onStateChange(fullId, state) {
        if (!state || state.ack || !fullId.startsWith(`${this.namespace}.`)) return;
        const id = fullId.slice(this.namespace.length + 1);

        try {
            if (id === 'commands.pushScene') {
                if (this.normalizeValue('global.autoPush', state.val)) {
                    await this.pushScene('manual trigger');
                }
                await this.setStateAsync(id, { val: false, ack: true });
                return;
            }

            if (id === 'commands.pushPredefinedScene') {
                if (this.normalizeValue('global.autoPush', state.val)) {
                    await this.pushPredefinedScene();
                }
                await this.setStateAsync(id, { val: false, ack: true });
                return;
            }

            if (!Object.hasOwn(DEFAULTS, id)) return;
            const value = this.normalizeValue(id, state.val);
            this.values[id] = value;
            await this.setStateAsync(id, { val: value, ack: true });

            if (id === 'scene.music.id') {
                const selection = MUSIC_BY_ID.get(value).selection;
                this.values['scene.music.selection'] = selection;
                await this.setStateAsync('scene.music.selection', { val: selection, ack: true });
            } else if (id === 'scene.music.selection') {
                const musicId = MUSIC_BY_SELECTION.get(value).id;
                this.values['scene.music.id'] = musicId;
                await this.setStateAsync('scene.music.id', { val: musicId, ack: true });
            }

            if (id === 'global.power') {
                await this.sendMessage(buildPowerMessage(value), 'power command');
            } else if (id === 'global.brightness') {
                await this.sendMessage(buildBrightnessMessage(value), 'brightness command');
            } else if (id.startsWith('scene.') && this.values['global.autoPush']) {
                await this.pushScene(`automatic push after ${id}`);
            }
        } catch (error) {
            const message = `${id}: ${error.message}`;
            this.log.error(message);
            await this.setStateAsync('commands.lastError', { val: message, ack: true });
            if (Object.hasOwn(this.values, id)) {
                await this.setStateAsync(id, { val: this.values[id], ack: true });
            }
            if (id === 'commands.pushScene' || id === 'commands.pushPredefinedScene') {
                await this.setStateAsync(id, { val: false, ack: true });
            }
        }
    }

    getScene() {
        return {
            stars: {
                enabled: this.values['scene.stars.enabled'],
                brightness: this.values['scene.stars.brightness'],
                blinking: this.values['scene.stars.blinking'],
                blinkingRate: this.values['scene.stars.blinkingRate'],
                orbit: this.values['scene.stars.orbit'],
                orbitSpeed: this.values['scene.stars.orbitSpeed'],
            },
            aurora: {
                general: {
                    direction: this.values['scene.aurora.general.direction'],
                    speed: this.values['scene.aurora.general.speed'],
                },
                waves: {
                    enabled: this.values['scene.aurora.waves.enabled'],
                    brightness: this.values['scene.aurora.waves.brightness'],
                    colors: JSON.parse(this.values['scene.aurora.waves.colors']),
                    mode: this.values['scene.aurora.waves.mode'],
                    speed: this.values['scene.aurora.waves.speed'],
                },
                lightFlow: {
                    enabled: this.values['scene.aurora.lightFlow.enabled'],
                    brightness: this.values['scene.aurora.lightFlow.brightness'],
                    colors: JSON.parse(this.values['scene.aurora.lightFlow.colors']),
                    mode: this.values['scene.aurora.lightFlow.mode'],
                    speed: this.values['scene.aurora.lightFlow.speed'],
                },
            },
            music: {
                id: this.values['scene.music.id'],
            },
        };
    }

    async pushScene(reason) {
        await this.sendMessage(buildSceneMessage(this.getScene()), `scene (${reason})`);
    }

    async pushPredefinedScene() {
        const id = this.values['global.predefinedScene'];
        const scene = PREDEFINED_SCENES[id];
        if (!scene) throw new Error(`unknown predefined scene ID: ${id}`);
        await this.sendMessage(
            buildPredefinedSceneMessage(scene.cmd),
            `predefined scene ${id} (${scene.name})`,
        );
    }

    async sendMessage(message, description) {
        if (!this.socket) throw new Error('UDP socket is not ready');
        const payload = Buffer.from(JSON.stringify(message), 'utf8');
        await new Promise((resolve, reject) => {
            this.socket.send(payload, this.projectorPort, this.projectorIp, error => {
                if (error) reject(error);
                else resolve();
            });
        });
        const result = `${description} sent to ${this.projectorIp}:${this.projectorPort}; no acknowledgement expected`;
        this.log.debug(result);
        await this.setStateAsync('commands.lastResult', { val: result, ack: true });
        await this.setStateAsync('commands.lastError', { val: '', ack: true });
        await this.setStateAsync('commands.lastSent', { val: Date.now(), ack: true });
    }

    onUnload(callback) {
        void this.setStateAsync('info.connection', { val: false, ack: true });
        if (this.socket) {
            this.socket.close(() => callback());
            this.socket = undefined;
        } else {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = options => new GoveeAurora(options);
    module.exports.GoveeAurora = GoveeAurora;
} else {
    new GoveeAurora();
}
