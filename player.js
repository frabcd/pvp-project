/*
 * player.js
 * Contains the main Player class, including all logic for
 * movement, status effects, damage, and skill execution.
 *
 * V-FIX:
 * - Replaced framerate-dependent friction with framerate-independent damping (fixes AI/player movement)
 * - Fixed damage flash logic (moved to `update`) to prevent "forever white" race condition
 * - Hardened `die()` and `destroy()` methods to prevent visual bugs and game state errors
 */

import * as THREE from 'three';
import { scene, obstacles, arenaSize } from './scene.js';
import { CHARACTERS, controlsP1P2 } from './constants.js';
import { createCharacterModel } from './models.js';
import { audioReady, sounds } from './sound.js';
import { gameState, tutorialState, keys } from './state.js';
import {
    setProjectileList, setSpecialObjectList,
    Projectile, ParticleSystem, ExpandingRing, SpawnEffect, PlayerAura,
    StatusEffectVisual, StaticField, ShieldEffect, SlowingMine, LaserCore,
    WindWall, StasisField, Cyclone, Decimate, MeleeSlash, TectonicSlam,
    SentryTurret, StatusAura, EyeOfTheStorm, CrushingSingularity, ImplosionEffect,
    BarrierWall, BlackHole, AdrenalHaze, BladeFury, SandSoldier, SoldierWall,
    OrbitalStrikeMarker, Thunderstorm, PulverizeLeap, TimeStopEffect,
    GaleForceTornado, AnvilTurret, PlagueCloud, ShadowStrikeDash, FloatingDamageText
} from './game-objects.js';
// NEW: Import AI logic
import { runAI, AI_TIERS } from './ai.js';

// We need to get the global lists from main.js for the player's skills
let projectiles = [];
let specialObjects = [];
let players = [];
export function setPlayerDependencies(projList, specList, playerList) {
    projectiles = projList;
    specialObjects = specList;
    players = playerList;
    setProjectileList(projList);
    setSpecialObjectList(specList);
}

// --- NEW: Framerate-independent damping factor ---
// We use an exponential decay calculation: factor = decay^(delta)
// A decay of 0.00001 per second is very high friction.
const FRICTION_DAMPING = 0.00001;

export class Player {
    // NEW: Modified constructor to accept aiTier
    constructor(playerNum, characterKey, aiTier = null) {
        this.playerNum = playerNum;
        this.characterKey = characterKey;
        const d = CHARACTERS[characterKey];
        this.mesh = createCharacterModel(d);
        this.mesh.position.set(playerNum === 1 ? -15 : 15, 0, 0);
        scene.add(this.mesh);
        this.collider = new THREE.Box3().setFromObject(this.mesh);
        this.maxHp = d.hp; this.hp = d.hp;
        this.maxEnergy = 100; this.energy = 100;
        this.speed = d.speed; this.skills = d.skills; this.passive = d.passive;
        this.attackType = d.attackType;
        this.attackRange = this.attackType === 'MELEE' ? 4.0 : 0;
        this.status = {
            slowed: 0, rooted: 0, silenced: 0, shielded: 0, spellShield: 0,
            unstoppable: 0, cloaked: 0, empowered: 0, venom: 0, corruption: 0,
            feedbackLoop: 0, isCharging: 0, riftBuff: 0, nextAttackVenom: false,
            targetingArray: 0, parry: 0, siege: 0, dashTarget: null,
            gravityMarks: 0, gravityMarkTimer: 0, implosionTarget: null, implosionTimer: 0
        };
        this.statusMeshes = {}; this.riftLight = null;
        this.cooldowns = { basicAttack: 0, s1: 0, s2: 0, s3: 0, s4: 0 };
        this.velocity = new THREE.Vector3();
        this.aimDirection = new THREE.Vector3();
        this.rewindPositions = []; this.rewindTimer = 0;
        this.isDead = false;
        
        // --- NEW: Damage Flash State ---
        this.damageFlashTimer = 0;
        this.originalEmissives = null;

        // Passive-specific state
        this.passiveState = {
            resonanceStacks: 0,
            fortressTimer: 0,
            staticChargeStacks: 0,
            firewallTimer: 20,
            illusionTimer: 45,
            lastSkillTime: -1,
            attackSpeedStacks: 0,
            attackSpeedTimer: 0
        };

        // NEW: AI Initialization
        this.isAI = !!aiTier;
        this.aiConfig = aiTier ? AI_TIERS[aiTier] : null;
        this.aiState = aiTier ? {
            decisionTimer: 0,
            strategy: 'IDLE', // Start with IDLE, AI will pick a strategy
            dodgeCooldown: 0
        } : null;

        if (this.passive.name === "Juggernaut") this.maxHp *= 1.1; this.hp = this.maxHp;
        if (this.passive.name === "Swiftness") this.speed *= 1.05;
        // RONIN HP BUFF (from constants.js, no extra logic needed)
        
        this.networkTargetPosition = this.mesh.position.clone();

        this.aura = null;
        switch (characterKey) {
            case 'ECHO_PRIME': case 'TEMPEST': this.aura = new PlayerAura(this, 50, d.color, 2, .15); break;
            case 'AEGIS': case 'COLOSSUS': case 'FORGE': this.aura = new PlayerAura(this, 40, d.color, 1, .2); break;
            case 'SPECTRE': case 'NULL': this.aura = new PlayerAura(this, 60, d.color, 3, .1); break;
            case 'MIRAGE': this.aura = new PlayerAura(this, 60, d.color, 1, .15); break; // Emperor aura
            case 'JAVELIN': this.aura = new PlayerAura(this, 30, d.color, 4, .1); break;
            case 'GLITCH': case 'CHRONOMANCER': case 'VORTEX': this.aura = new PlayerAura(this, 40, d.color, 1.5, .15); break;
            case 'ORACLE': case 'CATALYST': this.aura = new PlayerAura(this, 70, d.color, .8, .18); break;
            case 'ZEPHYR': case 'RONIN': this.aura = new PlayerAura(this, 60, d.color, 5, .12); break;
        }
        if (this.aura && this.aura.mesh) specialObjects.push(this.aura);

        this.statusVisuals = {
            empowered: new StatusEffectVisual(this, 'empowered', 0xffff00),
            venom: new StatusEffectVisual(this, 'venom', 0x00ff7f, 30, 'drip'),
            corruption: new StatusEffectVisual(this, 'corruption', 0x800080, 40, 'cloud'),
            gravityMark: new StatusEffectVisual(this, 'gravityMark', 0x6a0dad, 20, 'ring')
        };
        specialObjects.push(...Object.values(this.statusVisuals));
    }

