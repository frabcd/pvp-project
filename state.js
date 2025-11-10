/*
 * state.js
 * Manages the global shared state of the application.
 */

import { MODES } from './constants.js';

// --- Private State ---
let _gameState = 'LOGIN_SCREEN';

// --- Public State ---
export const keys = {}; // For keyboard input
export const loggedInUsers = { p1: 'Player 1', p2: 'Player 2' };
export let loggedInUser = null; // Firebase auth user object

export let currentMode = MODES.LOCAL_CLASSIC;
export let isOnline = false;

// NEW: AI Game State
export let isAIGame = false;
export let selectedAITier = 'Pro'; // Default AI tier

// Online matchmaking state
export const online = {
    code: null,
    isHost: false,
    unsub: null, // Firebase listener unsubscriber
    eventsUnsub: null,
    ready: false,
    queueDocId: null
};

// BUG-FIX: Re-added the tutorialState
export const tutorialState = {
    tutorialActive: false,
    tutorialStep: 0,
    isGuest: false,
    tutorialMoveTimer: 0
};

// --- State Management Functions ---

export const gameState = {
    get: () => _gameState,
    set: (newState) => {
        console.log(`GameState transition: ${_gameState} -> ${newState}`);
        _gameState = newState;
    },
    // Add getters for convenience
    get isOnline() { return isOnline; },
    get currentMode() { return currentMode; },
    get online() { return online; },

    // NEW: AI State getters/setters
    get isAIGame() { return isAIGame; },
    setAIGame: (value) => { isAIGame = value; },
    
    get selectedAITier() { return selectedAITier; },
    setAITier: (value) => { selectedAITier = value; }
};

export function setLoggedInUser(user) {
    loggedInUser = user;
}

export function setCurrentMode(mode) {
    currentMode = mode;
    // This logic is crucial: an AI game is not considered "online"
    isOnline = (mode === MODES.ONLINE_CLASSIC || mode === MODES.ONLINE_RIFT) && !isAIGame;
}

export function resetOnlineState() {
    if (online.unsub) online.unsub();
    if (online.eventsUnsub) online.eventsUnsub();
    online.code = null;
    online.isHost = false;
    online.unsub = null;
    online.eventsUnsub = null;
    online.ready = false;
    online.queueDocId = null;
}