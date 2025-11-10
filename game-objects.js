/*
 * game-objects.js
 * Defines all in-game entities that are not players:
 * - SpecialObject (base class)
 * - Projectile
 * - ParticleSystem
 * - All skill-specific effects (auras, walls, fields, etc.)
 *
 * V-FIX:
 * - Added `isDestroyed` flag to SpecialObject and Projectile.
 * - Removed `projectiles.splice()` from `Projectile.destroy()` to fix
 * the O(n^2) performance lag. Cleanup is now handled by main.js.
 */

import * as THREE from 'three';
import { scene, clock, particleTexture, obstacles, arenaSize } from './scene.js';
import { audioReady, sounds } from './sound.js';
import { CHARACTERS } from './constants.js';
import { createCharacterModel } from './models.js';
import { camera } from './scene.js'; // For FloatingDamageText

// --- Global Lists (managed by main.js, but referenced here) ---
// We need to pass these lists into the module.
let projectiles = [];
let specialObjects = [];

// Functions to set the lists from main.js
export function setProjectileList(list) {
    projectiles = list;
}
export function setSpecialObjectList(list) {
    specialObjects = list;
}

// --- Base Class ---

class SpecialObject {
    constructor(owner, duration) {
        this.owner = owner;
        this.duration = duration;
        this.initialDuration = duration;
        this.mesh = null;
        this.collider = null;
        this.blocksProjectiles = false;
        this.isDestroyed = false; // --- NEW: Mark-and-sweep flag ---
    }
    update(delta, players, projs) { // Add projs to signature
        if (this.isDestroyed) return;
        this.duration -= delta;
    }
    destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true; // --- NEW: Set flag ---
        
        if (this.mesh) {
            scene.remove(this.mesh);
            if (this.mesh.geometry) this.mesh.geometry.dispose();
            if (this.mesh.material && typeof this.mesh.material.dispose === 'function') this.mesh.material.dispose();
            this.mesh = null;
        }
    }
}

// --- Floating Damage Text ---
export class FloatingDamageText extends SpecialObject {
    constructor(text, position3D) {
        super(null, 1.0); // Lasts for 1 second
        this.text = text;
        this.position3D = position3D.clone();

        this.element = document.createElement('div');
        this.element.className = 'damage-text';
        this.element.textContent = Math.round(this.text);
        document.body.appendChild(this.element);

        this.updatePosition(); // Initial position

        // Start animation (move up and fade out)
        requestAnimationFrame(() => {
            if (this.element) {
                this.element.style.transform = `translate(-50%, -80px)`; // Move up 80px
                this.element.style.opacity = '0';
            }
        });
    }

    updatePosition() {
            if (!this.element) return;
            // Convert 3D position to 2D screen position
            const screenPos = this.position3D.clone().project(camera);
            const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
            this.element.style.left = `${x}px`;
            this.element.style.top = `${y}px`;
    }

    update(delta) {
        if (this.isDestroyed) return;
        super.update(delta);
        this.updatePosition(); // Keep updating position in case camera moves
    }

    destroy() {
        if (this.isDestroyed) return;
        
        if (this.element && this.element.parentNode) {
            this.element.parentNode.removeChild(this.element);
        }
        this.element = null;
        // No mesh to destroy, so we call super.destroy() to set the flag
        super.destroy();
    }
}


// --- Projectile Class ---

export class Projectile extends SpecialObject {
    constructor(owner, direction, damage, speed, { size = 0.3, life = 3, effects = null, piercing = false, onDestroy = null } = {}) {
        super(owner, life);
        this.damage = (owner && owner.status?.riftBuff > 0) ? damage * 1.5 : damage;
        this.speed = speed;
        this.originalSpeed = speed;
        this.direction = direction;
        this.effects = effects;
        this.piercing = piercing;
        this.hitPlayers = new Set();
        this.gracePeriod = .1;
        this.onDestroyCallback = onDestroy; // Custom callback
        // this.isDestroyed is inherited from SpecialObject

        let ownerColor = new THREE.Color(0xffffff);
        // Find the 'Player' owner, even if the owner is a SpecialObject (like a turret)
        const sourcePlayer = (owner?.constructor?.name === "Player") ? owner : owner?.owner;
        if (sourcePlayer?.constructor?.name === "Player" && sourcePlayer.mesh && sourcePlayer.mesh.children[0] && sourcePlayer.mesh.children[0].material) {
            ownerColor = sourcePlayer.mesh.children[0].material.color;
        } else if (owner?.mesh?.material) { // Fallback for simple objects like turrets
             ownerColor = owner.mesh.material.color;
        }

        const g = new THREE.SphereGeometry(size, 8, 8), m = new THREE.MeshBasicMaterial({ color: ownerColor, blending: THREE.AdditiveBlending });
        this.mesh = new THREE.Mesh(g, m);
        
        if (owner && owner.mesh) {
            const worldPos = new THREE.Vector3();
            // Handle different owner types (Player vs SpecialObject)
            if (owner.mesh.isGroup) {
                 owner.mesh.getWorldPosition(worldPos); // For player (Group)
            } else {
                 worldPos.copy(owner.mesh.position); // For simple mesh (like turret head)
            }
            this.mesh.position.copy(worldPos).add(new THREE.Vector3(0, 2, 0));
            this.mesh.position.add(direction.clone().multiplyScalar(1.5));
        } else {
            this.mesh.position.set(0, 2, 0); // Fallback
        }
        const light = new THREE.PointLight(this.mesh.material.color, 2, 5);
        this.mesh.add(light);
        scene.add(this.mesh);

        specialObjects.push(new ParticleSystem(this.mesh.position, {
            count: 20, duration: 0.3, speed: 3, startColor: new THREE.Color(0xffffff), endColor: ownerColor,
            startSize: 0.2, endSize: 0, emissionShape: 'cone', direction: direction
        }));
        if (audioReady) sounds.shoot.triggerAttackRelease("C5", "16n");
    }

    update(delta, players) { // `players` is passed from main loop
        if (this.isDestroyed) return;
        super.update(delta); // Ticks down life
        if (this.duration <= 0) { this.destroy(); return; }
        if (this.speed < 0.1) return; // Stopped by Time Stop

        this.mesh.position.add(this.direction.clone().multiplyScalar(this.speed * delta));
        if (this.gracePeriod > 0) { this.gracePeriod -= delta; return; }

        const projCollider = new THREE.Box3().setFromObject(this.mesh);
        
        // Check Players
        for (const p of players) {
            const projOwnerPlayer = (this.owner?.constructor?.name === "Player") ? this.owner : this.owner?.owner;
            if (p !== projOwnerPlayer && !p.isDead && !this.hitPlayers.has(p)) {
                if (p.collider.intersectsBox(projCollider)) {
                    p.takeDamage(this.damage);
                    if (this.effects) {
                        Object.keys(this.effects).forEach(key => {
                            if (typeof this.effects[key] === 'number') {
                                p.status[key] = (p.status[key] || 0) + this.effects[key];
                            }
                        });
                    }
                    if (!this.piercing) { this.destroy(); return; }
                    this.hitPlayers.add(p);
                }
            }
        }
        // Check Obstacles
        for (const obs of obstacles) { if (obs.intersectsBox?.(projCollider)) { this.destroy(); return; } }
        
        // Check Special Objects
        for (const o of specialObjects) {
            // V-FIX: Added isDestroyed check
            if (o.isDestroyed) continue; 
            
            const ownerCheck = (o === this.owner) || (o.owner === this.owner) || (o === this.owner?.owner);
            if (!ownerCheck && o.collider && o.collider.intersectsBox(projCollider)) {
                if (o.blocksProjectiles) { this.destroy(); return; }
                // Check against class names
                const constructorName = o.constructor.name;
                if (constructorName === 'SentryTurret' || constructorName === 'SandSoldier' || constructorName === 'AnvilTurret') {
                    if (typeof o.takeDamage === 'function') o.takeDamage(this.damage);
                    this.destroy();
                    return;
                }
            }
        }
    }

