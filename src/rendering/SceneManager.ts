import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * SceneManager owns the Three.js renderer, camera, lights, and scene graph.
 * It exposes a single public method — setCharacterHead — for the pipeline to
 * drop a finished face mesh into the scene.
 */
export class SceneManager {
  private renderer:   THREE.WebGLRenderer;
  private scene:      THREE.Scene;
  private camera:     THREE.PerspectiveCamera;
  private controls:   OrbitControls;
  private currentHead: THREE.Object3D | null = null;

  constructor(container: HTMLElement) {
    // ── Renderer ──────────────────────────────────────────────────────────────
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping       = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    container.appendChild(this.renderer.domElement);

    // ── Scene ─────────────────────────────────────────────────────────────────
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0f);

    // ── Camera ────────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      45,
      window.innerWidth / window.innerHeight,
      0.01,
      100
    );
    this.camera.position.set(0, 0, 2.5);

    // ── Controls ──────────────────────────────────────────────────────────────
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping  = true;
    this.controls.dampingFactor  = 0.05;
    this.controls.minDistance    = 1;
    this.controls.maxDistance    = 6;
    this.controls.target.set(0, 0, 0);

    // ── Lights ────────────────────────────────────────────────────────────────
    this.setupLights();

    // ── Placeholder ───────────────────────────────────────────────────────────
    this.addPlaceholder();

    // ── Resize handler ────────────────────────────────────────────────────────
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // ── Render loop ───────────────────────────────────────────────────────────
    this.animate();
  }

  // ── Lights ──────────────────────────────────────────────────────────────────

  private setupLights() {
    // Ambient — soft base fill
    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);

    // Key light — warm, from upper-right-front
    const key = new THREE.DirectionalLight(0xfff5e0, 1.8);
    key.position.set(1, 2, 2);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    this.scene.add(key);

    // Fill light — cool, from left
    const fill = new THREE.DirectionalLight(0xc0d8ff, 0.6);
    fill.position.set(-2, 0, 1);
    this.scene.add(fill);

    // Rim light — from below-behind to separate from background
    const rim = new THREE.DirectionalLight(0xffffff, 0.4);
    rim.position.set(0, -1, -2);
    this.scene.add(rim);
  }

  // ── Placeholder sphere ──────────────────────────────────────────────────────

  private addPlaceholder() {
    const geo = new THREE.SphereGeometry(0.6, 32, 32);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x334455,
      roughness: 0.8,
      metalness: 0.1,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.name = 'placeholder';
    this.scene.add(sphere);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Replace the placeholder / previous head with a freshly built face group.
   * Accepts any Object3D (typically the THREE.Group from FaceMeshBuilder.build()).
   */
  setCharacterHead(head: THREE.Object3D) {
    // Remove existing objects
    const existing    = this.scene.getObjectByName('characterHead');
    const placeholder = this.scene.getObjectByName('placeholder');
    if (existing)    this.scene.remove(existing);
    if (placeholder) this.scene.remove(placeholder);

    head.name = 'characterHead';
    this.scene.add(head);

    this.currentHead = head;
    this.controls.target.set(0, 0, 0);
  }

  // ── Render loop ─────────────────────────────────────────────────────────────

  private animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();

    // Idle rotation on the character head
    if (this.currentHead) {
      this.currentHead.rotation.y += 0.002;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