    // NEW: Helper for AI dodge module
    getOpponentProjectiles() {
        // Find projectiles not owned by this player (the AI)
        return projectiles.filter(p => {
             const pOwner = (p.owner?.constructor?.name === "Player") ? p.owner : p.owner?.owner;
             return pOwner !== this && !p.isDestroyed; // V-FIX: Check isDestroyed
        });
    }
    
    updatePassive(delta, opponent) {
        // Update passive timers
        for (const k of ['firewallTimer', 'illusionTimer', 'fortressTimer', 'attackSpeedTimer']) {
            if (this.passiveState[k] > 0) this.passiveState[k] = Math.max(0, this.passiveState[k] - delta);
        }

        if (this.passive.name === "Imperial Will" && this.passiveState.attackSpeedTimer <= 0) {
            this.passiveState.attackSpeedStacks = 0;
        }

        switch (this.passive.name) {
            case "Fortress":
                const isMoving = this.velocity.lengthSq() > 0.1;
                if (!isMoving && this.status.rooted <= 0) {
                    this.passiveState.fortressTimer += delta;
                    if (this.passiveState.fortressTimer >= 2 && this.status.shielded <= 0.1) {
                        this.hp = Math.min(this.maxHp, this.hp + 20);
                        specialObjects.push(new ShieldEffect(this, 0.5, 0xaaaaff));
                        this.passiveState.fortressTimer = -5;
                    }
                } else {
                    this.passiveState.fortressTimer = 0;
                }
                break;
            case "Event Horizon":
                if (this.status.gravityMarks >= 3) {
                    this.status.gravityMarks = 0;
                    this.status.gravityMarkTimer = 0;
                    if (opponent) {
                        opponent.status.rooted = 1.5;
                        const pullDir = new THREE.Vector3().subVectors(this.mesh.position, opponent.mesh.position);
                        if (pullDir.length() > 5) {
                            pullDir.normalize();
                            opponent.velocity.add(pullDir.multiplyScalar(25));
                        }
                        specialObjects.push(new ParticleSystem(opponent.mesh.position.clone().setY(2), {
                            count: 60, duration: 0.8, speed: 6,
                            startColor: new THREE.Color(0x6a0dad), endColor: new THREE.Color(0xff00ff)
                        }));
                    }
                }
                break;
        }
    }