    destroy() {
        if (this.isDestroyed) return; // Already destroyed

        if (this.onDestroyCallback) {
            this.onDestroyCallback(this); // Fire custom callback for skills like Crushing Singularity
        }

        specialObjects.push(new ParticleSystem(this.mesh.position, { count: 20, duration: 0.5, speed: 5, startColor: new THREE.Color(this.mesh.material.color), endColor: new THREE.Color(0x000000) }));
        
        super.destroy(); // Removes mesh from scene, disposes geo/mat, SETS isDestroyed = true

        // --- V-FIX: REMOVED `projectiles.splice()` ---
        // const i = projectiles.indexOf(this);
        // if (i > -1) projectiles.splice(i, 1);
        // --- END V-FIX ---
    }
}


// --- Visual & Effect Classes ---

export class ParticleSystem extends SpecialObject {
    constructor(position, {
        count = 50, duration = 1, speed = 10, size = 0.1, gravity = 0, emissionShape = 'sphere',
        startColor = new THREE.Color(0xffffff), endColor = new THREE.Color(0x000000),
        startSize = 0.1, endSize = 0, direction = null
    } = {}) {
        super(null, duration);
        this.particles = [];
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const material = new THREE.PointsMaterial({
            map: particleTexture,
            size: startSize,
            color: startColor,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            sizeAttenuation: true
        });
        this.startColor = startColor; this.endColor = endColor;
        this.startSize = startSize; this.endSize = endSize;
        this.gravity = new THREE.Vector3(0, gravity, 0);

        for (let i = 0; i < count; i++) {
            vertices.push(position.x, position.y, position.z);
            let velocity;
            if (emissionShape === 'sphere') {
                velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(Math.random() * speed);
            } else if (emissionShape === 'cone' && direction) {
                const angle = Math.random() * Math.PI * 0.25;
                const s = Math.sin(angle);
                const c = Math.cos(angle);
                const phi = Math.random() * Math.PI * 2;
                velocity = new THREE.Vector3(Math.cos(phi) * s, Math.sin(phi) * s, c)
                    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), direction))
                    .normalize()
                    .multiplyScalar(Math.random() * speed + speed * 0.5);
            } else {
                velocity = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(Math.random() * speed);
            }

            this.particles.push({
                position: position.clone(),
                velocity: velocity,
                life: Math.random() * duration,
                startLife: duration
            });
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        this.mesh = new THREE.Points(geometry, material);
        scene.add(this.mesh);
    }

    update(delta) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (!this.mesh || !this.mesh.geometry || !this.mesh.material) return;
        
        const positions = this.mesh.geometry.attributes.position;
        const lifeRatio = Math.max(0, this.duration / this.initialDuration);

        this.mesh.material.color.lerpColors(this.endColor, this.startColor, lifeRatio);
        this.mesh.material.size = this.endSize + (this.startSize - this.endSize) * lifeRatio;
        this.mesh.material.opacity = lifeRatio;

        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            if (p.life > 0) {
                p.life -= delta;
                p.velocity.add(this.gravity.clone().multiplyScalar(delta));
                p.position.add(p.velocity.clone().multiplyScalar(delta));
                positions.setXYZ(i, p.position.x, p.position.y, p.position.z);
            } else {
                positions.setXYZ(i, -9999, -9999, -9999);
            }
        }
        positions.needsUpdate = true;
    }
}

export class ExpandingRing extends SpecialObject {
    constructor(position, color, maxRadius, duration) {
        super(null, duration);
        const geo = new THREE.TorusGeometry(maxRadius, .1, 8, 48);
        const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true });
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(position);
        this.mesh.position.y = .5;
        this.mesh.rotation.x = Math.PI / 2;
        this.mesh.scale.set(.01, .01, .01);
        scene.add(this.mesh);
    }
    update(delta) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (!this.mesh) return; // V-FIX: Guard against errors if destroyed mid-frame
        const p = 1 - (this.duration / this.initialDuration);
        this.mesh.scale.set(p, p, p);
        if (this.mesh.material) this.mesh.material.opacity = 1 - p;
    }
}

export class SpawnEffect extends SpecialObject {
    constructor(position, color) {
        super(null, 1.5);
        const ringCount = 5;
        this.rings = [];
        for (let i = 0; i < ringCount; i++) {
            const g = new THREE.TorusGeometry(1, .05, 8, 32), m = new THREE.MeshBasicMaterial({ color, transparent: true }), r = new THREE.Mesh(g, m);
            r.position.copy(position);
            r.position.y = (i * 0.8);
            r.rotation.x = Math.PI / 2;
            r.scale.set(3, 3, 3);
            scene.add(r); this.rings.push(r);
        }
    }
    update(delta) {
        if (this.isDestroyed) return;
        super.update(delta);
        const pr = 1 - (this.duration / this.initialDuration);
        this.rings.forEach((r, i) => {
            r.position.y = (i * 0.8) * (1 - pr);
            r.scale.set(3 * (1 - pr), 3 * (1 - pr), 3 * (1 - pr));
            r.material.opacity = 1 - pr;
        });
    }
    destroy() {
        if (this.isDestroyed) return;
        this.rings.forEach(r => { scene.remove(r); if (r.geometry) r.geometry.dispose(); if (r.material) r.material.dispose(); });
        this.rings = [];
        super.destroy();
    }
}

export class PlayerAura extends SpecialObject {
    constructor(owner, count, color, speed, size) {
        super(owner, Infinity);
        if (!owner || !owner.mesh) {
            this.duration = 0;
            this.isDestroyed = true;
            return;
        }
        this.particles = [];
        const mat = new THREE.PointsMaterial({
            map: particleTexture,
            color, size,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            sizeAttenuation: true
        });
        const geo = new THREE.BufferGeometry();
        const verts = [];
        for (let i = 0; i < count; i++) {
            verts.push(0, 0, 0);
            this.particles.push({
                baseAngle: Math.random() * Math.PI * 2,
                baseRadius: Math.random() * 1.5 + 1.0,
                swirlFrequency: Math.random() * 2 + 1,
                swirlAmplitude: Math.random() * 0.4 + 0.2,
                yPos: Math.random() * 4,
                ySpeed: (Math.random() - 0.5) * speed
            });
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        this.mesh = new THREE.Points(geo, mat);
        if (this.owner && this.owner.mesh) {
            this.owner.mesh.add(this.mesh);
        }
    }
    update(delta) {
        if (this.isDestroyed || !this.mesh || !this.mesh.geometry) return;
        // Infinity duration, so no super.update(delta)
        
        const pos = this.mesh.geometry.attributes.position.array;
        const t = clock.getElapsedTime();
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.yPos += p.ySpeed * delta;
            if (p.yPos > 4) p.yPos = 0;
            if (p.yPos < 0) p.yPos = 4;

            const angle = p.baseAngle + t * 0.5;
            const radius = p.baseRadius + Math.sin(t * p.swirlFrequency) * p.swirlAmplitude;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            pos[i * 3] = x;
            pos[i * 3 + 1] = p.yPos;
            pos[i * 3 + 2] = z;
        }
        this.mesh.geometry.attributes.position.needsUpdate = true;
    }
    destroy() {
        if (this.isDestroyed) return;
        if (this.owner?.mesh && this.mesh) this.owner.mesh.remove(this.mesh);
        super.destroy(); // Handles mesh disposal
    }
}

