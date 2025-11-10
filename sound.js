/*
 * sound.js
 * Manages all audio initialization and playback using Tone.js.
 */

// Tone.js is loaded from the CDN in index.html, so it's available globally.
// We just need to handle its initialization.

export let sounds = {};
export let audioReady = false;

export function initSounds() {
    if (audioReady) return;

    sounds = {
      shoot: new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.01, decay: 0.1, sustain: 0.1, release: 0.1 } }).toDestination(),
      hit: new Tone.PolySynth(Tone.MembraneSynth, { pitchDecay: 0.1, octaves: 4, envelope: { attack: 0.001, decay: 0.2, sustain: 0 } }).toDestination(),
      death: new Tone.PolySynth(Tone.MetalSynth, { frequency: 50, envelope: { attack: 0.01, decay: 1, release: 0.5 }, harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5 }).toDestination(),
      shield: new Tone.PolySynth(Tone.NoiseSynth, { noise: { type: 'pink' }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.1, release: 0.1 } }).toDestination(),
      teleport: new Tone.PolySynth(Tone.PluckSynth, { attackNoise: 1, dampening: 4000, resonance: 0.7 }).toDestination(),
      laser: new Tone.PolySynth(Tone.FMSynth, { harmonicity: 1.2, modulationIndex: 10, envelope: { attack: 0.01, decay: 1, sustain: 0.1, release: 0.2 } }).toDestination(),
      explosion: new Tone.PolySynth(Tone.MembraneSynth, { pitchDecay: 0.5, octaves: 10, envelope: { attack: 0.01, decay: 0.8, sustain: 0 } }).toDestination(),
      charge: new Tone.PolySynth(Tone.FMSynth, { harmonicity: 0.5, modulationIndex: 10, envelope: { attack: 0.2, decay: 0.3, sustain: 0.1, release: 0.1 } }).toDestination(),
      ult: new Tone.PolySynth(Tone.FMSynth, { harmonicity: 2, modulationIndex: 20, envelope: { attack: 0.1, decay: 1.5, sustain: 0.1, release: 0.5 } }).toDestination(),
    };
    
    sounds.shoot.volume.value = -12;
    sounds.hit.volume.value = -6;
    sounds.teleport.volume.value = -6;
    sounds.ult.volume.value = -3;
    
    audioReady = true;
    console.log("Audio initialized.");
}

// Function to start Tone.js context on user interaction
export async function startAudioContext() {
    if (Tone.context.state !== 'running') {
        await Tone.start().catch(e => {
            console.warn("Tone.js worklet failed to load, audio might be limited.", e);
        });
    }
    if (!audioReady) {
        initSounds();
    }
}