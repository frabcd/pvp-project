/*
 * ui.js
 * Manages all DOM interactions, screen switching, HUD rendering,
 * character select, minimap, tutorial, and other UI elements.
 */

import * as THREE from 'three';
import { $$ } from './utils.js';
import { CHARACTERS, SKILL_ICONS } from './constants.js';
import { gameState, tutorialState, loggedInUsers } from './state.js';
import { camera, renderer } from './scene.js';
import { createCharacterModel } from './models.js';
import { fetchLeaderboard } from './firebase.js';

// --- Local State for UI ---
let p1Select = -1, p2Select = -1, p1Locked = false, p2Locked = false;
let hudScenes = { p1: null, p2: null };
let hudCameras = { p1: null, p2: null };
let hudModels = { p1: null, p2: null };

// --- Screen & Component Management ---

/**
 * Switches the active visible screen.
 * @param {string | null} id The ID of the screen to activate, or null to hide all.
 */
export function switchScreenUI(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    if (id) {
        $$(id).classList.add('active');
    }
}

/**
 * Loads and displays the leaderboard for a specific mode.
 * @param {string} modeKey The key of the leaderboard to load.
 */
export async function loadLeaderboard(modeKey) {
    const table = $$('leaderboard-table');
    table.innerHTML = `
        <div class="leaderboard-header">
        <div class="rank">RANK</div><div class="name">NICKNAME</div><div class="score">WINS</div>
        </div>`;
    
    try {
        const rows = await fetchLeaderboard(modeKey);
        if (rows.length === 0) {
            table.innerHTML += '<div class="leaderboard-row"><div class="name" style="width:100%;text-align:center;">No games played yet.</div></div>';
        } else {
            rows.forEach(r => {
                const row = document.createElement('div');
                row.className = 'leaderboard-row';
                row.innerHTML = `<div class="rank">#${r.rank}</div><div class="name">${r.name}</div><div class="score">${r.wins}</div>`;
                table.appendChild(row);
            });
        }
    } catch (e) {
        console.error('Leaderboard load error:', e);
        table.innerHTML += '<div class="leaderboard-row"><div class="name" style="width:100%;text-align:center;color:red;">Error loading data.</div></div>';
    }
}

// --- Character Select Logic ---

/**
 * Populates and updates the character select screen.
 * @param {object | null} onlineState The current room state if online, else null.
 * @param {Function} onCharSelect Callback for online selection.
 * @param {Function} onGameStart Callback for starting a local/AI game.
 */
export function setupCharSelect(onlineState, onCharSelect, onGameStart) {
    const grid = $$('char-grid');
    const charKeys = Object.keys(CHARACTERS);

    if (gameState.get() !== 'CHAR_SELECT') grid.innerHTML = '';
    
    charKeys.forEach((key, index) => {
        let card = grid.querySelector(`.char-card[data-index='${index}']`);
        if (!card) {
            card = document.createElement('div');
            card.className = 'char-card';
            card.dataset.index = index;
            const char = CHARACTERS[key];
            card.innerHTML = `
            <div class="char-portrait" style="background-color:#${new THREE.Color(char.color).getHexString()};"></div>
            <h3 style="margin:8px 0; font-size: 1.1em;">${char.name}</h3>
            <div class="skills-preview" style="font-size:.75em;color:#aaa; text-align: left; padding: 0 5px;">
                <div style="color:#00ffff; font-weight:bold;">P: ${char.passive.name}</div>
                <div style="font-size:.9em; margin-bottom: 5px;">${char.passive.desc}</div>
                <div>Q: ${char.skills.s1.name}</div>
                <div>E: ${char.skills.s2.name}</div>
                <div>R: ${char.skills.s3.name}</div>
                <div style="color:#ffD700; font-weight:bold;">F: ${char.skills.s4.name}</div>
            </div>`;
            card.addEventListener('click', () => handleCardClick(index, onCharSelect, onGameStart));
            grid.appendChild(card);
        }
    });
    updateSelectors(onlineState);

    if (tutorialState.tutorialActive && tutorialState.tutorialStep === 2) {
        grid.querySelectorAll('.char-card').forEach(c => c.style.pointerEvents = 'auto');
    }
}