export class StatusEffectVisual extends SpecialObject {
    constructor(owner, key, color, count = 20, style = 'swirl') {
        super(owner, Infinity);
        this.statusKey = key;
        this.style = style;
        const geo = new THREE.BufferGeometry(), verts = [];
        this.particles = [];
        for (let i = 0; i < count; i++) {
            verts.push(0, 0, 0);
            this.particles.push({ position: new THREE.Vector3(), velocity: this.randVel(), life: Math.random() * 1.5 });
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
        const mat = new THREE.PointsMaterial({ color, size: .2, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
        this.mesh = new THREE.Points(geo, mat);
        this.mesh.visible = false;
        scene.add(this.mesh);
    }
    randVel() {
        switch (this.style) {
            case 'drip': return new THREE.Vector3((Math.random() - .5) * .5, -Math.random() * 2, (Math.random() - .5) * .5);
            case 'cloud': return new THREE.Vector3((Math.random() - .5) * 1.5, (Math.random() - .5) * 1.5, (Math.random() - .5) * 1.5);
            case 'ring': return new THREE.Vector3(Math.cos(Math.random() * Math.PI * 2) * 2, 0, Math.sin(Math.random() * Math.PI * 2) * 2);
            default: return new THREE.Vector3((Math.random() - .5) * 2, Math.random() * 1.5, (Math.random() - .5) * 2);
        }
    }
    update(delta) {
        if (this.isDestroyed) return;
        // Infinity duration, so no super.update(delta)
        
        if (!this.owner || this.owner.isDead || this.owner.hp <= 0 || !this.owner.status || this.owner.status[this.statusKey] <= 0) {
            if (this.mesh) this.mesh.visible = false;
            return;
        }
        if (this.mesh) this.mesh.visible = true;
        const pos = this.mesh.geometry.attributes.position.array;
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.position.add(p.velocity.clone().multiplyScalar(delta));
            p.life -= delta;
            if (p.life <= 0) { p.position.set(0, 2, 0); p.velocity = this.randVel(); p.life = Math.random() * 1.5; }
            const w = this.owner.mesh.position.clone().add(p.position);
            pos[i * 3] = w.x;
            pos[i * 3 + 1] = w.y;
            pos[i * 3 + 2] = w.z;
        }
        this.mesh.geometry.attributes.position.needsUpdate = true;
    }
}

export class Rift extends SpecialObject {
    constructor() {
        super(null, Infinity);
        this.state = 'COOLDOWN';
        this.timer = 5;
        const g = new THREE.TorusKnotGeometry(1.5, .2, 100, 16), m = new THREE.MeshBasicMaterial({ color: 0xff00ff, wireframe: true });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.visible = false;
        scene.add(this.mesh);
        this.light = new THREE.PointLight(0xff00ff, 5, 10);
        this.mesh.add(this.light);
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        // Infinity duration, so no super.update(delta)
        
        this.timer -= delta;
        if (this.state === 'COOLDOWN' && this.timer <= 0) {
            this.state = 'ACTIVE'; this.timer = 10;
            const x = (Math.random() - .5) * (arenaSize - 10), z = (Math.random() - .5) * (arenaSize - 10);
            this.mesh.position.set(x, 2, z); this.mesh.visible = true;
        } else if (this.state === 'ACTIVE') {
            this.mesh.rotation.y += delta * 2; this.mesh.rotation.x += delta * .5;
            if (this.timer <= 0) { this.state = 'COOLDOWN'; this.timer = 15; this.mesh.visible = false; return; }
            for (const p of players) { if (p.constructor.name === 'Player' && p.mesh.position.distanceTo(this.mesh.position) < 3) { p.status.riftBuff = 8; this.state = 'COOLDOWN'; this.timer = 15; this.mesh.visible = false; break; } }
        }
    }
}

export class StaticField extends SpecialObject {
    constructor(owner) {
        super(owner, 5);
        const g = new THREE.CylinderGeometry(4, 4, .5, 32, 1, true), m = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: .3, side: THREE.DoubleSide });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.position.copy(owner.mesh.position); this.mesh.position.y = .25; scene.add(this.mesh);
        this.damageInterval = .5; this.damageTimer = 0;
        this.aura = new PlayerAura(this, 100, 0x00ffff, 3, 0.2);
        if (this.aura.mesh) this.aura.mesh.position.y = 0.25;
        else this.aura = null; // Safety check
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.aura) this.aura.update(delta);
        this.damageTimer -= delta;
        if (this.damageTimer <= 0) {
            this.damageTimer = this.damageInterval;
            players.forEach(p => { if (p.constructor.name === 'Player' && p !== this.owner && p.mesh.position.distanceTo(this.mesh.position) < 4) p.takeDamage(5); });
        }
    }
    destroy() {
        if (this.isDestroyed) return;
        if (this.aura) this.aura.destroy();
        super.destroy();
    }
}

export class ShieldEffect extends SpecialObject {
    constructor(owner, duration, color = 0xADD8E6) {
        super(owner, duration);
        const g = new THREE.SphereGeometry(2, 16, 16), m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .4, side: THREE.DoubleSide });
        this.mesh = new THREE.Mesh(g, m);
        scene.add(this.mesh);
    }
    update(delta) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.owner && !this.owner.isDead && this.owner.hp > 0) {
            this.mesh.position.copy(this.owner.mesh.position);
            this.mesh.position.y = 2;
        } else { this.duration = 0; } // Will be cleaned up by main loop
    }
}

export class SlowingMine extends SpecialObject {
    constructor(owner, position) {
        super(owner, 20);
        const g = new THREE.CylinderGeometry(.5, .5, .2, 16), m = new THREE.MeshStandardMaterial({ color: 0x32cd32 });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.position.copy(position); this.mesh.position.y = .1; scene.add(this.mesh);
        this.armed = false;
        setTimeout(() => this.armed = true, 1000);
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (!this.armed) return;
        players.forEach(p => {
            if (p.constructor.name === 'Player' && p !== this.owner && !p.isDead && p.mesh.position.distanceTo(this.mesh.position) < 2) {
                p.status.slowed = 3; this.duration = 0; // Trigger destruction
                if (audioReady) sounds.explosion.triggerAttackRelease("A3", "4n");
                specialObjects.push(new ParticleSystem(this.mesh.position, { count: 50, duration: 0.8, speed: 10, startColor: new THREE.Color(0x32cd32), endColor: new THREE.Color(0x111111) }));
            }
        });
    }
}

