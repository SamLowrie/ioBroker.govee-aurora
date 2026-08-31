/////////////////////////////////////////////////////////////////////////////////////
/// Global Config 
/////////////////////////////////////////////////////////////////////////////////////

const script_control_state = '0_userdata.0.home.control.aurora_night.enabled';
//const sky = home.aurora.device.path;
const sky = 'govee-aurora.0';

const runtime = {
    running: false,
    timers: new Set(),
    ramps: {},
};



/////////////////////////////////////////////////////////////////////////////////////
// Effect Config
// - Time options are in minutes, unless noted otherwise
/////////////////////////////////////////////////////////////////////////////////////
const config = {
    debug: false,
    aurora: {
        enabled: true,
        effect_probability: 50,
        cooldown_time: { min: 15, max: 30},
        max_speed: { min: 1, max: 30 }                  // maximum speed 1-100
    },
    lightflow: {
        colors: {
            enabled: true,
            show_probability: 75,                       // Probability to show waves
            transition_speed: 300,                      // ms between each step
            cooldown_time: { min: 5, max: 10 }          
        },
        brightness: {
            enabled: true,
            show_probability: 99,                       // Probability to show waves
            brightness_range: { min: 70, max: 100 },
            ramp_step_ms: 200,                          // ms between each step
            cooldown_time: { min: 5, max: 10 }
        }        
    },
    waves: {
        colors: {
            enabled: true,
            show_probability: 75,                       // Probability to show waves
            transition_speed: 300,                      // ms between each step
            cooldown_time: { min: 5, max: 10 }          
        },
        brightness: {
            enabled: true,
            show_probability: 99,                       // Probability to show waves
            brightness_range: { min: 50, max: 100 },
            ramp_step_ms: 200,                          // ms between each step
            cooldown_time: { min: 5, max: 10 }
        }
    },
    stars: {
        blinking: {
            enabled: true,
            show_probability: 25,
            effect_time: { min: 1, max: 5 },
            cooldown_time: { min: 10, max: 20 }
        },
        orbit: {
            enabled: true,
            show_probability: 15,
            effect_time: { min: 0.5, max: 5 },
            cooldown_time: { min: 5, max: 20 }
        },
        brightness: {
            enabled: true,
            toggle_probability: 50,
            brightness_range: { min: 10, max: 100 },
            effect_time: { min: 1, max: 10 }
        }
    }
};



/////////////////////////////////////////////////////////////////////////////////////
/// Helper functions
/////////////////////////////////////////////////////////////////////////////////////

function debug(text) {
    if (config.debug) { console.log(text); }
}

function checkProbability(percent) {
    return Math.random() * 100 < percent;
}

function randomInt(config) {
    return Math.floor(Math.random() * (config.max - config.min + 1)) + config.min;
}

function scheduleNext(func,interval,debug_text='Timer started') {
    const min = Math.floor(interval.min * 60);
    const max = Math.ceil(interval.max * 60);
    const timer = randomInt({min: min, max: max});

    if (!runtime.running) return null;
    debug(debug_text+': '+timer);

    const id = setTimeout(() => {
        runtime.timers.delete(id);
        if (runtime.running) {
            func();
        }
    }, timer * 1000);
    runtime.timers.add(id);

    return id;
}

function color_getFirstTriplet(stateId, defaultValue = [0,0,0] ) {
    try {
        const first = JSON.parse(getState(stateId).val)?.[0];
        return Array.isArray(first) ? first : defaultValue;
    } catch {
        return defaultValue;
    }
}

function createRamp({rampId,initialValue,step,intervalMs,apply,onFinished,debug_token = 'n/a'}) {
    if (!rampId) {
        throw new Error('createRamp requires a rampId');
    }

    if (runtime.ramps[rampId]) {
        debug(`Ramp '${rampId}' already active - skipping`);
        return null;
    }

    let current = [...initialValue];
    let target = [...initialValue];
    let timer = null;

    runtime.ramps[rampId] = {
        timer: null
    };

    function clearRampTimer() {
        if (timer) {
            clearTimeout(timer);
            runtime.timers.delete(timer);
            timer = null;
        }
    }

    function cleanupRamp() {
        clearRampTimer();
        delete runtime.ramps[rampId];
    }

    function scheduleTick() {
        if (!runtime.running) {
            cleanupRamp();
            return;
        }

        timer = setTimeout(() => {
            runtime.timers.delete(timer);
            timer = null;
            tick();
        }, intervalMs);

        runtime.timers.add(timer);
        runtime.ramps[rampId].timer = timer;
    }

    function tick() {
        if (!runtime.running) {
            cleanupRamp();
            return;
        }

        const reached = current.every((value, index) => value === target[index]);

        if (reached) {
            cleanupRamp();
            onFinished?.([...current]);
            return;
        }

        current = current.map((value, index) => {
            const difference = target[index] - value;
            const valueStep = Array.isArray(step) ? step[index] : step;

            return value + Math.sign(difference) * Math.min(valueStep, Math.abs(difference));
        });

        apply([...current]);
        scheduleTick();
    }

    return {
        rampTo(newTarget) {
            if (!Array.isArray(newTarget) || newTarget.length !== current.length) {
                cleanupRamp();
                throw new Error('Target must be an array with the same length as initialValue');
            }

            debug(`Ramping '${debug_token}': ${current} => ${newTarget}`);
            target = [...newTarget];

            if (!timer) {
                tick();
            }
        },

        stop() {
            cleanupRamp();
        },

        getCurrent() {
            return [...current];
        }
    };
}