/**
 * BUG-FIX: This logic is now corrected to handle all 3 game modes.
 */
function handleCardClick(index, onCharSelect, onGameStart) {
    if (gameState.get() !== 'CHAR_SELECT') return;
    const charKeys = Object.keys(CHARACTERS);

    if (gameState.isOnline) {
        // --- ONLINE GAME ---
        onCharSelect(charKeys[index]);
    } else {
        // --- LOCAL DUEL or AI GAME ---
        if (!p1Locked) {
            // Player 1 picks
            p1Select = index;
            p1Locked = true;
            if (tutorialState.tutorialActive && tutorialState.tutorialStep === 2) {
                updateTutorial(3);
            }
            
            // If it's an AI game, auto-pick for AI and start
            if (gameState.isAIGame) {
                let aiSelect = Math.floor(Math.random() * charKeys.length);
                while (aiSelect === p1Select) {
                    aiSelect = Math.floor(Math.random() * charKeys.length);
                }
                onGameStart(charKeys[p1Select], charKeys[aiSelect]);
            }

        } else if (!gameState.isAIGame && !p2Locked) {
            // Player 2 picks (only in Local Duel)
            if (index === p1Select) return; // Can't pick the same char
            p2Select = index;
            p2Locked = true;
            if (tutorialState.tutorialActive && tutorialState.tutorialStep === 3) {
                updateTutorial(4);
            }
            // Start Local Duel game
            onGameStart(charKeys[p1Select], charKeys[p2Select]);
        }
        
        updateSelectors(null);
    }
}

function updateSelectors(onlineState) {
    const cards = document.querySelectorAll('.char-card');
    cards.forEach(card => card.classList.remove('locked-by-p1', 'locked-by-p2'));
    const status = $$('lock-in-status');
    const charKeys = Object.keys(CHARACTERS);

    let p1Name = loggedInUsers.p1 || 'Player 1';
    let p2Name = loggedInUsers.p2 || 'Player 2';

    if (gameState.isOnline && onlineState) {
        const myTurn = (gameState.online.isHost && !onlineState.p1CharKey) || (!gameState.online.isHost && !onlineState.p2CharKey);
        if (onlineState.p1CharKey) cards[charKeys.indexOf(onlineState.p1CharKey)]?.classList.add('locked-by-p1');
        if (onlineState.p2CharKey) cards[charKeys.indexOf(onlineState.p2CharKey)]?.classList.add('locked-by-p2');

        if (myTurn) {
            status.innerHTML = `<span style="color:${gameState.online.isHost ? '#00ffff' : '#ff00ff'};">Select Your Echo</span>`;
        } else {
            status.textContent = 'Waiting for opponent to select...';
        }
    } else {
        // Local or AI game
        if (p1Locked) cards[p1Select]?.classList.add('locked-by-p1');
        if (p2Locked) cards[p2Select]?.classList.add('locked-by-p2');

        if (!p1Locked) {
            status.innerHTML = `<span style="color:#00ffff;">${p1Name}:</span> Click to select your Echo`;
        }
        else if (gameState.isAIGame) {
             status.innerHTML = `<span style="color:#ff00ff;">AI (${gameState.selectedAITier})</span> is choosing...`;
             // Game will auto-start from handleCardClick
        }
        else if (!p2Locked) {
            status.innerHTML = `<span style="color:#ff00ff;">${p2Name}:</span> Click to select your Echo`;
        }
    }
}

/**
 * Resets the character select state.
 */
export function resetCharSelect() {
    p1Select = -1;
    p2Select = -1;
    p1Locked = false;
    p2Locked = false;
}

// --- In-Game HUD ---

/**
 * Creates the HUD for a player.
 * @param {1 | 2} playerNum 
 * @param {object} character 
 */