export class LaserCore extends SpecialObject {
    constructor(owner, target) {
        super(owner, 2.5);
        this.target = target;
        const g = new THREE.CylinderGeometry(.2, .2, 1, 8), m = new THREE.MeshBasicMaterial({ color: 0x32cd32, transparent: true, opacity: .8, blending: THREE.AdditiveBlending });
        this.mesh = new THREE.Mesh(g, m); scene.add(this.mesh);
        this.damageInterval = .2; this.damageTimer = 0;
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (!this.target || !this.owner || this.target.isDead || this.target.hp <= 0) { this.duration = 0; return; }
        const s = this.owner.mesh.position, e = this.target.mesh.position, d = s.distanceTo(e);
        this.mesh.scale.y = d;
        this.mesh.position.copy(s).lerp(e, .5); this.mesh.position.y = 2;
        const up = new THREE.Vector3(0, 1, 0), axis = new THREE.Vector3().subVectors(e, s).normalize();
        this.mesh.quaternion.setFromUnitVectors(up, axis);
        this.damageTimer -= delta;
        if (this.damageTimer <= 0) {
            this.damageTimer = this.damageInterval; this.target.takeDamage(5); // This is 25 DPS, for 62.5 total.
            specialObjects.push(new ParticleSystem(this.target.mesh.position.clone().setY(2), { count: 10, duration: 0.2, speed: 2, startColor: new THREE.Color(0x32cd32), endColor: new THREE.Color(0xffffff) }));
        }
    }
}

export class WindWall extends SpecialObject {
    constructor(owner, position, quat) {
        super(owner, 6);
        const g = new THREE.PlaneGeometry(8, 5), m = new THREE.MeshBasicMaterial({ color: 0x90ee90, transparent: true, opacity: .4, side: THREE.DoubleSide });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.position.copy(position); this.mesh.position.y = 2.5; this.mesh.quaternion.copy(quat); scene.add(this.mesh);
        const helper = new THREE.BoxHelper(this.mesh); helper.update();
        this.collider = new THREE.Box3().setFromObject(helper);
        this.blocksProjectiles = true;
        this.aura = new PlayerAura(this, 150, 0x90ee90, 4, 0.1);
        if (!this.aura.mesh) this.aura = null;
    }
    update(delta) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.aura) this.aura.update(delta);
    }
    destroy() {
        if (this.isDestroyed) return;
        if (this.aura) this.aura.destroy();
        super.destroy();
    }
}

export class StasisField extends SpecialObject {
    constructor(owner, position) {
        super(owner, 5);
        const g = new THREE.SphereGeometry(3, 16, 16), m = new THREE.MeshBasicMaterial({ color: 0x40e0d0, transparent: true, opacity: .3 });
        this.mesh = new THREE.Mesh(g, m); this.mesh.position.copy(position); this.mesh.position.y = 2; scene.add(this.mesh);
        this.aura = new PlayerAura(this, 100, 0x40e0d0, 1, 0.2);
        if (!this.aura.mesh) this.aura = null;
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.aura) this.aura.update(delta);
        players.forEach(p => { if (p.constructor.name === 'Player' && p !== this.owner && !p.isDead && p.mesh.position.distanceTo(this.mesh.position) < 3) p.status.rooted = .5; });
    }
    destroy() {
        if (this.isDestroyed) return;
        if (this.aura) this.aura.destroy();
        super.destroy();
    }
}

export class Cyclone extends SpecialObject {
    constructor(owner) {
        super(owner, 4);
        this.aura = new PlayerAura(this.owner, 200, 0x1e90ff, 15, 0.15);
        if (!this.aura.mesh) this.aura = null;
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        const opp = players.find(p => p.constructor.name === 'Player' && p !== this.owner && !p.isDead);
        if (opp) {
            const dir = new THREE.Vector3().subVectors(this.owner.mesh.position, opp.mesh.position);
            if (dir.length() < 12) { dir.normalize(); opp.velocity.add(dir.multiplyScalar(15 * delta)); }
        }
    }
    destroy() {
        if (this.isDestroyed) return;
        if (this.aura) this.aura.destroy();
        super.destroy();
    }
}

export class Decimate extends SpecialObject {
    constructor(owner) {
        super(owner, .5);
        const g = new THREE.TorusGeometry(3, .2, 8, 32), m = new THREE.MeshBasicMaterial({ color: 0xdc143c });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.position.copy(owner.mesh.position);
        this.mesh.rotation.x = Math.PI / 2;
        this.mesh.scale.set(.1, .1, .1); scene.add(this.mesh);
        this.hit = false;
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        const scale = (1 - (this.duration / this.initialDuration)) * 1.2;
        this.mesh.scale.set(scale, scale, scale);
        if (!this.hit) {
            const opp = players.find(p => p.constructor.name === 'Player' && p !== this.owner && !p.isDead);
            if (opp && opp.mesh.position.distanceTo(this.mesh.position) < (3 * scale)) { opp.takeDamage(20); this.hit = true; }
        }
    }
}

export class MeleeSlash extends SpecialObject {
    constructor(owner, color) {
        super(owner, .4);
        const shape = new THREE.Shape();
        shape.moveTo(0, -2.5);
        shape.absarc(0, 0, 2.5, -Math.PI / 2.5, Math.PI / 2.5, false);
        shape.lineTo(0, -2.5);
        const g = new THREE.ShapeGeometry(shape), m = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.position.copy(owner.mesh.position);
        this.mesh.position.y = 2;
        this.mesh.quaternion.copy(owner.mesh.quaternion);
        this.mesh.position.add(owner.aimDirection.clone().multiplyScalar(.5));
        scene.add(this.mesh);
    }
    update(delta) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.mesh && this.mesh.material) this.mesh.material.opacity = this.duration / this.initialDuration;
    }
}

export class TectonicSlam extends SpecialObject {
    constructor(owner, players) { // BUG-FIX: Pass 'players' in
        super(owner, 1);
        specialObjects.push(new ExpandingRing(owner.mesh.position, CHARACTERS['COLOSSUS'].color, 5, 0.5));
        specialObjects.push(new ParticleSystem(owner.mesh.position, { count: 100, duration: 1, speed: 8, startColor: new THREE.Color(CHARACTERS['COLOSSUS'].color), endColor: new THREE.Color(0x333333), emissionShape: 'sphere', gravity: -10 }));
        const opp = players.find(p => p.constructor.name === 'Player' && p !== this.owner && !p.isDead);
        if (opp && opp.mesh.position.distanceTo(owner.mesh.position) < 5) { opp.takeDamage(15); opp.status.slowed = 2; }
        if (audioReady) sounds.explosion.triggerAttackRelease("C2", "2n");
    }
}

export class SentryTurret extends SpecialObject {
    constructor(owner, position, hp = 60, duration = 15) {
        super(owner, duration);
        this.hp = hp;
        const base = new THREE.Mesh(new THREE.CylinderGeometry(.5, .7, 1, 8), new THREE.MeshStandardMaterial({ color: owner.mesh.children[0].material.color.clone().multiplyScalar(.7) }));
        const head = new THREE.Mesh(new THREE.SphereGeometry(.4, 8, 8), new THREE.MeshStandardMaterial({ color: owner.mesh.children[0].material.color }));
        head.position.y = .7;
        this.mesh = new THREE.Group();
        this.mesh.add(base); this.mesh.add(head);
        this.mesh.position.copy(position); this.mesh.position.y = .5;
        scene.add(this.mesh);
        this.fireRate = .75; this.fireTimer = 0;
        this.head = head;
        this.collider = new THREE.Box3().setFromObject(this.mesh);
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        this.fireTimer -= delta;
        const opp = players.find(p => p.constructor.name === 'Player' && p !== this.owner && !p.isDead && p.hp > 0 && p.status.cloaked <= 0);
        if (!opp) return;
        const target = opp.mesh.position.clone();
        this.head.lookAt(target);
        if (this.mesh.position.distanceTo(target) < 15 && this.fireTimer <= 0) {
            this.fireTimer = this.fireRate;
            const start = new THREE.Vector3();
            this.head.getWorldPosition(start);
            const dir = new THREE.Vector3().subVectors(opp.mesh.position, start).normalize();
            const proj = new Projectile(this, dir, 5, 25, {}); // `this` (turret) is owner
            proj.mesh.position.copy(start);
            projectiles.push(proj);
        }
    }
    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) this.duration = 0; // Trigger destruction
    }
}

