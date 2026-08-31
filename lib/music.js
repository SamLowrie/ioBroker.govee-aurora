'use strict';

// This order mirrors the thematic order in the Govee Home app. The selection
// keys are deliberately non-numeric so JavaScript and ioBroker do not reorder
// them by numeric property-key rules.
const MUSIC_TRACKS = Object.freeze([
    { selection: 'track-00', id: 0, label: 'Off' },
    { selection: 'track-01', id: 3, label: 'Soothing Music - Lullaby' },
    { selection: 'track-02', id: 16, label: 'Festival - Music Box' },
    { selection: 'track-03', id: 14, label: 'Emotion - Still' },
    { selection: 'track-04', id: 15, label: 'Emotion - Cheerful Music' },
    { selection: 'track-05', id: 10, label: 'Rain - Mountain Raindrops' },
    { selection: 'track-06', id: 6, label: 'Rain - Drizzle' },
    { selection: 'track-07', id: 18, label: 'Life - Little Train' },
    { selection: 'track-08', id: 17, label: 'Life - Tick Tock' },
    { selection: 'track-09', id: 7, label: 'Nature - River' },
    { selection: 'track-10', id: 8, label: 'Nature - Beach Waves' },
    { selection: 'track-11', id: 9, label: 'Nature - Campfire' },
    { selection: 'track-12', id: 5, label: 'Nature - Insect Songs' },
    { selection: 'track-13', id: 13, label: 'Nature - Wind Sounds' },
    { selection: 'track-14', id: 11, label: 'Nature - Birdsong' },
    { selection: 'track-15', id: 4, label: 'Nature - Wind Chimes' },
    { selection: 'track-16', id: 12, label: 'Nature - Breeze 2' },
    { selection: 'track-17', id: 2, label: 'Universe - Starry Night' },
    { selection: 'track-18', id: 1, label: 'Universe - Deep Sea' },
]);

const MUSIC_BY_ID = new Map(MUSIC_TRACKS.map(track => [track.id, track]));
const MUSIC_BY_SELECTION = new Map(MUSIC_TRACKS.map(track => [track.selection, track]));

module.exports = { MUSIC_BY_ID, MUSIC_BY_SELECTION, MUSIC_TRACKS };
