/*
 * main.js
 * The main entry point for the Chroma Core Arena application.
 * Initializes the game, connects all modules, and runs the main game loop.
 *
 * V-FIX:
 * - Rewrote `endGame` to handle draws (winnerNum = 0)
 * - Rewrote `animate` loop to fix simultaneous death bug & "no game end" bug
 * - Rewrote `animate` loop to use "Mark-and-Sweep" for objects (fixes lag)
 * - Moved network push from `setInterval` to `animate` loop (fixes jitter)
 */

// --- 1. IMPORTS ---
import * as THREE from 'three';
import {
    auth, db, fb, signupNickname, loginNickname, guestLogin, explainAuthError,
    addWin, fetchLeaderboard, findMatch, listenQueueDoc, cancelMatchmaking,
    listenRoom, setStarted, pushState, pushSkillEvent, wireEventsListener,
    setWinner, selectCharacterOnline, exportLeaderboardSnapshot, importLeaderboardSnapshot,
    ROOMS, QUEUE // Make sure QUEUE is imported
} from './firebase.js';
import {
    scene, camera, renderer, composer, controls, clock, arenaSize, obstacles
} from './scene.js';
import {
    MODES, CHARACTERS, controlsP1P2
} from './constants.js';
import { $$ } from './utils.js';
import { startAudioContext } from './sound.js';
import {
    Player, setPlayerDependencies
} from './player.js';
import {
    switchScreenUI, loadLeaderboard, setupCharSelect, resetCharSelect,
    buildPlayerHUD, renderHUDs, updateUI, clearHUD, updateMinimap, updateTutorial
} from './ui.js';
import {
    gameState, keys, loggedInUsers, setLoggedInUser,
    setCurrentMode, tutorialState, online, resetOnlineState,
    loggedInUser // <-- BUG-FIX: This import was missing
} from './state.js';
import { Rift } from './game-objects.js'; // Import Rift for mode check

// --- 2. GLOBAL GAME LISTS ---
let players = [];
let projectiles = [];
let specialObjects = [];
let gameEnded = false;
let aiFallbackTimer = null; // NEW: Timer for AI matchmaking
let networkPushTimer = 0; // V-FIX: Timer for network push
const NETWORK_PUSH_INTERVAL = 0.1; // 100ms

// --- 3. DEPENDENCY INJECTION ---
// Give the Player class access to the global lists
setPlayerDependencies(projectiles, specialObjects, players);

// Make critical functions globally accessible (for Player class)
// This is a bridge until the Player class is fully decoupled
window.pushSkillEvent = (skillKey) => {
    if (gameState.isOnline && online.code) {
        pushSkillEvent(online.code, online.isHost, skillKey);
    }
};

// --- 4. CORE GAME FLOW ---

/**
 * NEW: Starts an AI fallback game.
 * This is triggered by the 20-second timer.
 */
function startAIGame() {
    console.log(`No match found. Starting AI game with tier: ${gameState.selectedAITier}`);
    if (aiFallbackTimer) clearTimeout(aiFallbackTimer);
    aiFallbackTimer = null;

    // Clean up Firebase queue
    if (online.queueDocId) {
        // BUG-FIX: Call cancelMatchmaking, but ensure we proceed
        // to setupAIGameState() regardless of success or failure.
        cancelMatchmaking(online.queueDocId, online.unsub)
            .catch(err => {
                console.error("Error cancelling matchmaking for AI game:", err);
                // We must continue, so we don't leave the user stuck
            })
            .finally(() => {
                online.queueDocId = null;
                online.unsub = null;
                setupAIGameState();
            });
    } else {
        setupAIGameState();
    }
}

/**
 * NEW: Helper function to set up AI game state
 */
function setupAIGameState() {
    gameState.setAIGame(true);
    setCurrentMode(gameState.currentMode); // This will set isOnline = false
    
    // BUG-FIX: Use the imported loggedInUser
    loggedInUsers.p1 = loggedInUser?.displayName || 'Player 1';
    loggedInUsers.p2 = `AI (${gameState.selectedAITier})`;

    gameState.set('CHAR_SELECT');
    switchScreenUI('char-select-screen');
    setupCharSelect(
        null, // No online state
        (charKey) => { /* AI selection is automatic */ },
        startGame // Pass startGame as the final callback
    );
}

