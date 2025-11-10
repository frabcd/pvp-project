/*
 * models.js
 * Contains the createCharacterModel function for generating 3D character meshes.
 */

import * as THREE from 'three';
import { CHARACTERS } from './constants.js';

/**
 * Creates a procedural 3D model for a given character.
 * @param {object} character The character data from CHARACTERS.
 * @param {boolean} inGame Whether the model is for in-game use (casts shadows).
 * @returns {THREE.Group} A group containing the character's mesh.
 */
export function createCharacterModel(character, inGame = true) {
    const group = new THREE.Group();
    const color = new THREE.Color(character.color);
    const mat = new THREE.MeshStandardMaterial({
        color: color,
        metalness: .4,
        roughness: .6,
        emissive: 0x000000
    });
    const emissiveMat = (c, intensity = 0.5) => new THREE.MeshStandardMaterial({
        color: c,
        metalness: .4,
        roughness: .6,
        emissive: c,
        emissiveIntensity: intensity
    });

    const castShadow = inGame;

    // Helper function for body parts
    const createPart = (geo, mat, pos, rot = [0, 0, 0]) => {
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(pos[0], pos[1], pos[2]);
        mesh.rotation.set(rot[0], rot[1], rot[2]);
        mesh.castShadow = castShadow;
        return mesh;
    };

    switch (character.name) {
        case "Echo Prime":
            group.add(createPart(new THREE.CapsuleGeometry(0.8, 1.5, 4, 12), mat, [0, 2.2, 0])); // Torso
            group.add(createPart(new THREE.IcosahedronGeometry(0.7, 0), mat, [0, 3.6, 0])); // Head
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [-1, 2.2, 0], [0, 0, 0.5])); // L Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [1, 2.2, 0], [0, 0, -0.5])); // R Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), mat, [-0.5, 0.8, 0])); // L Leg
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), mat, [0.5, 0.8, 0])); // R Leg
            const ring = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 8, 32), emissiveMat(color));
            ring.position.y = 2.5; ring.rotation.x = Math.PI / 2.5; group.add(ring);
            break;

        case "Aegis":
            group.add(createPart(new THREE.BoxGeometry(2, 2.5, 1.5), mat, [0, 2.2, 0])); // Torso
            group.add(createPart(new THREE.OctahedronGeometry(0.8), mat, [0, 4, 0])); // Head
            group.add(createPart(new THREE.BoxGeometry(0.6, 2, 0.8), mat, [-1.3, 2.2, 0])); // L Arm
            group.add(createPart(new THREE.BoxGeometry(0.6, 2, 0.8), mat, [1.3, 2.2, 0])); // R Arm
            group.add(createPart(new THREE.CylinderGeometry(0.4, 0.3, 1.2, 8), mat, [-0.6, 0.6, 0])); // L Leg
            group.add(createPart(new THREE.CylinderGeometry(0.4, 0.3, 1.2, 8), mat, [0.6, 0.6, 0])); // R Leg
            const shield = new THREE.Mesh(new THREE.BoxGeometry(0.2, 2.5, 2.5), emissiveMat(0xffffff, 0.3));
            shield.position.set(-1.8, 2.5, 0.5); shield.rotation.y = Math.PI / 6; group.add(shield);
            break;

        case "Spectre":
            group.add(createPart(new THREE.CapsuleGeometry(0.6, 2.0, 4, 10), mat, [0, 2.5, 0])); // Torso
            group.add(createPart(new THREE.SphereGeometry(0.5), mat, [0, 4.1, 0])); // Head
            group.add(createPart(new THREE.CapsuleGeometry(0.15, 1.5, 4, 8), mat, [-0.8, 2.5, 0], [0, 0, 0.4])); // L Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.15, 1.5, 4, 8), mat, [0.8, 2.5, 0], [0, 0, -0.4])); // R Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [-0.3, 0.9, 0])); // L Leg
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [0.3, 0.9, 0])); // R Leg
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 3), emissiveMat(color));
            blade.position.set(0.9, 2.5, 1); blade.rotation.x = -Math.PI / 4; group.add(blade);
            break;

        case "Javelin":
            group.add(createPart(new THREE.BoxGeometry(1.5, 2.8, 1.5), mat, [0, 2, 0])); // Torso
            group.add(createPart(new THREE.SphereGeometry(0.7), mat, [0, 4, 0])); // Head
            group.add(createPart(new THREE.CylinderGeometry(0.2, 0.2, 1.5, 8), emissiveMat(color), [0.8, 2.8, 0.8], [Math.PI/2, 0, 0])); // Gun
            group.add(createPart(new THREE.BoxGeometry(0.4, 1.8, 0.6), mat, [-0.9, 2.5, 0])); // L Arm
            group.add(createPart(new THREE.BoxGeometry(0.4, 1.8, 0.6), mat, [0.9, 2.5, 0])); // R Arm (holding gun)
            group.add(createPart(new THREE.BoxGeometry(0.5, 1.2, 0.5), mat, [-0.4, 0.6, 0])); // L Leg
            group.add(createPart(new THREE.BoxGeometry(0.5, 1.2, 0.5), mat, [0.4, 0.6, 0])); // R Leg
            break;

        case "Tempest":
            group.add(createPart(new THREE.CapsuleGeometry(0.8, 1.5, 4, 12), mat, [0, 2.2, 0])); // Torso
            group.add(createPart(new THREE.IcosahedronGeometry(0.7, 0), mat, [0, 3.6, 0])); // Head
            group.add(createPart(new THREE.SphereGeometry(0.3), mat, [-1.2, 2.8, 0])); // L Hand (floating)
            group.add(createPart(new THREE.SphereGeometry(0.3), mat, [1.2, 2.8, 0])); // R Hand (floating)
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), mat, [-0.5, 0.8, 0])); // L Leg
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), mat, [0.5, 0.8, 0])); // R Leg
            const ringT = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.05, 8, 32), emissiveMat(color));
            ringT.position.y = 2.5; ringT.rotation.x = Math.PI / 2; group.add(ringT);
            const ringT2 = ringT.clone(); ringT2.rotation.y = Math.PI/2; group.add(ringT2);
            break;

        case "Glitch":
            group.add(createPart(new THREE.BoxGeometry(1.2, 2, 1), mat, [0, 2.5, 0])); // Torso
            group.add(createPart(new THREE.BoxGeometry(1, 1, 1), mat, [0, 4, 0])); // Head
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [-0.8, 2.5, 0], [0, 0, 0.3])); // L Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [0.8, 2.5, 0], [0, 0, -0.3])); // R Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.2, 4, 8), mat, [-0.3, 0.9, 0])); // L Leg
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.2, 4, 8), mat, [0.3, 0.9, 0])); // R Leg
            const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.5, 1.5), emissiveMat(color));
            backpack.position.set(0, 2.5, -0.8); group.add(backpack);
            break;

        case "Colossus":
            group.add(createPart(new THREE.CylinderGeometry(1.5, 1.2, 3.0, 8), mat, [0, 2.0, 0])); // Torso
            group.add(createPart(new THREE.BoxGeometry(1.2, 1.2, 1.2), mat, [0, 4.2, 0])); // Head
            group.add(createPart(new THREE.BoxGeometry(0.8, 2.2, 1), mat, [-1.3, 2.0, 0])); // L Arm
            group.add(createPart(new THREE.BoxGeometry(0.8, 2.2, 1), mat, [1.3, 2.0, 0])); // R Arm
            group.add(createPart(new THREE.CylinderGeometry(0.6, 0.4, 1.4, 8), mat, [-0.7, 0.7, 0])); // L Leg
            group.add(createPart(new THREE.CylinderGeometry(0.6, 0.4, 1.4, 8), mat, [0.7, 0.7, 0])); // R Leg
            const shoulder = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1, 1.2), mat);
            shoulder.position.y = 3.2; group.add(shoulder);
            break;

        case "Chronomancer":
            group.add(createPart(new THREE.CapsuleGeometry(0.7, 1.8, 4, 12), mat, [0, 2.4, 0])); // Torso
            group.add(createPart(new THREE.SphereGeometry(0.6), mat, [0, 3.8, 0])); // Head
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [-1, 2.4, 0], [0, 0, 0.5])); // L Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [1, 2.4, 0], [0, 0, -0.5])); // R Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), mat, [-0.4, 0.8, 0])); // L Leg
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), mat, [0.4, 0.8, 0])); // R Leg
            const clockMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, 0.1, 12), emissiveMat(color));
            clockMesh.position.set(0, 2.5, -0.6); clockMesh.rotation.x = Math.PI / 3; group.add(clockMesh);
            break;

        case "Oracle":
            group.add(createPart(new THREE.ConeGeometry(1.2, 3, 16), mat, [0, 2, 0])); // Body
            group.add(createPart(new THREE.SphereGeometry(0.7), mat, [0, 4, 0])); // Head
            group.add(createPart(new THREE.BoxGeometry(0.2, 1.5, 0.2), mat, [-1, 2.5, 0])); // L Arm
            group.add(createPart(new THREE.BoxGeometry(0.2, 1.5, 0.2), mat, [1, 2.5, 0])); // R Arm
            const halo = new THREE.Mesh(new THREE.TorusGeometry(1, 0.05, 8, 32), emissiveMat(0xffffff));
            halo.position.y = 4.5; halo.rotation.x = Math.PI / 2; group.add(halo);
            break;

        case "Zephyr":
            group.add(createPart(new THREE.CapsuleGeometry(0.7, 2.5, 4, 12), mat, [0, 2.5, 0])); // Torso
            group.add(createPart(new THREE.SphereGeometry(0.5), mat, [0, 4.3, 0])); // Head
            group.add(createPart(new THREE.CapsuleGeometry(0.15, 1.5, 4, 8), mat, [-0.9, 2.5, 0], [0, 0, 0.4])); // L Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.15, 1.5, 4, 8), mat, [0.9, 2.5, 0], [0, 0, -0.4])); // R Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [-0.3, 0.9, 0])); // L Leg
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [0.3, 0.9, 0])); // R Leg
            const wing1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 1.2), emissiveMat(color, 0.3));
            wing1.position.set(0, 3, -0.8); wing1.rotation.y = Math.PI / 4; group.add(wing1);
            const wing2 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2, 1.2), emissiveMat(color, 0.3));
            wing2.position.set(0, 3, -0.8); wing2.rotation.y = -Math.PI / 4; group.add(wing2);
            break;

        case "Null":
            group.add(createPart(new THREE.CapsuleGeometry(0.8, 1.5, 4, 12), mat, [0, 2.2, 0])); // Torso
            group.add(createPart(new THREE.OctahedronGeometry(0.7), mat, [0, 3.6, 0])); // Head
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [-1, 2.2, 0], [0, 0, 0.5])); // L Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [1, 2.2, 0], [0, 0, -0.5])); // R Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), mat, [-0.5, 0.8, 0])); // L Leg
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), mat, [0.5, 0.8, 0])); // R Leg
            const ringN = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.1, 8, 32), emissiveMat(color, 0.2));
            ringN.position.y = 2.5; ringN.rotation.x = Math.PI / 1.5; group.add(ringN);
            break;

        case "Vortex":
            group.add(createPart(new THREE.CapsuleGeometry(0.9, 1.8, 4, 12), mat, [0, 2.5, 0])); // Larger torso
            const headV = new THREE.Mesh(new THREE.SphereGeometry(0.8, 16, 16), emissiveMat(0x000000, 0.8)); // More prominent black hole head
            headV.position.y = 4.0; group.add(headV);
            
            // Add accretion disk around head
            const disk1 = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.2, 32), emissiveMat(color, 0.6));
            disk1.position.y = 4.0; disk1.rotation.x = Math.PI / 2; group.add(disk1);
            
            const disk2 = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.3, 32), emissiveMat(0xffffff, 0.4));
            disk2.position.y = 4.0; disk2.rotation.x = Math.PI / 2.5; group.add(disk2);
            
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.5, 4, 8), mat, [-1.2, 2.5, 0], [0, 0, 0.6])); // L Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.5, 4, 8), mat, [1.2, 2.5, 0], [0, 0, -0.6])); // R Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.3, 1.2, 4, 8), mat, [-0.6, 0.9, 0])); // L Leg
            group.add(createPart(new THREE.CapsuleGeometry(0.3, 1.2, 4, 8), mat, [0.6, 0.9, 0])); // R Leg
            
            // Add gravitational effect rings
            const ringV1 = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 8, 32), emissiveMat(color, 0.7));
            ringV1.position.y = 3.8; ringV1.rotation.x = Math.PI / 2; group.add(ringV1);
            
            const ringV2 = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 8, 32), emissiveMat(0xffffff, 0.5));
            ringV2.position.y = 3.8; ringV2.rotation.x = Math.PI / 2.2; group.add(ringV2);
            
            // Add particle effect points to show gravitational pull
            const particle1 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), emissiveMat(color, 1));
            particle1.position.set(-0.8, 3.5, 0.5); group.add(particle1);
            
            const particle2 = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 8), emissiveMat(color, 1));
            particle2.position.set(0.8, 3.5, -0.5); group.add(particle2);
            break;

        case "Emperor": // Replaces Mirage
            group.add(createPart(new THREE.CapsuleGeometry(0.7, 1.8, 4, 12), mat, [0, 2.4, 0])); // Torso
            group.add(createPart(new THREE.SphereGeometry(0.6), mat, [0, 3.8, 0])); // Head
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [-1, 2.4, 0], [0, 0, 0.5])); // L Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [1, 2.4, 0], [0, 0, -0.5])); // R Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), mat, [-0.4, 0.8, 0])); // L Leg
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), mat, [0.4, 0.8, 0])); // R Leg
            const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 4, 8), emissiveMat(color));
            staff.position.set(1.0, 2.0, 0.5); staff.rotation.z = -Math.PI / 6; group.add(staff);
            const staffHead = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), emissiveMat(color, 1));
            staffHead.position.set(1.0, 4.0, 0.5); group.add(staffHead);
            break;

        case "Forge":
            group.add(createPart(new THREE.BoxGeometry(2, 2.5, 1.5), mat, [0, 2.2, 0])); // Torso
            group.add(createPart(new THREE.BoxGeometry(1, 1, 1), mat, [0, 4, 0])); // Head
            group.add(createPart(new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8), mat, [-1.2, 2.2, 0])); // L Arm
            group.add(createPart(new THREE.CylinderGeometry(0.4, 0.4, 1.8, 8), mat, [1.2, 2.2, 0])); // R Arm
            group.add(createPart(new THREE.BoxGeometry(0.6, 1.2, 0.6), mat, [-0.6, 0.6, 0])); // L Leg
            group.add(createPart(new THREE.BoxGeometry(0.6, 1.2, 0.6), mat, [0.6, 0.6, 0])); // R Leg
            const hammer = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.5), emissiveMat(color, 0.2));
            hammer.position.set(1.2, 2.2, 1); group.add(hammer);
            break;

        case "Catalyst":
            group.add(createPart(new THREE.CapsuleGeometry(0.8, 1.5, 4, 12), mat, [0, 2.2, 0])); // Torso
            group.add(createPart(new THREE.SphereGeometry(0.7), mat, [0, 3.6, 0])); // Head
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [-1, 2.2, 0], [0, 0, 0.5])); // L Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [1, 2.2, 0], [0, 0, -0.5])); // R Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), mat, [-0.5, 0.8, 0])); // L Leg
            group.add(createPart(new THREE.CapsuleGeometry(0.25, 1.0, 4, 8), mat, [0.5, 0.8, 0])); // R Leg
            const tank = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 1.5, 8), emissiveMat(color));
            tank.position.set(0, 2.5, -0.8); group.add(tank);
            break;

        case "Ronin":
            group.add(createPart(new THREE.CapsuleGeometry(0.7, 2.2, 4, 10), mat, [0, 2.5, 0])); // Torso
            group.add(createPart(new THREE.SphereGeometry(0.6), mat, [0, 4.2, 0])); // Head
            group.add(createPart(new THREE.CapsuleGeometry(0.15, 1.5, 4, 8), mat, [-0.9, 2.5, 0], [0, 0, 0.4])); // L Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.15, 1.5, 4, 8), mat, [0.9, 2.5, 0], [0, 0, -0.4])); // R Arm
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [-0.3, 0.9, 0])); // L Leg
            group.add(createPart(new THREE.CapsuleGeometry(0.2, 1.2, 4, 8), mat, [0.3, 0.9, 0])); // R Leg
            const katana = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 3.5), emissiveMat(0xffffff));
            katana.position.set(1.0, 2.5, 0.5); katana.rotation.z = -Math.PI / 4; group.add(katana);
            break;

        default: // Fallback
            group.add(createPart(new THREE.CapsuleGeometry(1, 2, 4, 16), mat, [0, 2, 0]));
            group.add(createPart(new THREE.IcosahedronGeometry(.7, 0), mat, [0, 3.8, 0]));
            break;
    }

    // Add a base under all models
    const baseMat = new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.3 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.1, 16), baseMat);
    base.position.y = 0.05;
    if (inGame) group.add(base);

    return group;
}