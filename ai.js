/*
 * ai.js
 * Contains the AI tier configurations and the new "Dual-Process Brain"
 * for AI-controlled opponents.
 *
 * THIS FILE HAS BEEN COMPLETELY REDESIGNED TO CREATE A "FLAWLESS" AI.
 *
 * 1. "Survival" Brain (Reflexes): Runs every frame.
 * - Scans for all threats (projectiles, AOEs).
 * - Finds the *single* safest escape path (checks 8 directions vs. walls & other bullets).
 * - Executes a perfect, frame-one dodge (using skills like Phase Shift if available).
 * - "Devil" AI has 0ms reaction time. "Noob" AI has a 750ms delay (it's "slow").
 *
 * 2. "Tactical" Brain (Intellect): Runs on a timer (if not dodging).
 * - Fixes the "Moving Too Small" bug by SETTING velocity, not ADDING it.
 * - Uses a Raycaster ("Eyes") to check for Line of Sight.
 * - Will "Reposition" if its path is blocked by a pylon.
 * - Calls "Mastery Brains" (Echo Prime/Oracle) to use skills offensively.
 */

import * as THREE from 'three';
import { obstacles } from './scene.js'; // Import the pylon obstacles

// --- AI Tier Configuration (Unchanged) ---
export const AI_TIERS = {
    "Noob": {
        decisionInterval: 2.0,  // Thinks slowly
        energyManagement: 0,
        engagementRange: 10,
        retreatHealth: 0.05,
        aimLag: 0.8,
        aimError: 10,
        aimPrediction: 0.0,
        dodgeChance: 0.1,       // 10% chance to even *try* to dodge
        dodgeReaction: 0.75,    // 750ms delay (sees the bullet, dodges way too late)
        comboExecution: 0.0,
        counterSkill: 0.0
    },
    "Adept": {
        decisionInterval: 1.0,
        energyManagement: 0,
        engagementRange: 15,
        retreatHealth: 0.15,
        aimLag: 0.4,
        aimError: 5,
        aimPrediction: 0.0,
        dodgeChance: 0.3,
        dodgeReaction: 0.4,
        comboExecution: 0.0,
        counterSkill: 0.0
    },
    "Pro": {
        decisionInterval: 0.5,
        energyManagement: 25,
        engagementRange: 20,
        retreatHealth: 0.25,
        aimLag: 0.15,
        aimError: 2,
        aimPrediction: 0.3,
        dodgeChance: 0.6,
        dodgeReaction: 0.2,
        comboExecution: 0.25,
        counterSkill: 0.1
    },
    "Master": {
        decisionInterval: 0.25,
        energyManagement: 50,
        engagementRange: 25,
        retreatHealth: 0.35,
        aimLag: 0.05,
        aimError: 0.5,
        aimPrediction: 0.75,
        dodgeChance: 0.9,
        dodgeReaction: 0.1, // 100ms delay (very fast)
        comboExecution: 0.8,
        counterSkill: 0.75
    },
    "Devil": {
        decisionInterval: 0.0,    // Thinks every frame
        energyManagement: 75,
        engagementRange: 30,
        retreatHealth: 0.5,
        aimLag: 0.0,              // Perfect aim
        aimError: 0.0,
        aimPrediction: 1.0,
        dodgeChance: 1.0,         // Always tries to dodge
        dodgeReaction: 0.0,       // 0ms delay (better than human)
        comboExecution: 1.0,
        counterSkill: 1.0
    }
};

// --- NEW: Helper objects for AI calculations ---
const aiRaycaster = new THREE.Raycaster();
const aiUpVector = new THREE.Vector3(0, 1, 0);
const DODGE_CHECK_DIRECTIONS = [
    new THREE.Vector3(1, 0, 0),    // E
    new THREE.Vector3(0.707, 0, 0.707),  // SE
    new THREE.Vector3(0, 0, 1),    // S
    new THREE.Vector3(-0.707, 0, 0.707), // SW
    new THREE.Vector3(-1, 0, 0),   // W
    new THREE.Vector3(-0.707, 0, -0.707),// NW
    new THREE.Vector3(0, 0, -1),   // N
    new THREE.Vector3(0.707, 0, -0.707) // NE
];


/**
 * The core AI "Brain". This function is called every frame
 * from the Player.update() method if the player is an AI.
 */