/**
 * Starts the game with the selected characters.
 * @param {string} p1CharKey 
 * @param {string} p2CharKey 
 */
function startGame(p1CharKey, p2CharKey) {
    if (gameState.get() === 'ACTIVE') return;
    
    gameEnded = false;

    // NEW: Check if this is an AI game
    if (gameState.isAIGame) {
        console.log(`Starting AI game: P1 (${p1CharKey}) vs AI (${p2CharKey})`);
        gameState.set('ACTIVE');
        players = [
            new Player(1, p1CharKey),
            new Player(2, p2CharKey, gameState.selectedAITier) // Pass AI tier
        ];
    } else if (gameState.isOnline) {
        console.log(`Starting ONLINE game: P1 (${p1CharKey}) vs P2 (${p2CharKey})`);
        gameState.set('ACTIVE');
        if (online.isHost) {
            setStarted(online.code);
        }
        players = [new Player(1, p1CharKey), new Player(2, p2CharKey)];
    } else {
        // Local game
        console.log(`Starting LOCAL game: P1 (${p1CharKey}) vs P2 (${p2CharKey})`);
        gameState.set('ACTIVE');
        players = [new Player(1, p1CharKey), new Player(2, p2CharKey)];
    }

    setPlayerDependencies(projectiles, specialObjects, players); // Re-set dependencies

    // Reset camera to game view
    camera.position.set(0, 30, 25);
    camera.lookAt(0, 0, 0);
    controls.target.set(0, 0, 0);
    controls.enabled = false;
    controls.autoRotate = false;

    buildPlayerHUD(1, CHARACTERS[p1CharKey]);
    buildPlayerHUD(2, CHARACTERS[p2CharKey]);

    if (gameState.currentMode.rift) {
        specialObjects.push(new Rift());
    }

    switchScreenUI(null);
    $$('ui-container').style.opacity = '1';

    let count = 3;
    $$('countdown-text').textContent = count;
    $$('game-message-container').style.display = 'flex';

    const i = setInterval(() => {
        count--;
        if (count > 0) {
            $$('countdown-text').textContent = count;
        } else {
            clearInterval(i);
            $$('countdown-text').textContent = 'FIGHT!';
            if (tutorialState.tutorialActive && tutorialState.tutorialStep === 4) {
                updateTutorial(5);
            }
            setTimeout(() => {
                $$('game-message-container').style.display = 'none';
            }, 1000);
        }
    }, 1000);
}

/**
 * V-FIX: Ends the game and declares a winner.
 * @param {number} winnerNum The player number (1 or 2) who won, or 0 for a draw.
 */
function endGame(winnerNum) {
    if (gameEnded) return; // Prevent this from running multiple times
    gameEnded = true;
    gameState.set('GAME_OVER'); // Set state *before* showing screen

    console.log(`Game over. Winner: Player ${winnerNum}`);
    const p1Nick = loggedInUsers.p1 || 'Player 1';
    const p2Nick = loggedInUsers.p2 || 'Player 2';
    
    // --- NEW: Handle Draw (0) ---
    let winnerText;
    if (winnerNum === 0) {
        winnerText = "DRAW!";
    } else {
        const winnerName = (winnerNum === 1) ? p1Nick : p2Nick;
        winnerText = `${winnerName} WINS!`;
    }
    
    $$('winner-text').innerHTML = winnerText;
    // --- END NEW LOGIC ---

    // --- Add Win Logic ---
    // NEW: Don't record wins against AI or for draws
    if (!tutorialState.isGuest && loggedInUser && !gameState.isAIGame && winnerNum !== 0) {
        let won = false;
        if (gameState.isOnline) {
            won = (online.isHost && winnerNum === 1) || (!online.isHost && winnerNum === 2);
        }
        // Add local win tracking logic here if desired

        if (won) {
            addWin(loggedInUser.uid, gameState.currentMode.key);
        }

        if (gameState.isOnline && online.isHost && online.code) {
            setWinner(online.code, winnerNum)
                .catch(e => console.error("Error setting winner:", e));
        }
    }

    // Show the Game Over screen after a delay
    setTimeout(() => {
        switchScreenUI('game-over-screen');
        controls.enabled = true;
        controls.autoRotate = true;
    }, 2000);
}