    // NEW: Modified update loop
    update(delta, opponent, specialObjects) { // <-- BUG-FIX: Added specialObjects
        if (this.isDead) return;

        // Determine if this client has authority over this player
        const isMyPlayer = !gameState.isOnline ||
            (gameState.isAIGame && this.playerNum === 1) || // In AI game, P1 is human
            (!gameState.isAIGame && ((gameState.online.isHost && this.playerNum === 1) || (!gameState.online.isHost && this.playerNum === 2)));

        // --- 1. AI / INPUT ---
        if (this.isAI) {
            // NEW: AI Brain Hook (passes specialObjects)
            runAI(this, delta, opponent, specialObjects);
        }
        else if (isMyPlayer) {
            // Player is HUMAN and CONTROLLED LOCALLY
            const move = new THREE.Vector3(0, 0, 0);
            if (this.status.rooted <= 0 && this.status.siege <= 0) {
                // Use P1 controls in online/AI games, or P1/P2 controls in local
                const c = (gameState.isOnline || gameState.isAIGame) ? controlsP1P2.p1 : controlsP1P2[`p${this.playerNum}`];
                if (keys[c.forward]) move.z -= 1;
                if (keys[c.backward]) move.z += 1;
                if (keys[c.left]) move.x -= 1;
                if (keys[c.right]) move.x += 1;

                if (tutorialState.tutorialActive && tutorialState.tutorialStep === 5 && move.lengthSq() > 0) {
                    tutorialState.tutorialMoveTimer = Math.max(0, tutorialState.tutorialMoveTimer - delta);
                    // Tutorial advancement is handled in main.js
                }
            }
            if (move.lengthSq() > 0) {
                move.normalize();
                let sp = this.speed * (this.status.riftBuff > 0 ? 1.5 : 1);
                if (this.status.slowed > 0 && this.status.unstoppable <= 0) sp *= .5;
                this.velocity.add(move.multiplyScalar(sp * delta * 20));
            }
        }
        
        // --- 2. STATUS & REGEN ---
        for (const k in this.cooldowns) this.cooldowns[k] = Math.max(0, this.cooldowns[k] - delta);
        for (const k in this.status) if (typeof this.status[k] === 'number') this.status[k] = Math.max(0, this.status[k] - delta);
        
        if (this.status.gravityMarkTimer <= 0 && this.status.gravityMarks > 0) {
            this.status.gravityMarks = 0;
        }
        if (this.status.gravityMarks > 0 && this.statusVisuals.gravityMark.mesh) {
            this.statusVisuals.gravityMark.mesh.visible = true;
            this.statusVisuals.gravityMark.mesh.material.opacity = 0.3 + (this.status.gravityMarks * 0.2);
        } else if (this.statusVisuals.gravityMark.mesh) {
            this.statusVisuals.gravityMark.mesh.visible = false;
        }
        
        if (this.status.venom > 0) this.takeDamage(10 * delta, true);
        if (this.status.feedbackLoop > 0 && opponent && opponent.energy < opponent.maxEnergy) opponent.takeDamage(15 * delta, true);
        
        if (this.status.implosionTimer > 0) {
            this.status.implosionTimer -= delta;
            if (this.status.implosionTimer <= 0 && this.status.implosionTarget) {
                this.takeDamage(30);
                const pullDir = new THREE.Vector3().subVectors(this.status.implosionTarget.mesh.position, this.mesh.position);
                if (pullDir.lengthSq() > 0.01) {
                    this.velocity.add(pullDir.normalize().multiplyScalar(20));
                }
                this.status.implosionTarget = null;
            }
        }

        let energyRegen = 5 + (gameState.currentMode.rift ? 15 : 0) + (this.status.riftBuff > 0 ? 10 : 0);
        if (this.passive.name === "Juggernaut") energyRegen *= 0.8;
        this.energy = Math.min(this.maxEnergy, this.energy + energyRegen * delta);

        this.updatePassive(delta, opponent);
        this.updateDamageFlash(delta); // --- NEW: Handle damage flash ---

        // --- 3. MOVEMENT & PHYSICS ---
        if (this.status.isCharging > 0 && this.characterKey === 'AEGIS') { let cs = 40; this.velocity.copy(this.aimDirection).multiplyScalar(cs); }

        if (this.status.isCharging > 0 && this.characterKey === 'MIRAGE') {
            const soldier = this.status.dashTarget;
            if (soldier && soldier.mesh && soldier.duration > 0) {
                const dir = new THREE.Vector3().subVectors(soldier.mesh.position, this.mesh.position);
                if (dir.length() < 1.5) {
                    this.status.isCharging = 0;
                    this.velocity.set(0, 0, 0);
                } else {
                    dir.normalize();
                    this.velocity.copy(dir).multiplyScalar(35);
                }
            } else {
                this.status.isCharging = 0;
            }
        }

        // Apply physics to local players and AI
        // Remote players are moved by lerping
        if (isMyPlayer || this.isAI) {
            this.mesh.position.add(this.velocity.clone().multiplyScalar(delta));
        } else {
            // Is remote player
            this.mesh.position.lerp(this.networkTargetPosition, 0.25);
            this.mesh.position.add(this.velocity.clone().multiplyScalar(delta)); // Client-side prediction
        }

        // --- NEW: Framerate-independent friction ---
        this.velocity.multiplyScalar(Math.pow(FRICTION_DAMPING, delta));
        
        this.mesh.position.x = Math.max(-arenaSize / 2 + 1, Math.min(arenaSize / 2 - 1, this.mesh.position.x));
        this.mesh.position.z = Math.max(-arenaSize / 2 + 1, Math.min(arenaSize / 2 - 1, this.mesh.position.z));

        if (opponent && !opponent.isDead) {
            // AI aiming is handled in runAI
            if (!this.isAI) {
                 this.aimDirection.subVectors(opponent.mesh.position, this.mesh.position).normalize();
            }
            const lookAt = this.mesh.position.clone().add(this.aimDirection);
            lookAt.y = this.mesh.position.y;
            this.mesh.lookAt(lookAt);
        }

        // --- 4. COLLISION & STATE ---
        this.collider.setFromObject(this.mesh);
        obstacles.forEach(obs => { if (this.collider.intersectsBox(obs)) this.resolveCollision(obs); });
        if (opponent && !opponent.isDead && this.collider.intersectsBox(opponent.collider)) {
            if (this.status.isCharging > 0 && this.characterKey === 'AEGIS') {
                opponent.takeDamage(25);
                const kb = this.aimDirection.clone().multiplyScalar(20);
                opponent.velocity.add(kb);
                this.status.isCharging = 0;
            }
            this.resolveCollision(opponent.collider, .5);
            opponent.resolveCollision(this.collider, .5);
        }

        this.rewindTimer += delta;
        if (this.rewindTimer > .25) { this.rewindTimer = 0; this.rewindPositions.push({ pos: this.mesh.position.clone(), hp: this.hp, energy: this.energy }); if (this.rewindPositions.length > 20) this.rewindPositions.shift(); }

        this.updateStatusVisuals();
        this.mesh.traverse(child => { if (child.isMesh && child.material) { child.material.transparent = this.status.cloaked > 0; child.material.opacity = this.status.cloaked > 0 ? .3 : 1; } });
    }
    
    // --- NEW: Damage Flash Update Logic ---
    updateDamageFlash(delta) {
        if (this.damageFlashTimer > 0) {
            this.damageFlashTimer = Math.max(0, this.damageFlashTimer - delta);
            if (this.damageFlashTimer === 0) {
                // Timer just finished, restore emissives
                if (this.mesh && this.originalEmissives) {
                    this.mesh.traverse(c => {
                        if (c.isMesh && c.material && c.material.emissive && this.originalEmissives.has(c.uuid)) {
                            c.material.emissive.setHex(this.originalEmissives.get(c.uuid));
                        } else if (c.isMesh && c.material && c.material.emissive) {
                            c.material.emissive.setHex(0x000000); // Fallback
                        }
                    });
                }
                this.originalEmissives = null; // Clear saved state
            }
        }
    }

    updateStatusVisuals() {
        if (this.isDead) return;
        if (this.status.rooted > 0 && !this.statusMeshes.root) { const g = new THREE.TorusGeometry(1.2, .05, 8, 32), m = new THREE.MeshBasicMaterial({ color: 0xff0000 }); const r = new THREE.Mesh(g, m); r.rotation.x = Math.PI / 2; scene.add(r); this.statusMeshes.root = r; }
        else if (this.status.rooted <= 0 && this.statusMeshes.root) { scene.remove(this.statusMeshes.root); this.statusMeshes.root.geometry.dispose(); this.statusMeshes.root.material.dispose(); this.statusMeshes.root = null; }
        if (this.statusMeshes.root) { this.statusMeshes.root.position.copy(this.mesh.position); this.statusMeshes.root.position.y = .1; }

        if (this.status.slowed > 0 && !this.statusMeshes.slow) { const g = new THREE.TorusGeometry(1.3, .05, 8, 32), m = new THREE.MeshBasicMaterial({ color: 0x0000ff }); const r = new THREE.Mesh(g, m); r.rotation.x = Math.PI / 2; scene.add(r); this.statusMeshes.slow = r; }
        else if (this.status.slowed <= 0 && this.statusMeshes.slow) { scene.remove(this.statusMeshes.slow); this.statusMeshes.slow.geometry.dispose(); this.statusMeshes.slow.material.dispose(); this.statusMeshes.slow = null; }
        if (this.statusMeshes.slow) { this.statusMeshes.slow.position.copy(this.mesh.position); this.statusMeshes.slow.position.y = .15; }

        if (this.status.riftBuff > 0 && !this.riftLight) { this.riftLight = new THREE.PointLight(0xff00ff, 5, 5); this.mesh.add(this.riftLight); }
        else if (this.status.riftBuff <= 0 && this.riftLight) { this.mesh.remove(this.riftLight); this.riftLight.dispose(); this.riftLight = null; }

        Object.values(this.statusVisuals).forEach(v => v.update(0));
    }