export class StatusAura extends SpecialObject {
    constructor(owner, duration, color) {
        super(owner, duration);
        const g = new THREE.TorusGeometry(1.5, .05, 8, 48), m = new THREE.MeshBasicMaterial({ color, transparent: true });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.rotation.x = Math.PI / 2;
        scene.add(this.mesh);
    }
    update(delta) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.owner && !this.owner.isDead && this.owner.hp > 0) {
            this.mesh.position.copy(this.owner.mesh.position);
            this.mesh.position.y = .1;
            this.mesh.material.opacity = this.duration / this.initialDuration;
        } else this.duration = 0;
    }
}

export class EyeOfTheStorm extends SpecialObject {
    constructor(owner) {
        super(owner, 6);
        this.damageInterval = .5; this.damageTimer = 0;
        this.pullRadius = 15; this.damageRadius = 6;
        const g = new THREE.TorusGeometry(this.damageRadius, .2, 16, 100), m = new THREE.MeshBasicMaterial({ color: 0x1e90ff, blending: THREE.AdditiveBlending, transparent: true });
        this.mesh = new THREE.Mesh(g, m); this.mesh.rotation.x = Math.PI / 2; scene.add(this.mesh);
        this.aura = new PlayerAura(owner, 200, 0x1e90ff, 10, 0.2);
        if (!this.aura.mesh) this.aura = null;
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (!this.owner || this.owner.isDead || this.owner.hp <= 0) { this.duration = 0; return; }
        this.mesh.position.copy(this.owner.mesh.position); this.mesh.position.y = .2;
        this.mesh.rotation.z += delta * 3;
        this.mesh.material.opacity = .5 + Math.sin(this.duration * 5) * .25;
        const opp = players.find(p => p.constructor.name === 'Player' && p !== this.owner && !p.isDead);
        if (opp) {
            const dir = new THREE.Vector3().subVectors(this.owner.mesh.position, opp.mesh.position);
            const dist = dir.length();
            if (dist < this.pullRadius) { dir.normalize(); opp.velocity.add(dir.multiplyScalar(35 * delta * (1 - dist / this.pullRadius))); }
        }
        this.damageTimer -= delta;
        if (this.damageTimer <= 0) {
            this.damageTimer = this.damageInterval;
            players.forEach(p => { if (p.constructor.name === 'Player' && !p.isDead && p.mesh.position.distanceTo(this.mesh.position) < this.damageRadius) { if (p !== this.owner) p.takeDamage(8, true); } });
        }
    }
    destroy() {
        if (this.isDestroyed) return;
        if (this.aura) this.aura.destroy();
        super.destroy();
    }
}

export class CrushingSingularity extends SpecialObject {
    constructor(owner, position) {
        super(owner, 3);
        const ownerColor = CHARACTERS[owner.characterKey]?.color || 0x6a0dad;
        const g = new THREE.SphereGeometry(2.5, 16, 16);
        const m = new THREE.MeshBasicMaterial({ color: ownerColor, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.position.copy(position); this.mesh.position.y = 2; scene.add(this.mesh);
        this.aura = new PlayerAura(this, 100, ownerColor, 8, 0.15);
        if (!this.aura.mesh) this.aura = null;
        this.damageTimer = 1.0;
        this.pullRadius = 8;
        this.damageRadius = 2.5;
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.aura) this.aura.update(delta);

        players.forEach(p => {
            if (p.constructor.name === 'Player' && p !== this.owner && p && !p.isDead && p.mesh && p.mesh.position.distanceTo(this.mesh.position) < this.pullRadius) {
                const pullDir = new THREE.Vector3().subVectors(this.mesh.position, p.mesh.position);
                if (pullDir.lengthSq() > 0.01) {
                    p.velocity.add(pullDir.normalize().multiplyScalar(10 * delta));
                }
            }
        });

        this.damageTimer -= delta;
        if (this.damageTimer <= 0) {
            players.forEach(p => {
                if (p.constructor.name === 'Player' && p !== this.owner && p && !p.isDead && p.mesh && p.mesh.position.distanceTo(this.mesh.position) < this.damageRadius) {
                    p.takeDamage(15);
                    specialObjects.push(new ParticleSystem(p.mesh.position.clone().setY(2), { count: 15, duration: 0.3, speed: 3, startColor: new THREE.Color(this.mesh.material.color), endSize: 0 }));
                    if (p.status.gravityMarks !== undefined) p.status.gravityMarks++;
                    else p.status.gravityMarks = 1;
                    p.status.gravityMarkTimer = 4;
                }
            });
            this.damageTimer = 1.0;
        }
    }
    destroy() {
        if (this.isDestroyed) return;
        if (this.aura) this.aura.destroy();
        super.destroy();
    }
}

export class ImplosionEffect extends SpecialObject {
    constructor(owner, target) {
        super(owner, 3);
        this.target = target;
        const ownerColor = CHARACTERS[owner.characterKey]?.color || 0x6a0dad;
        const g = new THREE.SphereGeometry(1, 16, 16);
        const m = new THREE.MeshBasicMaterial({ color: ownerColor, transparent: true, opacity: 0.7 });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.position.copy(target.mesh.position); this.mesh.position.y = 3; scene.add(this.mesh);
        this.particleSystem = new ParticleSystem(this.mesh.position.clone().setY(3.5), {
            count: 30, duration: 3, speed: 0, startColor: new THREE.Color(ownerColor), endColor: new THREE.Color(0xff0000),
            startSize: 0.2, endSize: 0.05
        });
        specialObjects.push(this.particleSystem);
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.target && this.target.mesh) {
            this.mesh.position.copy(this.target.mesh.position); this.mesh.position.y = 3;
            if (this.particleSystem && this.particleSystem.mesh) {
                this.particleSystem.mesh.position.copy(this.target.mesh.position);
                this.particleSystem.mesh.position.y = 3.5;
            }
        }

        if (this.duration <= 0 && this.target) {
            const detonatePos = this.target.mesh.position.clone();
            specialObjects.push(new ParticleSystem(detonatePos.clone().setY(2), {
                count: 100, duration: 1, speed: 15, gravity: -20,
                startColor: new THREE.Color(CHARACTERS[this.owner.characterKey]?.color || 0x6a0dad),
                endColor: new THREE.Color(0x000000)
            }));
            if (audioReady) sounds.explosion.triggerAttackRelease("A2", "2n");

            players.forEach(p => {
                if (p.constructor.name === 'Player' && p && !p.isDead && p.mesh && p.mesh.position.distanceTo(detonatePos) < 5) {
                    if (p === this.target) p.takeDamage(30);
                    else p.takeDamage(15);
                    if (p !== this.target) {
                        const pullDir = new THREE.Vector3().subVectors(detonatePos, p.mesh.position);
                        if (pullDir.lengthSq() > 0.01) {
                            p.velocity.add(pullDir.normalize().multiplyScalar(30));
                        }
                    }
                }
            });
        }
    }
}