/**
 * Resets all game state and returns to the menu.
 * @param {boolean} returnToMenu True to go to start-screen, false to go to login.
 */
function resetGame(returnToMenu = false) {
    console.log("Resetting game...");
    gameEnded = false;
    gameState.set('START_SCREEN');
    gameState.setAIGame(false); // NEW: Reset AI game flag

    // NEW: Clear any pending AI timer
    if (aiFallbackTimer) {
        clearTimeout(aiFallbackTimer);
        aiFallbackTimer = null;
    }

    players.forEach(p => p.destroy());
    players = [];
    projectiles.forEach(p => p.destroy());
    projectiles = [];
    for (let i = specialObjects.length - 1; i >= 0; i--) {
        if (typeof specialObjects[i].destroy === 'function') {
            specialObjects[i].destroy();
        }
    }
    specialObjects = [];
    
    // V-FIX: Clear arrays for mark-and-sweep
    projectiles.length = 0;
    specialObjects.length = 0;
    
    // Re-set dependencies with empty arrays
    setPlayerDependencies(projectiles, specialObjects, players);

    resetCharSelect();
    clearHUD();
    $$('ui-container').style.opacity = '0';
    $$('game-message-container').style.display = 'none';

    if (gameState.isOnline || online.code) {
        if (online.code && online.isHost) {
            fb.deleteDoc(fb.doc(ROOMS, online.code)).catch(e => console.error("Error deleting room:", e));
        }
        resetOnlineState();
    }
    
    // Ensure isOnline is correctly reset
    setCurrentMode(gameState.currentMode);

    controls.enabled = true;
    controls.autoRotate = true;

    if (returnToMenu) {
        switchScreenUI('start-screen');
        $$('room-status').textContent = '';
        $$('find-match-button').disabled = false;
        $$('cancel-match-button').style.display = 'none';
    } else {
        switchScreenUI('login-screen');
    }
}

// --- 5. NETWORK & EVENT LISTENERS ---