    resolveCollision(otherBox, pushFactor = 1.0) {
        if (this.isDead) return;
        if (this.status.isCharging > 0 && otherBox.isPylon && this.characterKey === 'AEGIS') {
            this.status.isCharging = 0;
            this.status.rooted = 1.5;
            this.velocity.set(0, 0, 0);
            specialObjects.push(new ParticleSystem(this.mesh.position, { count: 50, duration: 0.5, speed: 5 }));
        }
        const cP = new THREE.Vector3(); this.collider.getCenter(cP);
        const cO = new THREE.Vector3(); otherBox.getCenter(cO);
        const sP = new THREE.Vector3(); this.collider.getSize(sP);
        const sO = new THREE.Vector3(); otherBox.getSize(sO);
        const dx = cO.x - cP.x, penX = (sP.x / 2 + sO.x / 2) - Math.abs(dx);
        const dz = cO.z - cP.z, penZ = (sP.z / 2 + sO.z / 2) - Math.abs(dz);
        if (penX > 0 && penZ > 0) {
            const canBePushed = (this.status.rooted <= 0 && this.status.unstoppable <= 0) || !otherBox.isPylon;
            if (canBePushed) {
                if (penX < penZ) this.mesh.position.x -= penX * Math.sign(dx) * pushFactor;
                else this.mesh.position.z -= penZ * Math.sign(dz) * pushFactor;
                this.collider.setFromObject(this.mesh);
            }
        }
    }

    takeDamage(amount, isDoT = false) {
        if (this.isDead) return;
        if(this.status.shielded>0 && !isDoT) return; // Status shield blocks non-DoT

        // Firewall passive check
        if (this.passive.name === "Firewall" && this.passiveState.firewallTimer <= 0 && !isDoT) {
            this.passiveState.firewallTimer = 20;
            specialObjects.push(new ShieldEffect(this, 1, 0xf0e68c));
            return; // Block the damage
        }

        if(this.status.spellShield>0 && !isDoT){ this.status.spellShield=0; return; } // Spell shield blocks
        if(this.status.parry>0 && !isDoT) { // Parry blocks and stuns attacker
            this.status.parry = 0;
            const opponent = players.find(p=>p!==this);
            if(opponent) opponent.status.rooted = 1.5;
            return;
        }

        let dmg=amount;
        if(this.status.corruption>0) dmg*=1.3; // Take more damage if corrupted
        if(this.status.empowered>0) dmg*=.7; // Take less damage if empowered

        this.hp = Math.max(0, this.hp - dmg);

        if(!isDoT){
            // Add floating damage text
            const damagePosition = this.mesh.position.clone().add(new THREE.Vector3(0, 3.5, 0)); // Position above head
            specialObjects.push(new FloatingDamageText(dmg, damagePosition));

            // Hit particle effect
            specialObjects.push(new ParticleSystem(this.mesh.position.clone().setY(2), {
                count: 30, duration: 0.6, speed: 8, startColor: new THREE.Color(0xff0000), endColor: new THREE.Color(0x440000), startSize: 0.2, endSize: 0
            }));
            if(audioReady) sounds.hit.triggerAttackRelease("C2","8n");

            // --- DAMAGE FLASH LOGIC (V-FIX) ---
            // Only save original colors if we are not *already* flashing
            if (this.damageFlashTimer <= 0) {
                this.originalEmissives = new Map();
                this.mesh.traverse(c => {
                    if (c.isMesh && c.material && c.material.emissive) {
                        this.originalEmissives.set(c.uuid, c.material.emissive.getHex());
                    }
                });
                
                // Set to white
                this.mesh.traverse(c => {
                    if (c.isMesh && c.material && c.material.emissive) {
                        c.material.emissive.setHex(0xffffff);
                    }
                });
            }
            // Start or reset the flash timer
            this.damageFlashTimer = 0.15; // 150ms
            // --- END DAMAGE FLASH LOGIC ---
        }
        if(this.hp<=0) this.die();
    }

    die() {
        // V-FIX: Add check to prevent multiple 'die' calls
        if (this.isDead || gameState.get() === 'GAME_OVER') return;
        
        this.isDead = true;
        this.hp = 0;

        // --- Restore Colors Immediately on Death (V-FIX) ---
        this.damageFlashTimer = 0; // Stop any pending flash logic
        if (this.originalEmissives) {
            this.mesh.traverse(c => {
                if (c.isMesh && c.material && c.material.emissive && this.originalEmissives.has(c.uuid)) {
                    c.material.emissive.setHex(this.originalEmissives.get(c.uuid));
                } else if (c.isMesh && c.material && c.material.emissive) {
                    c.material.emissive.setHex(0x000000); // Fallback
                }
            });
            this.originalEmissives = null;
        }
        // --- End Restore Colors ---

        // Death particle effect
        specialObjects.push(new ParticleSystem(this.mesh.position.clone().setY(2), {
            count: 200, duration: 1.5, speed: 12, startColor: new THREE.Color(this.mesh.children[0].material.color), endColor: new THREE.Color(0x000000), startSize: 0.25, endSize: 0
        }));
        if(audioReady) sounds.death.triggerAttackRelease("8n");

        this.mesh.visible = false; // Hide mesh

        // Clean up status visuals
        Object.values(this.statusMeshes).forEach(m=>{ if(m) scene.remove(m); });
        this.statusMeshes = {};
        if (this.riftLight) this.mesh.remove(this.riftLight);
        this.riftLight = null;

        // Clean up aura
        if (this.aura) {
            this.aura.destroy();
            const auraIndex = specialObjects.indexOf(this.aura);
            if(auraIndex > -1) specialObjects.splice(auraIndex, 1);
            this.aura = null;
        }

        // V-FIX: Don't set state here. Let the main.js 'animate' loop
        // detect the death and call endGame. This fixes the simultaneous
        // death (draw) bug.
    }