export function runAI(ai, delta, opponent, specialObjects) {
    if (!opponent || opponent.isDead || ai.isDead) {
        ai.velocity.set(0, 0, 0); // Stop moving
        return;
    }

    const config = ai.aiConfig;
    const state = ai.aiState;
    const target = opponent;
    
    // --- 1. SITUATIONAL ANALYSIS (The "Eyes") ---
    // The AI gathers all data a pro player would, every frame
    const analysis = situationalAnalysis(ai, target, specialObjects);

    // --- 2. PROCESS 1: The "Survival" Brain (Reflexes) ---
    // This runs every frame, regardless of the decision timer.
    // It's the AI's "flawless" superhuman reflexes.
    state.dodgeCooldown -= delta;
    if (state.dodgeCooldown <= 0 && analysis.incomingThreats.length > 0 && Math.random() < config.dodgeChance) {
        
        // Find the *best* safe escape path.
        const bestEscapePath = findBestEscapePath(ai, analysis);
        
        if (bestEscapePath) {
            // Dodge is delayed by AI's reaction time
            // "Devil" AI has 0ms delay. "Noob" has 750ms (it's too late).
            setTimeout(() => {
                if (ai.isDead) return;
                
                // --- The "Flexible Dodge" ---
                // Can we use a skill to dodge?
                if (ai.characterKey === 'ECHO_PRIME' && ai.cooldowns.s2 <= 0 && ai.energy >= ai.skills.s2.cost) {
                    // Use Phase Shift (S2) *as* the dodge!
                    ai.aimDirection.copy(bestEscapePath);
                    ai.useSkill('s2');
                } else {
                    // No skill available, use a standard velocity dodge
                    ai.velocity.copy(bestEscapePath.multiplyScalar(ai.speed * 1.8)); // 1.8x speed boost for dodge
                }
                
            }, config.dodgeReaction * 1000);

            state.dodgeCooldown = 1.0 / (config.dodgeChance || 0.1); // Cooldown on *trying* to dodge
            state.strategy = 'DODGING'; // Pauses the "Tactical" brain
        }
    }

    // If we are busy dodging, don't run the "Tactical" brain.
    if (state.strategy === 'DODGING') {
        if (state.dodgeCooldown > 0) return; // Still in dodge cooldown
        state.strategy = 'IDLE'; // Dodge finished, ready for new tactical thought
    }

    // --- 3. PROCESS 2: The "Tactical" Brain (Intellect) ---
    // This runs on a timer. It's the "thinking" part.
    state.decisionTimer -= delta;
    if (state.decisionTimer <= 0 || config.decisionInterval === 0.0) {
        state.decisionTimer = config.decisionInterval;
        
        // This single function runs the *entire* offensive/strategic brain
        runTacticalBrain(ai, opponent, config, analysis);
    }
    
    // --- 4. MOVEMENT MODULE (The "Moving Too Small" Fix) ---
    // This module now *executes* the strategy from the "Tactical" brain
    executeMovement(ai, config, analysis);
}


/**
 * (Phase 2) The "Eyes" of the AI.
 * Gathers all tactical data needed to make a "pro" decision.
 */