function wireRoomListener() {
    if (!online.code) {
        console.error("wireRoomListener called with no code.");
        return;
    }
    if (online.unsub) online.unsub();
    console.log("Wiring room listener for room:", online.code);

    online.unsub = listenRoom(online.code, (room) => {
        if (!room) {
            console.log("Room data is null, detaching listener for:", online.code);
            if (online.unsub) online.unsub();
            online.unsub = null;
            if (gameState.get() !== 'START_SCREEN' && gameState.get() !== 'LOGIN_SCREEN' && gameState.get() !== 'GAME_OVER') {
                console.error("Room connection lost. Returning to main menu.");
                const statusElement = $$('room-status') || $$('login-message');
                if (statusElement) {
                    statusElement.textContent = "Room connection lost. Returning to menu...";
                }
                setTimeout(() => resetGame(true), 1500);
            }
            return;
        }
        console.log("Received room update:", room);

        if (gameState.get() === 'CHAR_SELECT') {
            setupCharSelect(room.state, 
                (charKey) => selectCharacterOnline(online.code, online.isHost, charKey),
                (p1, p2) => startGame(p1, p2) // This won't be called online
            );
        }

        if (room.host.id && room.guest.id && !room.state.started && gameState.get() !== 'CHAR_SELECT') {
            console.log("Both players joined, moving to char select");
            loggedInUsers.p1 = room.host.nick;
            loggedInUsers.p2 = room.guest.nick;
            gameState.set('CHAR_SELECT');
            switchScreenUI('char-select-screen');
            setupCharSelect(room.state,
                (charKey) => selectCharacterOnline(online.code, online.isHost, charKey),
                (p1, p2) => startGame(p1, p2)
            );
        }

        if (room.state.p1CharKey && room.state.p2CharKey && gameState.get() === 'CHAR_SELECT') {
            console.log("Both players locked in, starting game and wiring events listener");
            if (online.eventsUnsub) online.eventsUnsub(); // Clear previous listener
            online.eventsUnsub = wireEventsListener(online.code, online.isHost, (skillKey) => {
                const opponent = online.isHost ? players[1] : players[0];
                if (opponent && typeof opponent.useSkillRemote === 'function') {
                    opponent.useSkillRemote(skillKey);
                }
            });
            startGame(room.state.p1CharKey, room.state.p2CharKey);
        }

        if (gameState.get() === 'ACTIVE' && room.state.started) {
            const oppState = online.isHost ? room.state.p2 : room.state.p1;
            const opp = online.isHost ? players[1] : players[0];
            if (opp && oppState) {
                if (oppState.pos) {
                    opp.networkTargetPosition.set(oppState.pos.x, oppState.pos.y, oppState.pos.z);
                }
                if (typeof oppState.energy !== 'undefined') opp.energy = oppState.energy;
                
                // HP is handled client-side, but we can sync if network HP is lower
                if (typeof oppState.hp !== 'undefined' && opp.hp > oppState.hp) {
                    opp.hp = oppState.hp;
                    if (opp.hp <= 0 && !opp.isDead) opp.die();
                }
            }
            
            const meState = online.isHost ? room.state.p1 : room.state.p2;
            const me = online.isHost ? players[0] : players[1];
            if(me && meState && !me.isDead) {
                if (typeof meState.hp !== 'undefined' && me.hp > meState.hp) {
                    me.hp = meState.hp;
                    if (me.hp <= 0) me.die();
                }
            }
        }
        if (room.state.winner && gameState.get() !== 'GAME_OVER' && !gameEnded) { // Check gameEnded
            console.log("Winner declared via network:", room.state.winner);
            endGame(room.state.winner);
        }
    }, (error) => {
        console.error("Error in room listener:", error);
        if (gameState.get() !== 'START_SCREEN' && gameState.get() !== 'LOGIN_SCREEN') {
            console.error("Error connecting to room. Returning to main menu.");
            const statusElement = $$('room-status') || $$('login-message');
            if (statusElement) statusElement.textContent = "Error connecting to room. Returning to menu...";
            setTimeout(() => resetGame(true), 1500);
        }
    });
}

// V-FIX: REMOVED old setInterval for network push

// --- 6. UI EVENT BINDINGS ---

// --- Login Screen ---
$$('signup-button').addEventListener('click', async () => {
    const nick = ($$('login-nickname')?.value || '').trim(), pass = ($$('login-password')?.value || '').trim();
    if (nick.length < 3 || pass.length < 4) { $$('login-message').textContent = 'Invalid nickname or password.'; return; }
    try {
        await signupNickname(nick, pass);
        const user = await loginNickname(nick, pass);
        tutorialState.isGuest = false;
        handleSuccessfulLogin(user);
    } catch (e) { explainAuthError(e); }
});
$$('login-button').addEventListener('click', async () => {
    const nick = ($$('login-nickname')?.value || '').trim(), pass = ($$('login-password')?.value || '').trim();
    if (!nick || !pass) { $$('login-message').textContent = 'Enter nickname and password.'; return; }
    try {
        const user = await loginNickname(nick, pass);
        tutorialState.isGuest = false;
        handleSuccessfulLogin(user);
    } catch (e) { explainAuthError(e); }
});
$$('guest-login-button').addEventListener('click', async () => {
    try {
        const user = await guestLogin();
        tutorialState.isGuest = true;
        handleSuccessfulLogin(user);
    } catch (e) { explainAuthError(e); }
});