/////////////////////////////////////////////////////////////////////////////////////
/// Worker functions
/////////////////////////////////////////////////////////////////////////////////////

function stars_orbit() {
    if (!runtime.running) return;

    const orbit = sky+'.scene.stars.orbit';
    const orbit_on = getState(orbit).val;

    if (orbit_on) {
        setState(orbit,false);
    } else {
        if (checkProbability(config.stars.orbit.show_probability)) {
            setState(orbit,true);
            scheduleNext(stars_orbit,config.stars.orbit.effect_time,'Stars orbit effect');
            return;
        }
    }

    scheduleNext(stars_orbit,config.stars.orbit.cooldown_time,'Stars orbit cooldown');   
}

function stars_blinking() {
    if (!runtime.running) return;

    const blinking = sky+'.scene.stars.blinking';

    if (getState(blinking).val) {
        setState(blinking,false);
    } else {
        if (checkProbability(config.stars.blinking.show_probability)) {
            setState(blinking,true);
            scheduleNext(stars_blinking,config.stars.blinking.effect_time,'Stars blinking effect');
            return;
        }
    }

    scheduleNext(stars_blinking,config.stars.blinking.cooldown_time,'Stars blinking cooldown');
}

function stars_brightness() {
    if (!runtime.running) return;

    const path_brightness = sky+'.scene.stars.brightness';
    const brightness = getState(path_brightness).val;

    let target_brightness = 0;
    if (checkProbability(config.stars.brightness.toggle_probability)) {
        target_brightness = randomInt(config.stars.brightness.brightness_range);
    }

    // Ramping
    const ramp = createRamp({
        rampId: 'stars_brightness',
        initialValue: [ brightness ],
        step: 1,
        intervalMs: 500,
        apply: ([value]) => { setState(path_brightness,value); },
        debug_token: 'stars brightness',
        onFinished: finalValue => {
            scheduleNext(stars_brightness,config.stars.brightness.effect_time,'Stars brightness effect');
        },
    });
    if (ramp) { ramp.rampTo([target_brightness]); }

}

/////////////////////////////////////////////////////////////////////////////////////

function waves_colors() {
    if (!runtime.running) return;

    const path_waves_colors = sky+'.scene.aurora.waves.colors';

    let random_colors = [ 0,0,0 ];
    if (checkProbability(config.waves.colors.show_probability)) {
        random_colors = Array.from({ length: 3 }, () => Math.floor(Math.random() * 256));
    }

    const ramp = createRamp({
        rampId: 'wave_colors',
        initialValue: color_getFirstTriplet(path_waves_colors),
        step: 1,
        intervalMs: config.waves.colors.transition_speed,
        apply: ([r,g,b]) => { setState(path_waves_colors,JSON.stringify([[r,g,b]])); },
        debug_token: 'waves color',
        onFinished: finalValue => {
            scheduleNext(waves_colors,config.waves.colors.cooldown_time,'Waves color cooldown');
        },
    });
    if (ramp) { ramp.rampTo(random_colors); }

}

function waves_brightness() {
    if (!runtime.running) return;

    const path_brightness = sky+'.scene.aurora.waves.brightness';
    const brightness = getState(path_brightness).val;

    let target_brightness = 0;
    if (checkProbability(config.waves.brightness.show_probability)) {
        target_brightness = randomInt(config.waves.brightness.brightness_range);
    }

    // Ramping
    const ramp = createRamp({
        rampId: 'wave_brightness',
        initialValue: [ brightness ],
        step: 1,
        intervalMs: config.waves.brightness.ramp_step_ms,
        apply: ([value]) => { setState(path_brightness,value); },
        debug_token: 'waves brightness',
        onFinished: finalValue => {
            scheduleNext(waves_brightness,config.waves.brightness.cooldown_time,'Waves brightness cooldown');
        },
    });
    if (ramp) { ramp.rampTo([target_brightness]); }

}

/////////////////////////////////////////////////////////////////////////////////////

function lightflow_colors() {
    if (!runtime.running) return;

    const path_colors = sky+'.scene.aurora.lightFlow.colors';

    let random_colors = [ 0,0,0 ];
    if (checkProbability(config.lightflow.colors.show_probability)) {
        random_colors = Array.from({ length: 3 }, () => Math.floor(Math.random() * 256));
    }

    const ramp = createRamp({
        rampId: 'lightflow_colors',
        initialValue: color_getFirstTriplet(path_colors),
        step: 1,
        intervalMs: config.lightflow.colors.transition_speed,
        apply: ([r,g,b]) => { setState(path_colors,JSON.stringify([[r,g,b]])); },
        debug_token: 'lightflow color',
        onFinished: finalValue => {
            scheduleNext(lightflow_colors,config.lightflow.colors.cooldown_time,'Lightflow color cooldown');
        },
    });
    if (ramp) { ramp.rampTo(random_colors); }

}