function situationalAnalysis(ai, target, specialObjects) {
    const aiPos = ai.mesh.position;
    const targetPos = target.mesh.position;
    const dist = aiPos.distanceTo(targetPos);
    
    // 1. Line of Sight (LoS) Check ("Is a pylon in the way?")
    let isPathBlocked = false;
    const dirToTarget = new THREE.Vector3().subVectors(targetPos, aiPos).normalize();
    if (dirToTarget.lengthSq() > 0.01) { // Only check if not on top of each other
        aiRaycaster.set(aiPos, dirToTarget);
        aiRaycaster.far = dist; // Only check distance to target
        
        // Check against the imported pylon 'obstacles' list
        for (const box of obstacles) {
            if (aiRaycaster.ray.intersectsBox(box)) {
                isPathBlocked = true;
                break;
            }
        }
    }

    // 2. Incoming Threat Check ("Am I about to get hit?")
    const incomingThreats = [];
    const projectiles = ai.getOpponentProjectiles(); // From player.js
    const futureAiPos = aiPos.clone().add(ai.velocity.clone().multiplyScalar(0.5)); // Where AI will be in 0.5s

    for (const proj of projectiles) {
        if (!proj.mesh || proj.isDestroyed) continue;
        
        // Where will the projectile be in 0.5s?
        const futureProjPos = proj.mesh.position.clone().add(proj.direction.clone().multiplyScalar(proj.speed * 0.5));
        
        // If the future positions are very close, it's a threat
        if (futureAiPos.distanceTo(futureProjPos) < 3.0 || aiPos.distanceTo(proj.mesh.position) < 3.0) {
            incomingThreats.push(proj);
        }
    }
    
    // Add ground hazards (like Static Field)
    for (const obj of specialObjects) {
        if (!obj.mesh || obj.isDestroyed || obj.owner === ai) continue;
        
        // Add any dangerous ground AOEs here
        const name = obj.constructor.name;
        if (name === 'StaticField' && aiPos.distanceTo(obj.mesh.position) < 4) {
             incomingThreats.push(obj); // Treat it like a threat
        }
        if (name === 'BlackHole' && aiPos.distanceTo(obj.mesh.position) < 3) {
             incomingThreats.push(obj);
        }
        if (name === 'CrushingSingularity' && aiPos.distanceTo(obj.mesh.position) < 2.5) {
             incomingThreats.push(obj);
        }
    }

    return {
        dist,
        isPathBlocked,
        incomingThreats,
        targetPos // Pass this through
    };
}


/**
 * (Phase 3) The "Flawless Escape" Module.
 * Finds the *best* safe path to escape incoming threats.
 */
function findBestEscapePath(ai, analysis) {
    let bestPath = null;
    let maxScore = -1000;
    const aiPos = ai.mesh.position;
    
    // Check all 8 directions
    for (const path of DODGE_CHECK_DIRECTIONS) {
        let score = 100; // Start with a base "good" score
        const dodgeTargetPos = aiPos.clone().add(path.clone().multiplyScalar(5)); // Where a 5-unit dodge would land

        // 1. Is path into a wall?
        aiRaycaster.set(aiPos, path);
        aiRaycaster.far = 5;
        for (const box of obstacles) {
            if (aiRaycaster.ray.intersectsBox(box)) {
                score = -1000; // Instantly invalid path
                break;
            }
        }
        if (score === -1000) continue; // Don't check this path further

        // 2. Is path into *another* bullet?
        for (const threat of analysis.incomingThreats) {
            if (threat.direction) { // Is it a projectile?
                const projDir = threat.direction.clone();
                const threatToDodgePath = new THREE.Vector3().subVectors(dodgeTargetPos, threat.mesh.position).normalize();
                
                // If the dodge path is *near* the projectile's path, it's bad
                if (projDir.dot(threatToDodgePath) > 0.8) { 
                    score -= 500; // Penalize dodging *with* a bullet
                }
            } else if (threat.mesh) { // Is it an AOE?
                // Check if the *destination* is in an AOE
                const name = threat.constructor.name;
                if (name === 'StaticField' && dodgeTargetPos.distanceTo(threat.mesh.position) < 4) {
                    score -= 600; // Penalize dodging *into* an AOE
                }
                // Add other AOE checks here
            }
        }

        // 3. (For Kiters) Does path also create distance?
        if (ai.characterKey === 'ECHO_PRIME') {
            const currentDist = analysis.dist;
            const newDist = dodgeTargetPos.distanceTo(analysis.targetPos);
            if (newDist > currentDist) {
                score += 50; // Reward dodges that create space
            }
        }

        if (score > maxScore) {
            maxScore = score;
            bestPath = path.clone();
        }
    }

    return (maxScore > 0) ? bestPath : null; // Only dodge if there is a *safe* path (score > 0)
}


/**
 * (Phase 3) The "Tactical" Brain (Intellect).
 * Decides the AI's offensive strategy and which skill to use.
 */