export function buildPlayerHUD(playerNum, character) {
    const hud = $$(`player${playerNum}-hud`);
    hud.className = 'player-hud';
    hud.style.borderColor = `#${new THREE.Color(character.color).getHexString()}`;
    const playerName = loggedInUsers[`p${playerNum}`] || `Player ${playerNum}`;
    const sk = character.skills;

    const hudScene = new THREE.Scene();
    hudScene.background = new THREE.Color(0x112233);
    const hudCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    hudCamera.position.set(0, 2.5, 4.5);
    hudCamera.lookAt(0, 2, 0);
    hudScene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const hudLight = new THREE.DirectionalLight(0xffffff, 1);
    hudLight.position.set(1, 1, 1);
    hudScene.add(hudLight);

    const hudModel = createCharacterModel(character, false); // From models.js
    hudModel.position.set(0, 0, 0);
    hudScene.add(hudModel);

    const canvas = document.createElement('canvas');
    canvas.className = 'portrait-canvas';

    hudScenes[`p${playerNum}`] = hudScene;
    hudCameras[`p${playerNum}`] = hudCamera;
    hudModels[`p${playerNum}`] = hudModel;

    hud.innerHTML = `
        <div class="portrait-container">
            <svg viewBox="0 0 36 36" class="circular-bars">
                <path class="bar-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.83 a 15.9155 15.9155 0 0 1 0 -31.83" stroke-width="3" />
                <path class="bar-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.83 a 15.9155 15.9155 0 0 1 0 -31.83" stroke-width="3" transform="scale(0.8) translate(4.5, 4.5)" />
                <path id="p${playerNum}-health-bar-fill" class="bar-fill" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.83 a 15.9155 15.9155 0 0 1 0 -31.83" stroke-width="3" stroke-dasharray="100, 100" stroke-dashoffset="0"/>
                <path id="p${playerNum}-energy-bar-fill" class="bar-fill" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.83 a 15.9155 15.9155 0 0 1 0 -31.83" stroke-width="3" stroke-dasharray="100, 100" stroke-dashoffset="0" transform="scale(0.8) translate(4.5, 4.5)" />
            </svg>
        </div>
        <div class="hud-details">
        <h2 style="margin:0 0 5px 0; font-size:1.1em">${playerName} (${character.name})</h2>
        <div class="skills-container">
            <div class="skill" id="p${playerNum}-skill-basicAttack">${SKILL_ICONS.basicAttack || ''}<div class="cooldown-overlay"></div></div>
            <div class="skill" id="p${playerNum}-skill-s1">${SKILL_ICONS[sk.s1.name] || ''}<div class="cooldown-overlay"></div></div>
            <div class="skill" id="p${playerNum}-skill-s2">${SKILL_ICONS[sk.s2.name] || ''}<div class="cooldown-overlay"></div></div>
            <div class="skill" id="p${playerNum}-skill-s3">${SKILL_ICONS[sk.s3.name] || ''}<div class="cooldown-overlay"></div></div>
            <div class="skill" id="p${playerNum}-skill-s4" style="border-color:#ffD700;">${SKILL_ICONS[sk.s4.name] || ''}<div class="cooldown-overlay"></div></div>
        </div>
        </div>`;

    hud.querySelector('.portrait-container').appendChild(canvas);
}

/**
 * Renders the 3D portraits in the HUD.
 * @param {number} delta Time since last frame.
 */
export function renderHUDs(delta) {
    for (const playerNum of [1, 2]) {
        const hudScene = hudScenes[`p${playerNum}`];
        const hudCamera = hudCameras[`p${playerNum}`];
        const hudModel = hudModels[`p${playerNum}`];
        const hud = $$(`player${playerNum}-hud`);
        const canvas = hud?.querySelector('.portrait-canvas');

        if (hudScene && hudCamera && hudModel && canvas) {
            hudModel.rotation.y += delta * 0.5;

            const rect = canvas.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                if (canvas.width !== rect.width || canvas.height !== rect.height) {
                    canvas.width = rect.width;
                    canvas.height = rect.height;
                    hudCamera.aspect = rect.width / rect.height;
                    hudCamera.updateProjectionMatrix();
                }

                const mainCanvasRect = renderer.domElement.getBoundingClientRect();
                const left = rect.left - mainCanvasRect.left;
                const bottom = mainCanvasRect.bottom - rect.bottom;

                renderer.setScissorTest(true);
                renderer.setScissor(left, bottom, rect.width, rect.height);
                renderer.setViewport(left, bottom, rect.width, rect.height);

                renderer.render(hudScene, hudCamera);
            }
        }
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, renderer.domElement.clientWidth, renderer.domElement.clientHeight);
}