// BUG-FIX: This now correctly handles the "New Account Tutorial"
async function handleSuccessfulLogin(user) {
    setLoggedInUser(user);
    loggedInUsers.p1 = user.displayName; // Set default P1 name

    let isNew = false;
    if (!tutorialState.isGuest && loggedInUser) {
        try {
            const userDoc = await fb.getDoc(fb.doc(db, "users", loggedInUser.uid));
            if (userDoc.exists() && userDoc.data().isNewAccount === true) {
                isNew = true;
            }
        } catch (e) {
            console.error("Error checking user doc for tutorial:", e);
        }
    }

    if (isNew) {
        // This is the "New Account Tutorial" logic you were missing
        gameState.set('TUTORIAL_PROMPT');
        switchScreenUI('tutorial-prompt-screen');
    } else {
        gameState.set('START_SCREEN');
        switchScreenUI('start-screen');
    }
}

// BUG-FIX: This logic is now present and correct
// --- Tutorial Prompt Screen ---
$$('tutorial-start-button').addEventListener('click', () => {
    tutorialState.tutorialActive = true;
    tutorialState.tutorialStep = 0;
    if (loggedInUser && !tutorialState.isGuest) {
        fb.updateDoc(fb.doc(db, "users", loggedInUser.uid), { isNewAccount: false }).catch(console.error);
    }
    gameState.set('START_SCREEN');
    switchScreenUI('start-screen');
    updateTutorial(0);
});
$$('tutorial-skip-button').addEventListener('click', () => {
    tutorialState.tutorialActive = false;
    if (loggedInUser && !tutorialState.isGuest) {
        fb.updateDoc(fb.doc(db, "users", loggedInUser.uid), { isNewAccount: false }).catch(console.error);
    }
    gameState.set('START_SCREEN');
    switchScreenUI('start-screen');
});

// --- Start Screen ---
document.querySelectorAll('#mode-tabs .tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('#mode-tabs .tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    setCurrentMode(MODES[t.dataset.mode]);
    
    $$('online-controls').style.display = gameState.isOnline ? 'block' : 'none';
    $$('start-button').style.display = gameState.isOnline ? 'none' : 'inline-block';

    if (tutorialState.tutorialActive && tutorialState.tutorialStep === 0 && gameState.currentMode.key === 'LOCAL_CLASSIC') {
        updateTutorial(1);
    }
}));

// BUG-FIX: This now works for Local Duel
$$('start-button').addEventListener('click', () => {
    if (!gameState.isOnline) {
        loggedInUsers.p1 = loggedInUser?.displayName || 'Player 1';
        loggedInUsers.p2 = 'Player 2';
        gameState.set('CHAR_SELECT');
        switchScreenUI('char-select-screen');
        setupCharSelect(null, null, startGame); // Pass startGame as callback
        if (tutorialState.tutorialActive && tutorialState.tutorialStep === 1) {
            updateTutorial(2);
        }
    }
});
$$('leaderboard-button').addEventListener('click', () => {
    gameState.set('LEADERBOARD');
    switchScreenUI('leaderboard-screen');
    loadLeaderboard('LOCAL_CLASSIC');
});
$$('settings-button').addEventListener('click', () => {
    gameState.set('SETTINGS');
    switchScreenUI('settings-screen');
});

// NEW: AI Fallback Tier Selector
$$('ai-fallback-tier').addEventListener('change', (e) => {
    gameState.setAITier(e.target.value);
    console.log(`AI Tier set to: ${e.target.value}`);
});

