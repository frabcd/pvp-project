/*
 * scene.js
 * Initializes and manages the Three.js scene, camera, renderer,
 * post-processing, controls, and static arena objects.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Core Three.js Setup ---
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.shadowMap.enabled = true;
document.body.insertBefore(renderer.domElement, document.body.firstChild);

export const clock = new THREE.Clock();
export const arenaSize = 45; // <-- THIS IS THE LINE THAT FIXES YOUR BUG

// --- Camera Controls ---
export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 15;
controls.maxDistance = 60;
controls.maxPolarAngle = Math.PI / 2 - 0.1;
controls.enabled = true; // Enabled for menu
controls.autoRotate = true; // Enabled for menu
controls.autoRotateSpeed = 0.5;
controls.target.set(0, 2, 0);

// --- Post-processing (Bloom) ---
const renderScene = new RenderPass(scene, camera);
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.5, 0.85);
export const composer = new EffectComposer(renderer);
composer.addPass(renderScene);
composer.addPass(bloomPass);

// --- Lighting ---
scene.add(new THREE.AmbientLight(0xffffff, 0.3));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.5);
dirLight.position.set(-15, 20, 10);
dirLight.castShadow = true;
dirLight.shadow.mapSize.width = 1024;
dirLight.shadow.mapSize.height = 1024;
dirLight.shadow.camera.near = 0.5;
dirLight.shadow.camera.far = 50;
scene.add(dirLight);

// --- Arena Elements ---
const gridHelper = new THREE.GridHelper(arenaSize, arenaSize, 0x00ffff, 0x333333);
gridHelper.position.y = 0.01;
scene.add(gridHelper);

const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(arenaSize, arenaSize),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 })
);
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

export const obstacles = [];
const pylonGeo = new THREE.CylinderGeometry(1, 1, 6, 8);
const pylonMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.3 });
[
    new THREE.Vector3(10, 3, 10),
    new THREE.Vector3(-10, 3, -10),
    new THREE.Vector3(10, 3, -10),
    new THREE.Vector3(-10, 3, 10),
    new THREE.Vector3(0, 3, 0)
].forEach(pos => {
    const pylon = new THREE.Mesh(pylonGeo, pylonMat);
    pylon.position.copy(pos);
    pylon.castShadow = true;
    pylon.receiveShadow = true;
    scene.add(pylon);
    const box = new THREE.Box3().setFromObject(pylon);
    box.isPylon = true;
    obstacles.push(box);
});

// --- Textures ---
export const particleTexture = new THREE.TextureLoader().load('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAABGklEQVRYR+2VwQ2DMAxFr9sN2IAt2A3YgG3YDbpBG7QbsAGb4A17Q1JISklK/4mH/2mSb49fEuA/AhzwCMiAHfC8vYICuAI2Z4bCzcCFBoDd0hMgoA+gUWgZAFVoeQLoFGp+Bugu1LwAej9UfA96PxQ8D/pAFDwP+kAUfA/6QBT8DhpAFHwO2kAUfAqaQBR8CphAFHwJmkAUfAqaQBR8CphAFHwJmkAUfAqaQBR8CphAFHwJmkAUfApqgSi4FNQAqfAqqAFT4FVQAzV4FXwCarwKvgaqwCvwHFSBK/AgqgZX4EVQDC/AiqAaW4CVQDazAS6AaWIFbYBZYgVtgFVgBL/AGrAALeAO2YAH+AF9jAUkP/AnrAAAAAElFTkSuQmCC');

// --- Resize Handler ---
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, innerHeight);
  composer.setSize(window.innerWidth, innerHeight);
});