function runTacticalBrain(ai, opponent, config, analysis) {
    const { isPathBlocked } = analysis;

    // 1. Check for Line of Sight
    if (isPathBlocked) {
        // Path is blocked: Don't try to attack.
        // Set strategy to "REPOSITION" to find a new angle.
        ai.aiState.strategy = 'REPOSITION';
        
        // Find a flank point (to the side of the player)
        const flankDir = opponent.mesh.position.clone().sub(ai.mesh.position).applyAxisAngle(aiUpVector, Math.PI / 2).normalize();
        ai.aiState.repositionTarget.copy(opponent.mesh.position).add(flankDir.multiplyScalar(10));
        return; // End tactical thought.
    }

    // 2. Path is Clear: Find the best offensive skill.
    const bestSkillToUse = findBestOffensiveSkill(ai, opponent, config, analysis);

    if (bestSkillToUse) {
        // 3. Execute Skill: We found a good skill to use.
        ai.useSkill(bestSkillToUse);
        ai.aiState.strategy = 'WAITING'; // Pause movement briefly to cast
    } else {
        // 4. No Skill: Set default movement strategy.
        if (ai.characterKey === 'ECHO_PRIME') {
            ai.aiState.strategy = 'KITE';
        } else if (ai.characterKey === 'ORACLE') {
            const myTurret = specialObjects.find(o => o.constructor.name === 'SentryTurret' && o.owner === ai && !o.isDestroyed);
            ai.aiState.strategy = myTurret ? 'DEFEND_TURRET' : 'RETREAT_TO_CAST';
        } else {
            // Fallback for any other characters
            ai.aiState.strategy = ai.attackType === 'RANGED' ? 'KITE' : 'CHASE';
        }
    }
}

/**
 * (Phase 1) The "Moving Too Small" Fix.
 * This function now SETS velocity instead of ADDING it.
 */
function executeMovement(ai, config, analysis) {
    const { dist, targetPos } = analysis;
    const { strategy, repositionTarget } = ai.aiState;
    
    const move = new THREE.Vector3();
    let targetSpeed = ai.speed;

    // 1. Determine Move Direction based on Strategy
    switch (strategy) {
        case 'RETREAT_TO_CAST': // Oracle-specific: Back up to make space
            move.subVectors(ai.mesh.position, targetPos).normalize();
            break;
        
        case 'KITE': // Echo Prime-specific
            if (dist < config.engagementRange * 0.7) {
                move.subVectors(ai.mesh.position, targetPos).normalize(); // Too close, back up
            } else if (dist > config.engagementRange * 0.9) {
                move.subVectors(targetPos, ai.mesh.position).normalize(); // Too far, close in
            } else {
                // Perfect range, strafe
                move.subVectors(targetPos, ai.mesh.position).applyAxisAngle(aiUpVector, Math.PI / 2).normalize();
                if (Math.random() < 0.5) move.negate();
            }
            break;

        case 'DEFEND_TURRET': // Oracle-specific
            const myTurret = specialObjects.find(o => o.constructor.name === 'SentryTurret' && o.owner === ai && !o.isDestroyed);
            if (myTurret) {
                move.subVectors(myTurret.mesh.position, ai.mesh.position);
                if (move.length() < 5) targetSpeed = 0; // Stay near turret
                else move.normalize();
            } else {
                ai.aiState.strategy = 'KITE'; // Turret died, switch to kiting
            }
            break;

        case 'REPOSITION': // "Stuck on wall" fix
            move.subVectors(repositionTarget, ai.mesh.position);
            if (move.length() < 2) {
                ai.aiState.strategy = 'KITE'; // Reached flank point
            } else {
                move.normalize();
            }
            break;

        case 'CHASE': // Default/Melee
            move.subVectors(targetPos, ai.mesh.position).normalize();
            break;
        
        case 'WAITING': // Paused to cast a skill
        case 'DODGING': // Handled by survival brain
        case 'IDLE':
        default:
            targetSpeed = 0;
            break;
    }

    // 2. Set Aim
    const aimVector = new THREE.Vector3().subVectors(targetPos, ai.mesh.position).normalize();
    if (config.aimLag > 0) {
        ai.aimDirection.lerp(aimVector, 1.0 - config.aimLag).normalize();
    } else {
        ai.aimDirection.copy(aimVector);
    }
    
    // 3. Execute Velocity (THE FIX)
    if (targetSpeed > 0 && move.lengthSq() > 0) {
        // **This is the fix.** We SET velocity, not ADD.
        // This makes the AI move at its full, correct speed.
        ai.velocity.copy(move.multiplyScalar(targetSpeed));
    }
    // If targetSpeed is 0, the velocity will naturally decay from player.js friction.
}