// NEW: Modified Find Match button
$$('find-match-button').addEventListener('click', async () => {
    if (aiFallbackTimer) clearTimeout(aiFallbackTimer); // Clear any old timer
    
    $$('room-status').textContent = 'Searching for opponent... (Matching with AI in 20s)';
    // BUG-FIX: Reset buttons *here* when search starts
    $$('find-match-button').disabled = true;
    $$('cancel-match-button').style.display = 'inline-block';

    // Start the 20-second AI fallback timer
    aiFallbackTimer = setTimeout(startAIGame, 20000); // 20 seconds

    try {
        const queueId = await findMatch(gameState.currentMode.key, online);
        if (queueId) { // We are host (or guest who found a match)
            online.queueDocId = queueId;
            if (online.isHost) {
                // We are host, listen to our queue doc
                online.unsub = listenQueueDoc(queueId, online, () => {
                    if (aiFallbackTimer) clearTimeout(aiFallbackTimer); // Human found
                    aiFallbackTimer = null;
                    wireRoomListener();
                });
            } else {
                // We are guest, match was made, clear timer and wire room
                if (aiFallbackTimer) clearTimeout(aiFallbackTimer);
                aiFallbackTimer = null;
                wireRoomListener();
            }
        }
        // Note: if queueId is null but online.code is set, we are a guest
        else if (online.code) { 
             if (aiFallbackTimer) clearTimeout(aiFallbackTimer);
             aiFallbackTimer = null;
             wireRoomListener();
        }
    } catch (e) {
        console.error("Matchmaking Error:", e);
        if (aiFallbackTimer) clearTimeout(aiFallbackTimer);
        aiFallbackTimer = null;
        // BUG-FIX: Reset buttons on error
        $$('room-status').textContent = 'Error: Could not search. Check permissions.';
        $$('find-match-button').disabled = false;
        $$('cancel-match-button').style.display = 'none';
    }
});
$$('cancel-match-button').addEventListener('click', async () => {
    if (aiFallbackTimer) clearTimeout(aiFallbackTimer); // Cancel AI timer
    aiFallbackTimer = null;
    online.queueDocId = await cancelMatchmaking(online.queueDocId, online.unsub);
    online.unsub = null;
    
    // BUG-FIX: Moved UI reset logic here
    $$('find-match-button').disabled = false;
    $$('cancel-match-button').style.display = 'none';
    $$('room-status').textContent = '';
});


// --- Leaderboard Screen ---
document.querySelectorAll('#lb-tabs .tab').forEach(t => t.addEventListener('click', () => {
    document.querySelectorAll('#lb-tabs .tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    loadLeaderboard(t.dataset.lb);
}));
$$('leaderboard-back-button').addEventListener('click', () => {
    gameState.set('START_SCREEN');
    switchScreenUI('start-screen');
});
$$('export-leaderboard-button').addEventListener('click', exportLeaderboardSnapshot);
$$('import-leaderboard-button').addEventListener('click', () => importLeaderboardSnapshot(loadLeaderboard));


// --- Settings Screen ---
$$('settings-back-button').addEventListener('click', () => {
    gameState.set('START_SCREEN');
    switchScreenUI('start-screen');
});

// BUG-FIX: This is the "Back to Menu" button you were missing
// --- Game Over Screen ---
$$('restart-button').addEventListener('click', () => {
    resetGame(true);
});

// --- Keyboard & Audio Listeners ---
document.body.addEventListener('click', startAudioContext, { once: true });

window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = true;

    if (gameState.get() === 'ACTIVE') {
        let playerToControl = null;
        let controlsToUse = null;

        if (gameState.isOnline && !gameState.isAIGame) {
            // Online Human vs Human
            playerToControl = online.isHost ? players[0] : players[1];
            controlsToUse = controlsP1P2.p1;
        } else if (gameState.isAIGame) {
            // Local Human vs AI
            playerToControl = players[0]; // Human is always P1
            controlsToUse = controlsP1P2.p1;
        } else {
            // Local Human vs Human
            const p1c = controlsP1P2.p1;
            const p2c = controlsP1P2.p2;
            if (Object.values(p1c).includes(key) && players[0]) {
                playerToControl = players[0];
                controlsToUse = p1c;
            } else if (Object.values(p2c).includes(key) && players[1]) {
                playerToControl = players[1];
                controlsToUse = p2c;
            }
        }

        if (playerToControl && controlsToUse && !playerToControl.isAI) { // Check !isAI
            if (key === controlsToUse.basicAttack) playerToControl.useSkill('basicAttack');
            else if (key === controlsToUse.skill1) playerToControl.useSkill('s1');
            else if (key === controlsToUse.skill2) playerToControl.useSkill('s2');
            else if (key === controlsToUse.skill3) playerToControl.useSkill('s3');
            else if (key === controlsToUse.skill4) playerToControl.useSkill('s4');

            if (tutorialState.tutorialActive && playerToControl.playerNum === 1 && tutorialState.tutorialStep === 7 && key === controlsToUse.basicAttack) {
                updateTutorial(8);
                setTimeout(() => updateTutorial(9), 8000);
                setTimeout(() => updateTutorial(10), 14000);
            }
        }
    }
});