export class BarrierWall extends SpecialObject {
    constructor(owner, position, quaternion, duration = 8, size = [10, 5, 0.5]) {
        super(owner, duration);
        const g = new THREE.BoxGeometry(size[0], size[1], size[2]), m = new THREE.MeshStandardMaterial({ color: CHARACTERS[owner.characterKey].color, transparent: true, opacity: 0.6 });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.position.copy(position); this.mesh.quaternion.copy(quaternion); this.mesh.position.y = size[1] / 2; scene.add(this.mesh);
        this.collider = new THREE.Box3().setFromObject(this.mesh);
        this.blocksProjectiles = true;
    }
}

export class BlackHole extends SpecialObject {
    constructor(owner, position) {
        super(owner, 5);
        this.pullRadius = 15;
        this.markTimer = 1.0;
        const ownerColor = CHARACTERS[owner.characterKey]?.color || 0x6a0dad;
        const g = new THREE.SphereGeometry(3, 32, 32);
        const m = new THREE.MeshBasicMaterial({ color: 0x110011, transparent: true, opacity: 0.8 });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.position.copy(position); this.mesh.position.y = 2; scene.add(this.mesh);
        this.aura = new PlayerAura(this, 200, ownerColor, 15, 0.2);
        if (!this.aura.mesh) this.aura = null;
        const ringGeo = new THREE.TorusGeometry(this.pullRadius, 0.5, 8, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: ownerColor, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
        this.ring = new THREE.Mesh(ringGeo, ringMat);
        this.ring.position.copy(position); this.ring.position.y = 0.1; this.ring.rotation.x = Math.PI / 2; scene.add(this.ring);
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.aura) this.aura.update(delta);
        if (this.ring) {
            this.ring.rotation.z += delta * 2;
            this.ring.material.opacity = 0.2 + Math.sin(this.duration * 5) * 0.1;
        }

        players.forEach(p => {
            if (p.constructor.name === 'Player' && p && !p.isDead && p.mesh && p.mesh.position.distanceTo(this.mesh.position) < this.pullRadius) {
                const pullDir = new THREE.Vector3().subVectors(this.mesh.position, p.mesh.position);
                const distance = pullDir.length();
                if (distance > 0.5) {
                    pullDir.normalize();
                    const pullStrength = 40 * delta * (1 - distance / this.pullRadius);
                    p.velocity.add(pullDir.multiplyScalar(pullStrength));
                }
                p.velocity.y += 5 * delta;
            }
        });

        this.markTimer -= delta;
        if (this.markTimer <= 0) {
            players.forEach(p => {
                if (p.constructor.name === 'Player' && p && p !== this.owner && !p.isDead && p.mesh && p.mesh.position.distanceTo(this.mesh.position) < this.pullRadius) {
                    if (p.status.gravityMarks !== undefined) p.status.gravityMarks++;
                    else p.status.gravityMarks = 1;
                    p.status.gravityMarkTimer = 4;
                }
            });
            this.markTimer = 1.0;
        }

        players.forEach(p => {
            if (p.constructor.name === 'Player' && p && !p.isDead && p.mesh && p.mesh.position.distanceTo(this.mesh.position) < 3) {
                p.takeDamage(5 * delta);
            }
        });
    }
    destroy() {
        if (this.isDestroyed) return;
        if (this.aura) this.aura.destroy();
        if (this.ring) {
            scene.remove(this.ring);
            if (this.ring.geometry) this.ring.geometry.dispose();
            if (this.ring.material) this.ring.material.dispose();
            this.ring = null;
        }
        super.destroy();
    }
}

export class AdrenalHaze extends SpecialObject {
    constructor(owner) {
        super(owner, 6);
        const g = new THREE.SphereGeometry(8, 32, 32), m = new THREE.MeshBasicMaterial({ color: CHARACTERS['CATALYST'].color, transparent: true, opacity: 0.2 });
        this.mesh = new THREE.Mesh(g, m); this.mesh.position.copy(owner.mesh.position); scene.add(this.mesh);
        this.tickTimer = 1;
        this.aura = new PlayerAura(this, 150, 0x00ff7f, 2, 0.1);
        if (!this.aura.mesh) this.aura = null;
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.aura) this.aura.update(delta);
        this.tickTimer -= delta;
        if (this.tickTimer <= 0) {
            this.tickTimer = 1;
            players.forEach(p => {
                if (p.constructor.name === 'Player' && !p.isDead && p.mesh.position.distanceTo(this.mesh.position) < 8) {
                    if (p === this.owner) p.speed = CHARACTERS[p.characterKey].speed * 1.2;
                    else p.status.slowed = 1.1;
                } else if (p === this.owner && p.speed > CHARACTERS[p.characterKey].speed) {
                    p.speed = CHARACTERS[p.characterKey].speed;
                }
            });
        }
    }
    destroy() {
        if (this.isDestroyed) return;
        if (this.aura) this.aura.destroy();
        super.destroy();
        if (this.owner) this.owner.speed = CHARACTERS[this.owner.characterKey].speed;
    }
}

export class BladeFury extends SpecialObject {
    constructor(owner) {
        super(owner, 3);
        this.slashes = []; this.slashTimer = 0.2; this.color = CHARACTERS['RONIN'].color;
        this.aura = new PlayerAura(owner, 100, 0xff4500, 20, 0.1);
        if (!this.aura.mesh) this.aura = null;
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        this.slashTimer -= delta;
        if (this.slashTimer <= 0) {
            this.slashTimer = 0.2;
            const slash = new MeleeSlash(this.owner, this.color);
            specialObjects.push(slash);
            const opp = players.find(p => p.constructor.name === 'Player' && p !== this.owner && !p.isDead);
            if (opp && opp.mesh.position.distanceTo(this.owner.mesh.position) < this.owner.attackRange * 1.5) {
                opp.takeDamage(8);
            }
        }
    }
    destroy() {
        if (this.isDestroyed) return;
        if (this.aura) this.aura.destroy();
        super.destroy();
    }
}

export class SandSoldier extends SpecialObject {
    constructor(owner, position, duration = 10) {
        super(owner, duration);
        this.hp = 60;
        const color = new THREE.Color(CHARACTERS['MIRAGE'].color);
        const mat = new THREE.MeshStandardMaterial({ color, metalness: .7, roughness: .4, emissive: color, emissiveIntensity: 0.3 });

        const createPart = (geo, mat, pos, rot = [0, 0, 0]) => {
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.set(pos[0], pos[1], pos[2]);
            mesh.rotation.set(rot[0], rot[1], rot[2]);
            mesh.castShadow = true;
            return mesh;
        };

        const g = new THREE.Group();
        g.add(createPart(new THREE.ConeGeometry(0.3, 3, 4), mat, [0, 1.5, 0]));
        g.add(createPart(new THREE.IcosahedronGeometry(0.5, 0), mat, [0, 3.3, 0]));
        this.spear = createPart(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), mat, [0.5, 2, 1.5], [Math.PI / 3, 0, 0]);
        g.add(this.spear);
        this.mesh = g;
        this.mesh.position.copy(position); scene.add(this.mesh);