function lightflow_brightness() {
    if (!runtime.running) return;

    const path_brightness = sky+'.scene.aurora.lightFlow.brightness';
    const brightness = getState(path_brightness).val;

    let target_brightness = 0;
    if (checkProbability(config.lightflow.brightness.show_probability)) {
        target_brightness = randomInt(config.lightflow.brightness.brightness_range);
    }

    // Ramping
    const ramp = createRamp({
        rampId: 'lightflow_brightness',
        initialValue: [ brightness ],
        step: 1,
        intervalMs: config.lightflow.brightness.ramp_step_ms,
        apply: ([value]) => { setState(path_brightness,value); },
        debug_token: 'lightflow brightness',
        onFinished: finalValue => {
            scheduleNext(lightflow_brightness,config.lightflow.brightness.cooldown_time,'Lightflow brightness cooldown');
        },
    });
    if (ramp) { ramp.rampTo([target_brightness]); }

}

/////////////////////////////////////////////////////////////////////////////////////

function aurora() {
    if (!runtime.running) return;

    const path_direction = sky+'.scene.aurora.general.direction';
    const path_speed = sky+'.scene.aurora.general.speed';

    if (!checkProbability(config.aurora.effect_probability)) {
        if (getState(path_speed).val !== 0) {
            setState(path_speed,0);
        }
        scheduleNext(aurora,config.aurora.cooldown_time,'Aurora cooldown');
        return;
    }

    const target_speed = randomInt(config.aurora.max_speed);
    setState(path_direction,Math.floor(Math.random() * 2));  // Set either 0 or 1: up or down
    setState(path_speed,target_speed);
    scheduleNext(aurora,config.aurora.cooldown_time,'Aurora effect timer');

}

/////////////////////////////////////////////////////////////////////////////////////

function init() {

    // Init startup values
    setState(sky+'.global.autoPush',false);
    Object.entries({
        'scene.aurora.general.direction': 0,                     // down
        'scene.aurora.general.speed': 0,                         // disable movement

        'scene.aurora.lightFlow.brightness': 100,
        'scene.aurora.lightFlow.colors': '[[ 0,200,0 ]]',
        'scene.aurora.lightFlow.enabled': true,
        'scene.aurora.lightFlow.mode': 1, // Gradient
        'scene.aurora.lightFlow.speed': 0,

        'scene.aurora.waves.brightness': 50,
        'scene.aurora.waves.colors': '[[ 0,0,200 ]]',
        'scene.aurora.waves.enabled': true,
        'scene.aurora.waves.mode': 1, // Gradient
        'scene.aurora.waves.speed': 0,
        
        'scene.stars.blinking': false,
        'scene.stars.blinkingRate': 1,
        'scene.stars.brightness': 0,
        'scene.stars.enabled': true,
        'scene.stars.orbit': false,
        'scene.stars.orbitSpeed': 1
    }).forEach(([key, value]) => {
        setState(sky+'.'+key,value);
    });
    setState(sky+'.commands.pushScene',true);

    // Startup workers
    setState(sky+'.global.autoPush',true);
    if (config.stars.brightness.enabled) { stars_brightness(); }
    if (config.stars.orbit.enabled) { stars_orbit(); }
    if (config.stars.blinking.enabled) { stars_blinking(); }
    if (config.waves.colors.enabled) { waves_colors(); }
    if (config.waves.brightness.enabled) { waves_brightness(); }
    if (config.lightflow.colors.enabled) { lightflow_colors(); }
    if (config.lightflow.brightness.enabled) { lightflow_brightness(); }
    if (config.aurora.enabled) { aurora(); }

}



/////////////////////////////////////////////////////////////////////////////////////
/// Runtime controls
/////////////////////////////////////////////////////////////////////////////////////

function clearAllTimers() {
    for (const id of runtime.timers) {
        clearTimeout(id);
    }
    runtime.timers.clear();
}

function startEffects() {
    if (runtime.running) return;
    debug('Script started');
    runtime.running = true;
    init();
}

function stopEffects() {
    runtime.running = false;
    clearAllTimers();
    runtime.ramps = {};
    debug("Script stopped - stopping all timers.")
}

function syncRuntimeToControl(enabled) {
    if (enabled) {
        startEffects();
    } else {
        stopEffects();
    }
}

// Create state to control this script
createState(script_control_state, false, {
    name: 'Aurora night1 control',
    type: 'boolean',
    role: 'switch.enable',
    read: true,
    write: true
}, () => {
    syncRuntimeToControl(getState(script_control_state).val);
});

on({ id: script_control_state, change: 'ne' }, obj => {
    syncRuntimeToControl(!!obj.state.val);
});

// Manually start
//setState(script_control_state,true);
