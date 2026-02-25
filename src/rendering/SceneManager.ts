import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CONFIG } from '../config';

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
    this.scene.background = new THREE.Color(CONFIG.SCENE.BACKGROUND);

    // Environment map for metallic materials (helmet, etc.) — without this, metalness appears black
    this.setupEnvironmentMap();

    // ── Camera ────────────────────────────────────────────────────────────────
    this.camera = new THREE.PerspectiveCamera(
      CONFIG.SCENE.CAMERA.FOV,
      window.innerWidth / window.innerHeight,
      CONFIG.SCENE.CAMERA.NEAR,
      CONFIG.SCENE.CAMERA.FAR,
    );
    this.camera.position.set(...CONFIG.SCENE.CAMERA.INITIAL_POSITION);

    // ── Controls ──────────────────────────────────────────────────────────────
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enablePan       = false;  // no panning — rotate and zoom only
    this.controls.minPolarAngle   = Math.PI / 2;  // lock to horizontal plane
    this.controls.maxPolarAngle   = Math.PI / 2;  // no tilt — rotate only around vertical axis
    this.controls.enableDamping   = true;
    this.controls.dampingFactor   = CONFIG.SCENE.CONTROLS.DAMPING_FACTOR;
    this.controls.minDistance     = CONFIG.SCENE.CONTROLS.MIN_DISTANCE;
    this.controls.maxDistance     = CONFIG.SCENE.CONTROLS.MAX_DISTANCE;
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
    const ambient = new THREE.AmbientLight(
      CONFIG.SCENE.LIGHTS.AMBIENT.COLOR,
      CONFIG.SCENE.LIGHTS.AMBIENT.INTENSITY,
    );
    this.scene.add(ambient);

    const key = new THREE.DirectionalLight(
      CONFIG.SCENE.LIGHTS.KEY.COLOR,
      CONFIG.SCENE.LIGHTS.KEY.INTENSITY,
    );
    key.position.set(...CONFIG.SCENE.LIGHTS.KEY.POSITION);
    key.castShadow = true;
    key.shadow.mapSize.set(CONFIG.SCENE.LIGHTS.SHADOW_MAP_SIZE, CONFIG.SCENE.LIGHTS.SHADOW_MAP_SIZE);
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(
      CONFIG.SCENE.LIGHTS.FILL.COLOR,
      CONFIG.SCENE.LIGHTS.FILL.INTENSITY,
    );
    fill.position.set(...CONFIG.SCENE.LIGHTS.FILL.POSITION);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(
      CONFIG.SCENE.LIGHTS.RIM.COLOR,
      CONFIG.SCENE.LIGHTS.RIM.INTENSITY,
    );
    rim.position.set(...CONFIG.SCENE.LIGHTS.RIM.POSITION);
    this.scene.add(rim);
  }

  // ── Environment map (for metallic materials) ───────────────────────────────────

  private setupEnvironmentMap() {
    // Equirectangular env map with vertical gradient for contrast: bright top, darker bottom.
    // Metallic surfaces reflect this — top of helmet gets highlights, sides stay darker.
    const size = CONFIG.SCENE.ENV_MAP_SIZE;
    const data = new Uint8Array(size * (size / 2) * 4);
    const h = size / 2;
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1); // 0 = top, 1 = bottom
      const r = Math.round(0xe0 * (1 - t) + 0x60 * t);
      const g = Math.round(0xe0 * (1 - t) + 0x60 * t);
      const b = Math.round(0xe8 * (1 - t) + 0x68 * t);
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4;
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size / 2);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();
  }

  // ── Placeholder sphere ──────────────────────────────────────────────────────

  private addPlaceholder() {
    const p = CONFIG.SCENE.PLACEHOLDER;
    const geo = new THREE.SphereGeometry(p.RADIUS, p.SEGMENTS, p.SEGMENTS);
    const mat = new THREE.MeshStandardMaterial({
      color: p.COLOR,
      roughness: p.ROUGHNESS,
      metalness: p.METALNESS,
      wireframe: true,
      transparent: true,
      opacity: p.OPACITY,
    });
    const sphere = new THREE.Mesh(geo, mat);
    sphere.name = 'placeholder';
    this.scene.add(sphere);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /**
   * Return the current character head group, or null if none.
   */
  getCharacterHead(): THREE.Object3D | null {
    return this.currentHead;
  }

  /**
   * Replace the placeholder / previous head with a freshly built face group.
   * Pass null to clear the character and restore the placeholder.
   */
  setCharacterHead(head: THREE.Object3D | null) {
    const existing    = this.scene.getObjectByName('characterHead');
    const placeholder = this.scene.getObjectByName('placeholder');
    if (existing) this.scene.remove(existing);
    if (placeholder) this.scene.remove(placeholder);

    if (head) {
      if (existing) head.rotation.copy(existing.rotation);
      head.name = 'characterHead';
      this.scene.add(head);
      this.currentHead = head;
    } else {
      this.currentHead = null;
      this.addPlaceholder();
    }
    this.controls.target.set(0, 0, 0);
  }

  // ── Render loop ─────────────────────────────────────────────────────────────

  private animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();

    // Idle rotation on the character head
    if (this.currentHead) {
      this.currentHead.rotation.y += CONFIG.SCENE.IDLE_ROTATION_SPEED;
    }

    this.renderer.render(this.scene, this.camera);
  }
}