        this.attackRange = 6; this.attackTimer = 0; this.damage = 15;
        this.isDashing = false; this.dashTarget = new THREE.Vector3(); this.dashSpeed = 25; this.hitDuringDash = false;
        this.collider = new THREE.Box3().setFromObject(this.mesh);
        specialObjects.push(new SpawnEffect(this.mesh.position, color));
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        const opp = players.find(p => p.constructor.name === 'Player' && p !== this.owner && !p.isDead);

        if (this.isDashing) {
            if (!opp) { this.isDashing = false; return; }
            const dir = new THREE.Vector3().subVectors(this.dashTarget, this.mesh.position);
            if (dir.length() < 1) { this.isDashing = false; this.hitDuringDash = false; return; }
            dir.normalize(); this.mesh.position.add(dir.multiplyScalar(this.dashSpeed * delta));
            if (opp && !this.hitDuringDash && opp.mesh.position.distanceTo(this.mesh.position) < 2) {
                opp.takeDamage(10); opp.status.slowed = 1.5; this.hitDuringDash = true;
            }
            return;
        }

        this.attackTimer -= delta;
        if (!opp) return;

        const targetPos = opp.mesh.position.clone().setY(this.mesh.position.y);
        this.mesh.lookAt(targetPos);

        if (this.attackTimer <= 0 && this.mesh.position.distanceTo(opp.mesh.position) < this.attackRange) {
            this.attackTimer = 1.2 / (1 + (this.owner?.passiveState.attackSpeedStacks || 0) * 0.2);
            const originalZ = this.spear.position.z;
            this.spear.position.z = originalZ + 1.0;
            setTimeout(() => { if (this.spear) { this.spear.position.z = originalZ; } }, 100);
            opp.takeDamage(this.damage);
            if (audioReady) sounds.hit.triggerAttackRelease("A4", "16n");
            if (this.owner) {
                this.owner.passiveState.attackSpeedStacks = Math.min(3, (this.owner.passiveState.attackSpeedStacks || 0) + 1);
                this.owner.passiveState.attackSpeedTimer = 3;
            }
        }
    }
    dashTo(targetPos) { this.dashTarget.copy(targetPos); this.isDashing = true; this.hitDuringDash = false; }
    takeDamage(amount) { this.hp -= amount; if (this.hp <= 0) this.duration = 0; }
    destroy() {
        if (this.isDestroyed) return;
        if (this.mesh) {
            this.mesh.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) child.material.forEach(mat => mat.dispose());
                    else child.material.dispose();
                }
            });
        }
        super.destroy(); // Removes group from scene
    }
}

export class SoldierWall extends SpecialObject {
    constructor(owner, position, quaternion) {
        super(owner, 2.5);
        const g = new THREE.BoxGeometry(16, 5, 0.5);
        const m = new THREE.MeshStandardMaterial({ color: CHARACTERS['MIRAGE'].color, transparent: true, opacity: 0.7, emissive: CHARACTERS['MIRAGE'].color, emissiveIntensity: 0.4 });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.position.copy(position); this.mesh.quaternion.copy(quaternion); this.mesh.position.y = 2.5; scene.add(this.mesh);
        this.collider = new THREE.Box3().setFromObject(this.mesh);
        this.blocksProjectiles = true;
        this.speed = 8;
        this.hitPlayers = new Set();
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.mesh.quaternion);
        this.mesh.position.add(forward.multiplyScalar(this.speed * delta));
        this.collider.setFromObject(this.mesh);

        players.forEach(p => {
            if (p.constructor.name === 'Player' && p !== this.owner && !p.isDead && !this.hitPlayers.has(p) && this.collider.intersectsBox(p.collider)) {
                p.takeDamage(30);
                const knockbackDir = forward.clone().setY(0.2).normalize();
                p.velocity.add(knockbackDir.multiplyScalar(35));
                this.hitPlayers.add(p);
            }
        });
    }
}

export class OrbitalStrikeMarker extends SpecialObject {
    constructor(owner, position) {
        super(owner, 2);
        const g = new THREE.CylinderGeometry(5, 5, 0.2, 32, 1, true);
        const m = new THREE.MeshBasicMaterial({ color: 0xff0000, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
        this.mesh = new THREE.Mesh(g, m);
        this.mesh.position.copy(position); this.mesh.position.y = 0.1; scene.add(this.mesh);
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.mesh) this.mesh.material.opacity = 0.5 + Math.sin(this.initialDuration - this.duration) * 5 * 0.25;
        if (this.duration <= 0) {
            if (audioReady) sounds.explosion.triggerAttackRelease("A1", "1n");
            specialObjects.push(new ParticleSystem(this.mesh.position, {
                count: 300, duration: 1.5, speed: 20, startColor: new THREE.Color(0xffa500), endColor: new THREE.Color(0xff0000), gravity: -10
            }));
            players.forEach(p => {
                if (p.constructor.name === 'Player' && !p.isDead && p.mesh.position.distanceTo(this.mesh.position) < 5) {
                    p.takeDamage(60); // Javelin S4 damage
                }
            });
        }
    }
}

export class Thunderstorm extends SpecialObject {
    constructor(owner) {
        super(owner, 6);
        this.boltTimer = 0.4;
        this.aura = new PlayerAura(owner, 200, 0x1e90ff, 10, 0.2);
        if (!this.aura.mesh) this.aura = null;
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (!this.owner || this.owner.isDead) { this.duration = 0; return; }
        this.boltTimer -= delta;
        if (this.boltTimer <= 0) {
            this.boltTimer = 0.4;
            const strikePos = this.owner.mesh.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 16, 0, (Math.random() - 0.5) * 16));
            strikePos.y = 0;
            specialObjects.push(new ParticleSystem(strikePos.clone().setY(10), {
                count: 50, duration: 0.5, speed: 5, startColor: new THREE.Color(0x00ffff), endColor: new THREE.Color(0x1e90ff), gravity: -40
            }));
            players.forEach(p => {
                if (p.constructor.name === 'Player' && !p.isDead && p.mesh.position.distanceTo(strikePos) < 2.5) {
                    p.takeDamage(15);
                }
            });
        }
    }
    destroy() { if (this.isDestroyed) return; if (this.aura) this.aura.destroy(); super.destroy(); }
}

export class PulverizeLeap extends SpecialObject {
    constructor(owner, targetPos) {
        super(owner, 1.0);
        this.startPos = owner.mesh.position.clone();
        this.targetPos = targetPos;
        this.owner.status.unstoppable = 1.0;
        this.owner.status.rooted = 1.0;
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (!this.owner || this.owner.isDead) { this.duration = 0; return; }

        const progress = 1 - (this.duration / this.initialDuration);
        const leapPos = new THREE.Vector3().lerpVectors(this.startPos, this.targetPos, progress);
        leapPos.y = this.startPos.y + Math.sin(progress * Math.PI) * 8;
        this.owner.mesh.position.copy(leapPos);

        if (this.duration <= 0) {
            if (audioReady) sounds.explosion.triggerAttackRelease("C2", "2n");
            specialObjects.push(new TectonicSlam(this.owner, players)); // Pass players
            players.forEach(p => {
                if (p.constructor.name === 'Player' && p !== this.owner && !p.isDead && p.mesh.position.distanceTo(this.targetPos) < 5) {
                    p.takeDamage(40);
                    p.status.rooted = 1.5;
                }
            });
        }
    }
}