/**
 * (Phase 3) The "Intellect" Brain.
 * Finds the best *offensive* or *strategic* skill to use.
 * (Note: Does not score "dodge" skills, as the Survival brain handles that).
 */
function findBestOffensiveSkill(ai, opponent, config, analysis) {
    let bestSkill = null;
    let maxScore = 0; // Only use skills with a positive score

    // Check all skills
    for (const key of ['s1', 's2', 's3', 's4', 'basicAttack']) {
        const skill = (key === 'basicAttack') ? { name: 'basicAttack', cost: 0, tags: ['damage'] } : ai.skills[key];
        if (!skill) continue;

        // 1. Check Cooldowns & Cost
        if (ai.cooldowns[key] > 0 || ai.energy < skill.cost) continue;
        
        // 2. Check Energy Management
        const remainingEnergy = ai.energy - skill.cost;
        const reservedEnergy = (config.energyManagement / 100) * ai.maxEnergy;
        if (remainingEnergy < reservedEnergy) continue; // Save energy

        // 3. Get score from "Mastery Brain"
        let score = 0;
        if (ai.characterKey === 'ECHO_PRIME') {
            score = calculateEchoPrimeScore(key, skill, ai, opponent, config, analysis);
        } else if (ai.characterKey === 'ORACLE') {
            score = calculateOracleScore(key, skill, ai, opponent, config, analysis);
        } else {
            // Generic fallback for un-mastered characters
            if (skill.tags.includes('damage')) score = 15;
            if (key === 'basicAttack') score = 10; // <-- *** FIX IS HERE ***
        }

        // 4. Global "Finisher" bonus
        if (opponent.hp < 20 && skill.tags.includes('damage')) {
            score += 200;
        }

        if (score > maxScore) {
            maxScore = score;
            bestSkill = key;
        }
    }
    
    return bestSkill;
}


/**
 * (Phase 3) "Mastery Brain" for Echo Prime (Kiter)
 * This brain is *purely* for offensive/strategic skill use.
 * The "Survival" brain handles dodging with Phase Shift separately.
 */
function calculateEchoPrimeScore(key, skill, ai, opponent, config, analysis) {
    const { dist } = analysis;
    
    switch (key) {
        case 's1': // Power Shot
            if (dist < 8) return -50; // Too close, don't use
            return 70; // Good poke
        
        case 's2': // Phase Shift
            return 0; // **CRITICAL**: This skill is *only* for the "Survival" brain.
                      // The "Tactical" brain will *never* choose it.
        
        case 's3': // Static Field
            if (dist < 6) return 80; // "Get off me" tool
            return 0;
            
        case 's4': // Overcharge (Ultimate)
            if (opponent.hp / opponent.maxHp < 0.6) return 200; // Finisher
            if (ai.hp / ai.maxHp < 0.3) return -50; // Don't buff if dying
            return 10; // Low priority otherwise
            
        case 'basicAttack':
            if (dist < 15) return 10; // Default action
            return 0;
    }
    return 0;
}

/**
 * (Phase 3) "Mastery Brain" for Oracle (Zone Controller)
 */
function calculateOracleScore(key, skill, ai, opponent, config, analysis) {
    const { dist } = analysis;
    const myTurret = specialObjects.find(o => o.constructor.name === 'SentryTurret' && o.owner === ai && !o.isDestroyed);

    switch (key) {
        case 's1': // Empower (Buff)
            if (myTurret && myTurret.mesh.position.distanceTo(ai.mesh.position) < 10) {
                return 80; // Buff the turret!
            }
            return 20; // Just buff self
        
        case 's2': // Sentry Turret
            if (!myTurret) return 1000; // **#1 PRIORITY**
            return -1000; // Don't cast if one is already up
        
        case 's3': // Bastion Protocol (Shield)
            if (ai.hp / ai.maxHp < 0.6) return 90; // Good defensive
            if (dist < 8) return 100; // Pre-shield a rush
            return 0;
            
        case 's4': // Salvation (Ultimate)
            if (ai.hp / ai.maxHp < 0.3) return 1000; // Panic button
            return -100; // Don't waste it
            
        case 'basicAttack':
            if (dist < 20) return 10; // Default action
            return 0;
    }
    return 0;
}