    destroy() {
         // --- Restore Colors Before Destroy (V-FIX) ---
         this.damageFlashTimer = 0;
         if (this.originalEmissives && this.mesh) {
             this.mesh.traverse(c => {
                 if (c.isMesh && c.material && c.material.emissive && this.originalEmissives.has(c.uuid)) {
                     c.material.emissive.setHex(this.originalEmissives.get(c.uuid));
                 }
             });
             this.originalEmissives = null;
         }
         // --- End Restore Colors ---

         if(this.mesh) {
            scene.remove(this.mesh);
            this.mesh.traverse(child => {
               if (child.geometry) child.geometry.dispose();
               if (child.material) {
                 if (Array.isArray(child.material)) {
                   child.material.forEach(mat => { if(mat && mat.dispose) mat.dispose(); });
                 } else {
                   if (child.material.dispose) child.material.dispose();
                 }
               }
            });
            this.mesh = null; // Prevent errors if destroy is called again
         }

         // Clean up status visuals
         Object.values(this.statusMeshes).forEach(m=>{ if(m) { scene.remove(m); if(m.geometry) m.geometry.dispose(); if(m.material) m.material.dispose();} });
         this.statusMeshes = {};

         // Clean up aura
         if (this.aura) {
             this.aura.destroy();
             const auraIndex = specialObjects.indexOf(this.aura);
             if (auraIndex > -1) specialObjects.splice(auraIndex, 1);
             this.aura = null;
         }

         // Clean up owned special objects (e.g., Turrets)
         for(let i=specialObjects.length-1;i>=0;i--){
             if(specialObjects[i].owner===this){
                 if (typeof specialObjects[i].destroy === 'function') specialObjects[i].destroy();
                 specialObjects.splice(i,1);
             }
         }
    }

    useSkill(skillKey) {
        if (this.isDead || this.cooldowns[skillKey] > 0 || this.status.silenced > 0) return;

        const skill = (skillKey === 'basicAttack') ? { cost: 0, cd: this.status.siege > 0 ? 1.5 : 0.5 } : this.skills[skillKey];
        if (!skill || this.energy < skill.cost) return;

        // AI does not send network events
        if (gameState.isOnline && !this.isAI) {
            window.pushSkillEvent(skillKey);
        }

        this.executeSkill(skillKey);
    }

    useSkillRemote(skillKey) {
        if (this.isDead) return;
        console.log(`Executing remote skill: ${skillKey} for player ${this.playerNum}`);
        this.executeSkill(skillKey, true);
    }

    applyPassiveCooldown(skillKey) {
        // Apply cooldown reduction passives here
        if (this.passive.name === "Time Flux" && skillKey !== 'basicAttack') {
             this.cooldowns[skillKey] *= 0.95; // 5% CDR
        }
    }