export class TimeStopEffect extends SpecialObject {
    constructor(owner, duration) {
        super(owner, duration);
        this.aura = new PlayerAura(this, 300, 0x40e0d0, 1, 0.1);
        if (!this.aura.mesh) this.aura = null;
        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 32), new THREE.MeshBasicMaterial({ color: 0x40e0d0, transparent: true, opacity: 0.2, side: THREE.BackSide }));
        this.mesh.position.copy(owner.mesh.position);
        scene.add(this.mesh);
        this.frozenProjectiles = [];
    }
    update(delta, players, projs) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.aura) this.aura.update(delta);
        this.mesh.material.opacity = (this.duration / this.initialDuration) * 0.2;
        this.mesh.position.copy(this.owner.mesh.position);

        players.forEach(p => {
            if (p.constructor.name === 'Player' && p !== this.owner && !p.isDead && p.mesh.position.distanceTo(this.mesh.position) < 20) {
                p.status.rooted = 0.1;
                p.velocity.set(0, 0, 0);
            }
        });
        projs.forEach(p => {
            // V-FIX: Added !p.isDestroyed
            if (!p.isDestroyed && p.mesh.position.distanceTo(this.mesh.position) < 20 && p.speed > 0.001) {
                p.speed = 0.001;
                if (!this.frozenProjectiles.includes(p)) this.frozenProjectiles.push(p);
            }
        });
    }
    destroy() {
        if (this.isDestroyed) return;
        if (this.aura) this.aura.destroy();
        this.frozenProjectiles.forEach(p => {
            if (p && p.originalSpeed) p.speed = p.originalSpeed;
        });
        this.frozenProjectiles = [];
        super.destroy();
    }
}

export class GaleForceTornado extends SpecialObject {
    constructor(owner, direction) {
        super(owner, 5);
        this.direction = direction.clone();
        this.speed = 10;
        this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 3, 6, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0x90ee90, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
        if (owner && owner.mesh) this.mesh.position.copy(owner.mesh.position).add(new THREE.Vector3(0, 3, 0));
        else this.mesh.position.set(0, 3, 0);
        scene.add(this.mesh);
        this.aura = new PlayerAura(this, 150, 0x90ee90, 20, 0.2);
        if (!this.aura.mesh) this.aura = null;
        this.hitPlayers = new Set();
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (this.aura) this.aura.update(delta);
        this.mesh.position.add(this.direction.clone().multiplyScalar(this.speed * delta));
        this.mesh.rotation.y += delta * 5;

        players.forEach(p => {
            if (p.constructor.name === 'Player' && p !== this.owner && !p.isDead && !this.hitPlayers.has(p)) {
                if (p.mesh.position.distanceTo(this.mesh.position) < 3.5) {
                    p.takeDamage(30);
                    p.velocity.add(this.direction.clone().multiplyScalar(15));
                    this.hitPlayers.add(p);
                }
            }
        });
    }
    destroy() { if (this.isDestroyed) return; if (this.aura) this.aura.destroy(); super.destroy(); }
}

export class AnvilTurret extends SentryTurret {
    constructor(owner, position) {
        super(owner, position, 200, 30);
        this.fireRate = 0.25;
        this.damage = 8;
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta); // Ticks duration
        this.fireTimer -= delta;
        const opp = players.find(p => p.constructor.name === 'Player' && p !== this.owner && !p.isDead && p.hp > 0 && p.status.cloaked <= 0);
        if (!opp) return;
        const target = opp.mesh.position.clone();
        this.head.lookAt(target);
        if (this.mesh.position.distanceTo(target) < 18 && this.fireTimer <= 0) {
            this.fireTimer = this.fireRate;
            const start = new THREE.Vector3();
            this.head.getWorldPosition(start);
            const dir = new THREE.Vector3().subVectors(opp.mesh.position.clone().setY(2), start).normalize();
            const proj = new Projectile(this, dir, this.damage, 30, {});
            proj.mesh.position.copy(start);
            projectiles.push(proj);
        }
    }
}

export class PlagueCloud extends AdrenalHaze {
    constructor(owner) {
        super(owner);
        this.duration = 8;
        this.mesh.material.color.set(CHARACTERS['CATALYST'].color);
        if (this.aura) this.aura.mesh.material.color.set(CHARACTERS['CATALYST'].color);
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        // Don't call super.update() for AdrenalHaze
        this.duration -= delta; 
        if (this.aura) this.aura.update(delta);
        
        this.tickTimer -= delta;
        if (this.tickTimer <= 0) {
            this.tickTimer = 1;
            players.forEach(p => {
                if (p.constructor.name === 'Player' && !p.isDead && p.mesh.position.distanceTo(this.mesh.position) < 8) {
                    if (p !== this.owner) {
                        p.status.venom = 2;
                        p.status.corruption = 2;
                    }
                }
            });
        }
    }
}

export class ShadowStrikeDash extends SpecialObject {
    constructor(owner, targets) {
        super(owner, targets.length * 0.4 + 0.2);
        this.targets = targets.filter(t => t && !t.isDead);
        this.currentTargetIndex = 0;
        if (this.targets.length === 0) { this.duration = 0; return; }

        this.target = this.targets[0];
        this.startPos = owner.mesh.position.clone();
        this.dashTimer = 0.4;
        this.owner.status.unstoppable = this.duration;
        this.owner.mesh.visible = false;
    }
    update(delta, players) {
        if (this.isDestroyed) return;
        super.update(delta);
        if (!this.owner || !this.target || this.owner.isDead || (this.target.isDead && this.target.hp <= 0)) { this.duration = 0; return; }

        this.dashTimer -= delta;
        specialObjects.push(new ParticleSystem(this.owner.mesh.position.clone().setY(2), {
            count: 15, duration: 0.3, speed: 3, startColor: new THREE.Color(CHARACTERS['RONIN'].color), endSize: 0
        }));

        const progress = 1 - Math.max(0, this.dashTimer / 0.4);
        this.owner.mesh.position.lerpVectors(this.startPos, this.target.mesh.position, progress);

        if (this.dashTimer <= 0) {
            this.target.takeDamage(25);
            const slashOwner = {
                mesh: {
                    position: this.target.mesh.position.clone(),
                    quaternion: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3().subVectors(this.startPos, this.target.mesh.position).normalize()),
                    children: [{ material: { color: new THREE.Color(CHARACTERS['RONIN'].color) } }]
                },
                aimDirection: new THREE.Vector3(0, 0, 1)
            }
            specialObjects.push(new MeleeSlash(slashOwner, CHARACTERS['RONIN'].color));
            if (audioReady) sounds.hit.triggerAttackRelease("C4", "16n");

            this.currentTargetIndex++;
            if (this.currentTargetIndex >= this.targets.length) {
                this.duration = 0;
            } else {
                this.target = this.targets[this.currentTargetIndex];
                this.startPos.copy(this.owner.mesh.position);
                this.dashTimer = 0.4;
            }
        }
    }
    destroy() {
        if (this.isDestroyed) return;
        if (this.owner) {
            this.owner.mesh.visible = true;
            if (this.targets && this.targets.length > 0) {
                const lastTargetPos = this.targets[this.targets.length - 1].mesh.position;
                this.owner.mesh.position.copy(lastTargetPos).add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5).multiplyScalar(2));
            }
        }
        super.destroy();
    }
}