/**
 * Updates HUD bar and cooldowns.
 * @param {Player[]} players Array of player objects.
 */
export function updateUI(players) {
    if (!players || players.length < 2) return;
    players.forEach((p, i) => {
        if (!p) return; // Add safety check
        const n = i + 1;
        const hb = $$(`p${n}-health-bar-fill`);
        const eb = $$(`p${n}-energy-bar-fill`);
        if (hb) hb.style.strokeDashoffset = 100 - (p.hp / p.maxHp) * 100;
        if (eb) eb.style.strokeDashoffset = 100 - (p.energy / p.maxEnergy) * 100;

        for (const key of ['basicAttack', 's1', 's2', 's3', 's4']) {
            if (!p.cooldowns || !p.cooldowns.hasOwnProperty(key)) continue;
            const el = $$(`p${n}-skill-${key}`); if (!el) continue;
            const overlay = el.querySelector('.cooldown-overlay');
            if (!overlay) continue;
            if (p.cooldowns[key] > 0) { overlay.style.opacity = '1'; overlay.textContent = p.cooldowns[key].toFixed(1); el.classList.remove('ready'); }
            else { overlay.style.opacity = '0'; el.classList.add('ready'); }
        }
    });
}

/**
 * Clears HUD elements and renderer data.
 */
export function clearHUD() {
    $$('player1-hud').innerHTML = '';
    $$('player2-hud').innerHTML = '';

    for (const key in hudScenes) {
        if (hudScenes[key]) {
            hudScenes[key].traverse(obj => {
                if (obj.geometry) obj.geometry.dispose();
                if (obj.material) {
                    if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                    else obj.material.dispose();
                }
            });
        }
    }
    hudScenes = { p1: null, p2: null };
    hudCameras = { p1: null, p2: null };
    hudModels = { p1: null, p2: null };
}

// --- Minimap ---

/**
 * Renders the minimap.
 * @param {Player[]} players Array of player objects.
 * @param {THREE.Box3[]} obstacles Array of obstacle colliders.
 * @param {number} arenaSize The size of the arena.
 */
export function updateMinimap(players, obstacles, arenaSize) {
    const map = $$('minimap');
    if (!map || gameState.get() !== 'ACTIVE') return;
    const ctx = map.getContext('2d');
    if (!ctx) return;

    const mapSize = 200; // Canvas dimensions
    const mapRadius = mapSize / 2;
    const mapScale = mapRadius / (arenaSize / 2); // Scale world radius to map radius

    const tx = (x) => mapRadius + x * mapScale;
    const ty = (z) => mapRadius + z * mapScale; // Use world Z for map Y

    ctx.clearRect(0, 0, mapSize, mapSize);

    // Clip subsequent drawing to the circle
    ctx.save();
    ctx.beginPath();
    ctx.arc(mapRadius, mapRadius, mapRadius, 0, Math.PI * 2);
    ctx.clip();

    // Draw obstacles (pylons)
    ctx.fillStyle = '#555';
    obstacles.forEach(obs => {
        const center = new THREE.Vector3();
        obs.getCenter(center);
        const size = new THREE.Vector3();
        obs.getSize(size);
        const mapX = tx(center.x - size.x / 2);
        const mapY = ty(center.z - size.z / 2);
        const mapW = size.x * mapScale;
        const mapH = size.z * mapScale;
        ctx.fillRect(mapX, mapY, mapW, mapH);
    });

    // Draw players
    if (players) {
        players.forEach((p, index) => {
            if (!p || p.isDead) return; // Safety check

            const mapX = tx(p.mesh.position.x);
            const mapY = ty(p.mesh.position.z);

            ctx.fillStyle = (p.playerNum === 1) ? '#00ffff' : '#ff00ff';
            ctx.beginPath();
            ctx.arc(mapX, mapY, 5, 0, Math.PI * 2);
            ctx.fill();

            const aim = p.aimDirection;
            const lineLength = 10;
            const endX = mapX + aim.x * lineLength;
            const endY = mapY + aim.z * lineLength;

            ctx.strokeStyle = ctx.fillStyle;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(mapX, mapY);
            ctx.lineTo(endX, endY);
            ctx.stroke();
        });
    }

    ctx.restore();
}