    executeSkill(skillKey, isRemote = false) {
        if (this.isDead) return;

        const fireDir = this.aimDirection.clone();
        const opponent = players.find(p => p !== this);
        let bonusDamage = 0;
        let bonusRange = 0;

        // --- Passive Logic on Skill Use (Only for local player/AI) ---
        if (!isRemote) {
            if (this.passive.name === "Way of the Blade" && skillKey !== 'basicAttack') {
                this.passiveState.lastSkillTime = 3; // Buff lasts 3 seconds
            }
        }

        // --- Basic Attack Logic ---
        if (skillKey === 'basicAttack') {
            if (!isRemote) {
                let atkSpeed = 1.0;
                if (this.characterKey === 'MIRAGE') { // Emperor passive
                    atkSpeed = 1 + (this.passiveState.attackSpeedStacks || 0) * 0.2; // 20% per stack
                }
                this.cooldowns.basicAttack = (this.status.siege > 0 ? 1.5 : 0.5) / atkSpeed;
                this.applyPassiveCooldown('basicAttack'); // Apply CDR passive if relevant

                // --- Passive Logic on Basic Attack ---
                if (this.passive.name === "Resonance") {
                    this.passiveState.resonanceStacks = (this.passiveState.resonanceStacks + 1) % 3;
                    if (this.passiveState.resonanceStacks === 0) {
                        bonusDamage += 15;
                        this.energy = Math.min(this.maxEnergy, this.energy + 10);
                    }
                }
                if (this.passive.name === "Shadowstrike" && opponent) {
                    const toOpponent = opponent.mesh.position.clone().sub(this.mesh.position).normalize();
                    const oppForward = new THREE.Vector3();
                    opponent.mesh.getWorldDirection(oppForward);
                    if (toOpponent.dot(oppForward) > 0.5) { // Attacking from behind-ish
                        bonusDamage += 10 * 0.15; // 15% of base 10 damage
                    }
                }
                if (this.passive.name === "Mana Burn" && opponent) {
                    opponent.energy = Math.max(0, opponent.energy - 5);
                }
                if (this.passive.name === "Way of the Blade" && this.passiveState.lastSkillTime > 0) {
                    bonusDamage += 10;
                    bonusRange += 1; // Add bonus range
                    this.passiveState.lastSkillTime = 0; // Consume buff
                }
                // Vortex passive: Apply Gravity Mark on basic attacks
                if (this.passive.name === "Event Horizon" && opponent) {
                    if (opponent.status.gravityMarks !== undefined) opponent.status.gravityMarks++;
                    else opponent.status.gravityMarks = 1;
                    opponent.status.gravityMarkTimer = 4; // 4 second duration
                }
            }

            let damage = 10 + bonusDamage;
            if(this.status.siege > 0) damage = 25 + bonusDamage;
            if (this.passive.name === "Sharpshooter" && opponent) {
                const dist = this.mesh.position.distanceTo(opponent.mesh.position);
                damage *= (1 + Math.min(0.2, (dist / (arenaSize * 0.6)) * 0.2)); // Up to 20%
            }

            let effects = null; if(this.status.nextAttackVenom){ effects = { venom:3 }; this.status.nextAttackVenom=false; }
            if(this.attackType==='RANGED'){
                const isPiercing = this.status.targetingArray > 0;
                projectiles.push(new Projectile(this, fireDir, damage, 20, { effects, piercing:isPiercing }));
            } else { // Melee
                if (opponent && !opponent.isDead && opponent.mesh.position.distanceTo(this.mesh.position) < (this.attackRange + bonusRange)) {
                    const vectorToOpponent = new THREE.Vector3().subVectors(opponent.mesh.position, this.mesh.position).normalize();
                    const forwardAngle = this.aimDirection.dot(vectorToOpponent);
                    if (forwardAngle > 0.5) { // Check if opponent is roughly in front
                        opponent.takeDamage(damage);
                        if(effects) Object.assign(opponent.status, effects);
                    }
                }
                specialObjects.push(new MeleeSlash(this, this.mesh.children[0].material.color));
            }
            return; // End execution for basic attack
        }

        // --- Other Skills Logic ---
        const skill = this.skills[skillKey];
        if (!skill) return;

        // Apply cost and cooldown only for the local player initiating the skill
        if (!isRemote) {
           if (this.energy < skill.cost) return; // Check energy again just in case
           this.energy -= skill.cost;
           this.cooldowns[skillKey] = skill.cd;
           this.applyPassiveCooldown(skillKey); // Apply relevant CDR passives
        }

        // --- Passive Trigger on Skill Use (before execution) ---
        if (this.passive.name === "Static Charge" && opponent) {
            this.passiveState.staticChargeStacks = (this.passiveState.staticChargeStacks || 0) + 1;
            if (this.passiveState.staticChargeStacks >= 3) {
                this.passiveState.staticChargeStacks = 0;
                opponent.status.rooted = 0.5; // Stun opponent
            }
        }

        console.log(`Executing ${skill.name} (${skillKey}) for player ${this.playerNum}`);

        switch (skill.name) {
              // --- S1 SKILLS ---
              case "Power Shot": projectiles.push(new Projectile(this, fireDir, 25, 25, {size: 0.4})); break;
              case "Aegis Charge": this.status.isCharging=.5; if(audioReady) sounds.charge.triggerAttackRelease("C3", "4n"); specialObjects.push(new PlayerAura(this, 100, 0xffffff, 10, 0.1)); break;
              case "Venom Blade": this.status.nextAttackVenom=true; specialObjects.push(new StatusAura(this, 3, 0x00ff00)); break;
              case "Targeting Array": this.status.targetingArray=5; specialObjects.push(new StatusAura(this,5, this.mesh.children[0].material.color.getHex())); break;
              case "Static Orb": projectiles.push(new Projectile(this, fireDir, 25, 20, { size:.6, life:2 })); break;
              case "Corruption": projectiles.push(new Projectile(this, fireDir, 5, 20, { effects:{ corruption:5 } })); break;
              case "Decimate": specialObjects.push(new Decimate(this, players)); break;
              case "Temporal Anomaly": projectiles.push(new Projectile(this, fireDir, 10, 15, { effects:{ slowed:3 } })); break;
              case "Empower": this.status.empowered=6; specialObjects.push(new StatusAura(this, 6, 0xffff00)); break;
              case "Tailwind": this.velocity.add(this.aimDirection.clone().multiplyScalar(-20)); specialObjects.push(new ParticleSystem(this.mesh.position.clone().setY(2), {count: 50, duration: 0.5, speed: 5, startColor: new THREE.Color(this.mesh.children[0].material.color)})); if(audioReady) sounds.teleport.triggerAttackRelease("C5","8n"); break;
              case "Feedback Loop": projectiles.push(new Projectile(this, fireDir, 10, 20, { effects:{ feedbackLoop:5 } })); break;
              case "Crushing Singularity": // Vortex S1
                  projectiles.push(new Projectile(this, fireDir, 20, 25, {
                       size: 0.6,
                       life: 3.5, // Projectile lifespan
                       effects: { gravityMark: 1 }, // Apply mark on direct hit
                       onDestroy: (proj) => {
                           specialObjects.push(new CrushingSingularity(this, proj.mesh.position));
                       }
                  }));
                  break;
              case "Build Turret": specialObjects.push(new SentryTurret(this, this.mesh.position.clone())); break;
              case "Caustic Blast":
                  let slowDur = 2;
                  if (opponent && opponent.status.venom > 0) {
                      const stacks = Math.min(5, Math.floor(opponent.status.venom));
                      slowDur += stacks * 0.5; // Add 0.5s per venom stack
                  }
                  projectiles.push(new Projectile(this, fireDir, 15, 18, { effects: {slowed: slowDur, venom: 3} }));
                  break;
              case "Iaijutsu Dash": this.velocity.add(this.aimDirection.clone().multiplyScalar(30)); specialObjects.push(new MeleeSlash(this, this.mesh.children[0].material.color)); if(opponent && !opponent.isDead && opponent.mesh.position.distanceTo(this.mesh.position) < 5) opponent.takeDamage(15); break;

              // --- S2 SKILLS ---
              case "Phase Shift": this.velocity.add(this.aimDirection.clone().multiplyScalar(20)); specialObjects.push(new ParticleSystem(this.mesh.position.clone().setY(2), {count: 50, duration: 0.5, speed: 5, startColor: new THREE.Color(this.mesh.children[0].material.color)})); if(audioReady) sounds.teleport.triggerAttackRelease("C5","8n"); break;
              case "Energy Shield": this.status.shielded=5; specialObjects.push(new ShieldEffect(this,5,0xADD8E6)); break;
              case "Blink": const bp=this.mesh.position.clone().add(this.aimDirection.clone().multiplyScalar(8)); specialObjects.push(new ParticleSystem(this.mesh.position.clone().setY(2), {count: 50, duration: 0.5, speed: 5, startColor: new THREE.Color(this.mesh.children[0].material.color)})); this.mesh.position.copy(bp); specialObjects.push(new ParticleSystem(this.mesh.position.clone().setY(2), {count: 50, duration: 0.5, speed: 5, startColor: new THREE.Color(this.mesh.children[0].material.color)})); if(audioReady) sounds.teleport.triggerAttackRelease("C6","16n"); break;
              case "Slowing Mine": specialObjects.push(new SlowingMine(this, this.mesh.position.clone())); break;
              case "Ball Lightning": projectiles.push(new Projectile(this, fireDir, 12, 15, { size:.8, life:4, piercing:true })); break;
              case "Rewind": if(this.rewindPositions.length>0){ const st=this.rewindPositions[0]; specialObjects.push(new ParticleSystem(this.mesh.position.clone().setY(2), {count: 80, duration: 0.7, speed: 5, startColor: new THREE.Color(this.mesh.children[0].material.color)})); this.mesh.position.copy(st.pos); if(!isRemote) { this.hp=st.hp; this.energy=st.energy; } specialObjects.push(new ParticleSystem(this.mesh.position.clone().setY(2), {count: 80, duration: 0.7, speed: 5, startColor: new THREE.Color(0xffffff)})); } if(audioReady) sounds.teleport.triggerAttackRelease("A5","8n"); break;
              case "Tectonic Slam": specialObjects.push(new TectonicSlam(this, players)); break;
              case "Stasis Field": specialObjects.push(new StasisField(this, this.mesh.position.clone().add(this.aimDirection.clone().multiplyScalar(10)))); break;
              case "Sentry Turret": specialObjects.push(new SentryTurret(this, this.mesh.position.clone())); break;
              case "Wind Wall": const wp=this.mesh.position.clone().add(this.aimDirection.clone().multiplyScalar(3)); specialObjects.push(new WindWall(this, wp, this.mesh.quaternion)); break;
              case "Silence": projectiles.push(new Projectile(this, fireDir, 10, 20, { effects:{ silenced:3 } })); break;
              case "Graviton Pulse": // Vortex S2
                  specialObjects.push(new ExpandingRing(this.mesh.position, this.mesh.children[0].material.color, 6, 0.4));
                  players.forEach(p => {
                      if (p !== this && p && !p.isDead && p.mesh && p.mesh.position.distanceTo(this.mesh.position) < 6) {
                          p.takeDamage(15);
                          p.status.slowed = 3.0;
                          if (p.status.gravityMarks !== undefined) p.status.gravityMarks++;
                          else p.status.gravityMarks = 1;
                          p.status.gravityMarkTimer = 4;
                      }
                  });
                  if(audioReady) sounds.explosion.triggerAttackRelease("F3", "8n");
                  break;
              case "Barrier Wall": specialObjects.push(new BarrierWall(this, this.mesh.position.clone().add(this.aimDirection.clone().multiplyScalar(5)), this.mesh.quaternion)); break;
              case "Adrenal Haze": specialObjects.push(new AdrenalHaze(this)); break;
              case "Parry Stance": this.status.parry = 1.5; specialObjects.push(new ShieldEffect(this, 1.5, 0xffffff)); break;

              // --- S3 SKILLS ---
              case "Static Field": specialObjects.push(new StaticField(this)); break;
              case "Overload": specialObjects.push(new ExpandingRing(this.mesh.position, this.mesh.children[0].material.color, 8, .5)); specialObjects.push(new ParticleSystem(this.mesh.position, {count: 200, duration: 1.2, speed: 15, startColor: new THREE.Color(this.mesh.children[0].material.color), endColor: new THREE.Color(0xffffff)})); if(opponent && !opponent.isDead && opponent.mesh.position.distanceTo(this.mesh.position)<8){ opponent.takeDamage(40); } if(audioReady) sounds.explosion.triggerAttackRelease("G2","2n"); break;
              case "Cloak": this.status.cloaked=5; break;
              case "Laser Core": if(opponent && !opponent.isDead) { specialObjects.push(new LaserCore(this, opponent)); this.status.isCharging = 2.5; } if(audioReady) sounds.laser.triggerAttackRelease("C4","1n"); break;
              case "Cyclone": specialObjects.push(new Cyclone(this)); break;
              case "Swap": if(opponent && !opponent.isDead) { const my=this.mesh.position.clone(); specialObjects.push(new ParticleSystem(this.mesh.position.clone().setY(2), {count: 80, duration: 0.7, speed: 8, startColor: new THREE.Color(this.mesh.children[0].material.color)})); specialObjects.push(new ParticleSystem(opponent.mesh.position.clone().setY(2), {count: 80, duration: 0.7, speed: 8, startColor: new THREE.Color(opponent.mesh.children[0].material.color)})); this.mesh.position.copy(opponent.mesh.position); opponent.mesh.position.copy(my); } if(audioReady) sounds.teleport.triggerAttackRelease("F4","8n"); break;
              case "Unstoppable Force": this.status.unstoppable=4; this.status.isCharging=.5; specialObjects.push(new PlayerAura(this, 150, 0xff0000, 15, 0.2)); if(audioReady) sounds.charge.triggerAttackRelease("A2", "4n"); break;
              case "Implosion": // Vortex S3
                  if(opponent && !opponent.isDead) {
                      opponent.status.implosionTarget = this; // Store reference to caster
                      opponent.status.implosionTimer = 3; // 3 second delay
                      specialObjects.push(new ImplosionEffect(this, opponent)); // Visual marker
                      
                      // Apply initial damage and gravity mark
                      opponent.takeDamage(15); // Initial damage
                      if (opponent.status.gravityMarks !== undefined) {
                          opponent.status.gravityMarks++;
                      } else {
                          opponent.status.gravityMarks = 1;
                      }
                      opponent.status.gravityMarkTimer = 4;
                  }
                  break;
              case "Bastion Protocol": this.status.shielded=10; specialObjects.push(new ShieldEffect(this,10,0xffffff)); break;
              case "Spell Shield": this.status.spellShield=10; specialObjects.push(new ShieldEffect(this,10,0xa020f0)); break;
              case "Siege Mode": this.status.siege = 10; this.status.rooted = 10; specialObjects.push(new StatusAura(this, 10, 0xff8c00)); break;
              case "Blade Fury": specialObjects.push(new BladeFury(this)); break;

              // --- EMPEROR (MIRAGE) SKILLS ---
              case "Arise!":
                const soldiers = specialObjects.filter(o => o.constructor.name === 'SandSoldier' && o.owner === this);
                if (soldiers.length >= 3) { // Max 3 soldiers
                    const oldestSoldier = soldiers.sort((a, b) => (b.initialDuration - b.duration) - (a.initialDuration - a.duration))[0]; // Find oldest by elapsed time
                    if (oldestSoldier) oldestSoldier.duration = 0;
                }
                const spawnPos = this.mesh.position.clone().add(this.aimDirection.clone().multiplyScalar(4));
                specialObjects.push(new SandSoldier(this, spawnPos));
                break;
              case "Conquering Sands":
                specialObjects.forEach(o => {
                    if (o.constructor.name === 'SandSoldier' && o.owner === this) {
                       const dashPos = o.mesh.position.clone().add(this.aimDirection.clone().multiplyScalar(10));
                       o.dashTo(dashPos);
                    }
                });
                break;
              case "Shifting Sands":
                const closestSoldier = specialObjects
                    .filter(o => o.constructor.name === 'SandSoldier' && o.owner === this)
                    .sort((a, b) => a.mesh.position.distanceTo(this.mesh.position) - b.mesh.position.distanceTo(this.mesh.position))[0];

                if (closestSoldier) {
                    this.status.isCharging = 0.5; // Dash duration
                    this.status.dashTarget = closestSoldier; // Store soldier as target
                }
                break;

              // --- S4 SKILLS (ULTIMATES) ---
              case "Overcharge": this.status.empowered = 8; this.energy = Math.min(this.maxEnergy, this.energy + 50); specialObjects.push(new StatusAura(this, 8, 0x00ffff)); if(audioReady) sounds.ult.triggerAttackRelease("C5", "1n"); break;
              case "Righteous Stand": this.status.shielded = 6; this.status.rooted = 6; specialObjects.push(new ShieldEffect(this, 6, 0xffa500)); if(audioReady) sounds.ult.triggerAttackRelease("G3", "1n"); break;
              case "Death Mark": if(opponent && !opponent.isDead) { opponent.status.corruption = 10; opponent.status.venom = 10; } if(audioReady) sounds.ult.triggerAttackRelease("A2", "1n"); break;
              case "Orbital Strike": specialObjects.push(new OrbitalStrikeMarker(this, this.mesh.position.clone().add(this.aimDirection.clone().multiplyScalar(15)))); if(audioReady) sounds.ult.triggerAttackRelease("E2", "1n"); break;
              case "Eye of the Storm": specialObjects.push(new EyeOfTheStorm(this)); if(audioReady) sounds.ult.triggerAttackRelease("F3", "1n"); break;
              case "System Crash": if(opponent && !opponent.isDead) { opponent.takeDamage(30); opponent.energy = 0; opponent.status.silenced = 4; } specialObjects.push(new ExpandingRing(this.mesh.position, this.mesh.children[0].material.color, 12, 0.8)); if(audioReady) sounds.ult.triggerAttackRelease("D2", "1n"); break;
              case "Pulverize": { const targetPos = this.mesh.position.clone().add(this.aimDirection.clone().multiplyScalar(12)); specialObjects.push(new PulverizeLeap(this, targetPos, players)); if(audioReady) sounds.ult.triggerAttackRelease("C2", "1n"); break; } // Target position in front
              case "Time Stop": specialObjects.push(new TimeStopEffect(this, 4)); if(audioReady) sounds.ult.triggerAttackRelease("G5", "1n"); break;
              case "Salvation": if(this.hp < this.maxHp) { this.hp = Math.min(this.maxHp, this.hp + 70); } specialObjects.push(new ExpandingRing(this.mesh.position, 0xffffff, 8, 1)); if(audioReady) sounds.ult.triggerAttackRelease("A4", "1n"); break;
              case "Gale Force": specialObjects.push(new GaleForceTornado(this, this.aimDirection.clone())); if(audioReady) sounds.ult.triggerAttackRelease("B3", "1n"); break;
              case "Energy Void": if(opponent && !opponent.isDead) { const drain = opponent.energy * 0.6; opponent.energy -= drain; this.energy = Math.min(this.maxEnergy, this.energy + drain); opponent.takeDamage(drain * 0.5); specialObjects.push(new ExpandingRing(opponent.mesh.position, this.mesh.children[0].material.color, 6, 1));} if(audioReady) sounds.ult.triggerAttackRelease("F2", "1n"); break;
              case "Black Hole": { // Vortex S4
                  const targetPosBH = this.mesh.position.clone().add(this.aimDirection.clone().multiplyScalar(15)); // Cast range 15 units
                  const halfArenaBH = arenaSize / 2 - 3; // Keep edge margin for effect (radius 3)
                  targetPosBH.x = Math.max(-halfArenaBH, Math.min(halfArenaBH, targetPosBH.x));
                  targetPosBH.z = Math.max(-halfArenaBH, Math.min(halfArenaBH, targetPosBH.z));
                  specialObjects.push(new BlackHole(this, targetPosBH));
                  
                  players.forEach(p => {
                      if (p !== this && !p.isDead && p.mesh.position.distanceTo(targetPosBH) < 20) {
                          if (p.status.gravityMarks !== undefined) p.status.gravityMarks += 2;
                          else p.status.gravityMarks = 2;
                          p.status.gravityMarkTimer = 4;
                      }
                  });
                  
                  if(audioReady) sounds.ult.triggerAttackRelease("A1", "1n");
                  } break;
              case "Emperor's Divide":
                const wallPos = this.mesh.position.clone().add(this.aimDirection.clone().multiplyScalar(4));
                specialObjects.push(new SoldierWall(this, wallPos, this.mesh.quaternion.clone()));
                if(audioReady) sounds.ult.triggerAttackRelease("D3", "1n");
                break;
              case "Anvil Turret": specialObjects.push(new AnvilTurret(this, this.mesh.position.clone())); if(audioReady) sounds.ult.triggerAttackRelease("C4", "1n"); break;
              case "Plague Cloud": specialObjects.push(new PlagueCloud(this)); if(audioReady) sounds.ult.triggerAttackRelease("G2", "1n"); break;
              case "Shadow Strike":
                const targets = [];
                if(opponent && !opponent.isDead) { targets.push(opponent); }
                // Add other potential targets like turrets or soldiers if desired
                if (targets.length > 0) {
                    specialObjects.push(new ShadowStrikeDash(this, targets));
                }
                if(audioReady) sounds.ult.triggerAttackRelease("C5", "1n");
                break;
        }
    }
}