window.addEventListener('keyup', (e) => {
    keys[e.key.toLowerCase()] = false;
});


// --- 7. MAIN LOOP ---

function animate() {
    requestAnimationFrame(animate);
    const delta = Math.min(0.05, clock.getDelta()); // Cap delta

    controls.update(); // Update camera controls (for menu rotation)

    if (gameState.get() === 'ACTIVE') {
        const p1 = players[0];
        const p2 = players[1];

        // V-FIX: Correct Game Over and Draw Logic
        if (p1 && p2 && !gameEnded) {
            // Check for death conditions
            const p1Died = !p1.isDead && p1.hp <= 0;
            const p2Died = !p2.isDead && p2.hp <= 0;

            if (p1Died) p1.die();
            if (p2Died) p2.die();

            // Check for game end
            if (p1.isDead && p2.isDead) {
                endGame(0); // Draw
            } else if (p1.isDead) {
                endGame(2); // P2 Wins
            } else if (p2.isDead) {
                endGame(1); // P1 Wins
            }
        }
        // --- END V-FIX ---

        // Update players if not dead
        if (p1 && !p1.isDead) p1.update(delta, p2, specialObjects);
        if (p2 && !p2.isDead) p2.update(delta, p1, specialObjects);
        
        // V-FIX: Use Mark-and-Sweep for projectiles (fix lag)
        for (let i = 0; i < projectiles.length; i++) {
            const p = projectiles[i];
            if (p && !p.isDestroyed) {
                p.update(delta, players);
            }
        }

        // V-FIX: Use Mark-and-Sweep for special objects (fix lag)
        for (let i = 0; i < specialObjects.length; i++) {
            const o = specialObjects[i];
            if (o && !o.isDestroyed) {
                o.update(delta, players, projectiles);
                if (o.duration <= 0) {
                    o.destroy(); // This will set o.isDestroyed = true
                }
            }
        }
        
        // V-FIX: Filter out destroyed objects *after* loops
        projectiles = projectiles.filter(p => p && !p.isDestroyed);
        specialObjects = specialObjects.filter(o => o && !o.isDestroyed);
        setPlayerDependencies(projectiles, specialObjects, players); // Update dependencies
        // --- END V-FIX ---

        // Update tutorial timer (if active)
        if (tutorialState.tutorialActive && tutorialState.tutorialStep === 5 && tutorialState.tutorialMoveTimer <= 0) {
             updateTutorial(6);
             setTimeout(() => updateTutorial(7), 5000);
        }

        updateUI(players);
        updateMinimap(players, obstacles, arenaSize);
        
        // V-FIX: Move network push to the animate loop
        networkPushTimer -= delta;
        if (networkPushTimer <= 0) {
            networkPushTimer = NETWORK_PUSH_INTERVAL;
            if (gameState.isOnline && !gameState.isAIGame && gameState.get() === 'ACTIVE' && online.code) {
                const me = online.isHost ? players[0] : players[1];
                if (me && !me.isDead) {
                    pushState(online.code, online.isHost, {
                        pos: { x: me.mesh.position.x, y: me.mesh.position.y, z: me.mesh.position.z },
                        energy: me.energy,
                        hp: me.hp
                    }).catch(() => { });
                }
            }
        }
        // --- END V-FIX ---
    }

    composer.render(delta); // Render main scene

    if (gameState.get() === 'ACTIVE') {
        renderHUDs(delta); // Render HUDs on top
    }
}

// --- 8. STARTUP ---
camera.position.set(0, 25, 35);
camera.lookAt(0, 0, 0);
animate(); // Start the loop