// --- Tutorial ---

/**
 * Updates the tutorial UI to a specific step.
 * @param {number} step The tutorial step number.
 */
export function updateTutorial(step) {
    if (!tutorialState.tutorialActive) return;

    tutorialState.tutorialStep = step;
    const overlay = $$('tutorial-overlay');
    const box = $$('tutorial-box');
    const text = $$('tutorial-text');
    const arrow = $$('tutorial-arrow');

    overlay.style.display = 'block';
    arrow.style.display = 'none'; // Hide by default
    box.style.top = '50%';
    box.style.left = '50%';
    box.style.transform = 'translate(-50%, -50%)';
    arrow.style.transform = 'rotate(0deg)';

    const positionEl = (el, targetSelector, xOffset = 0, yOffset = 0) => {
        const target = document.querySelector(targetSelector);
        if (!target) return;
        const rect = target.getBoundingClientRect();
        el.style.top = `${rect.top + yOffset}px`;
        el.style.left = `${rect.left + xOffset}px`;
        el.style.transform = 'translate(0, 0)';
    };

    const pointArrow = (targetSelector, rotation = 0, xOffset = 0, yOffset = 0) => {
        const target = document.querySelector(targetSelector);
        if (!target) return;
        arrow.style.display = 'block';
        const rect = target.getBoundingClientRect();
        arrow.style.top = `${rect.top + yOffset}px`;
        arrow.style.left = `${rect.left + xOffset}px`;
        arrow.style.transform = `rotate(${rotation}deg)`;
    };

    switch (step) {
        case 0:
            text.textContent = "Welcome! Let's learn to play. Please select 'Local Classic Duel' to begin.";
            positionEl(box, '.tab[data-mode="LOCAL_CLASSIC"]', 0, 80);
            pointArrow('.tab[data-mode="LOCAL_CLASSIC"]', 0, 70, -60);
            break;
        case 1:
            text.textContent = "Great! Now click 'START LOCAL DUEL'.";
            positionEl(box, '#start-button', 0, 80);
            pointArrow('#start-button', 0, 150, -60);
            break;
        case 2:
            text.textContent = "Choose your character. Click on any portrait to select them.";
            positionEl(box, '.char-card', -100, 150);
            pointArrow('.char-card', 0, 100, -60);
            break;
        case 3:
            text.textContent = "Now, choose a character for Player 2.";
            positionEl(box, '.char-card:nth-child(2)', -100, 150);
            pointArrow('.char-card:nth-child(2)', 0, 100, -60);
            break;
        case 4:
            text.textContent = "Get ready to fight! The game will begin shortly.";
            box.style.top = '60%';
            break;
        case 5:
            text.textContent = "Use W, A, S, D to move Player 1.";
            box.style.top = '50%';
            box.style.left = '25%';
            tutorialState.tutorialMoveTimer = 2; // Need 2 seconds of movement
            break;
        case 6:
            text.textContent = "This is your HUD. Watch your Health (green) and Energy (yellow).";
            positionEl(box, '#player1-hud', 0, -100);
            pointArrow('#player1-hud', 90, -70, 40);
            break;
        case 7:
            text.textContent = "Press 'Spacebar' to use your Basic Attack.";
            positionEl(box, '#p1-skill-basicAttack', 80, -80);
            pointArrow('#p1-skill-basicAttack', 0, -60, 10);
            break;
        case 8:
            text.textContent = "Press 'Q', 'E', 'R', and 'F' to use your skills. Skills cost energy!";
            positionEl(box, '#p1-skill-s2', 0, -80);
            pointArrow('#p1-skill-s2', 0, -60, 10);
            break;
        case 9:
            text.textContent = "Your opponent is Player 2 (on the right). Defeat them to win! Tutorial complete.";
            box.style.top = '50%';
            box.style.left = '50%';
            pointArrow('#player2-hud', 270, 20, -50);
            break;
        case 10:
            tutorialState.tutorialActive = false;
            overlay.style.display = 'none';
            break;
    }
}