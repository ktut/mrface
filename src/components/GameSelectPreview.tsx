import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { useApp } from '../context/AppContext';
import { buildKartCharacter } from '../character/KartCharacter';
import { CONFIG } from '../config';

const [dpx, dpy, dpz] = CONFIG.KART.DRIVER.POSITION;
const [drx, dry, drz] = CONFIG.KART.DRIVER.ROTATION;
const [hpx, hpy, hpz] = CONFIG.KART.DRIVER.HEAD.POSITION;
const [hrx, hry, hrz] = CONFIG.KART.DRIVER.HEAD.ROTATION;

type Vec3 = [number, number, number];

/**
 * Renders the same kart + character + body setup used in the actual game,
 * so we can debug orientation and appearance on the game select screen.
 */
export function GameSelectPreview() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { selectedCharacter } = useApp();
  const kartGroupRef = useRef<THREE.Group | null>(null);
  const sceneRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    controls: OrbitControls;
    animationId: number;
  } | null>(null);

  const [driverPos, setDriverPos] = useState<Vec3>([dpx, dpy, dpz]);
  const [driverRot, setDriverRot] = useState<Vec3>([drx, dry, drz]);
  const [headPos, setHeadPos] = useState<Vec3>([hpx, hpy, hpz]);
  const [headRot, setHeadRot] = useState<Vec3>([hrx, hry, hrz]);

  const debugRef = useRef({ driverPos, driverRot, headPos, headRot });
  debugRef.current = { driverPos, driverRot, headPos, headRot };

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !selectedCharacter?.headGroup) return;

    let cancelled = false;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(CONFIG.SCENE.BACKGROUND);

    const camera = new THREE.PerspectiveCamera(
      CONFIG.SCENE.CAMERA.FOV,
      container.clientWidth / container.clientHeight,
      CONFIG.SCENE.CAMERA.NEAR,
      CONFIG.SCENE.CAMERA.FAR,
    );
    camera.position.set(1.8, 1.2, 2.2);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.minPolarAngle = Math.PI / 2;
    controls.maxPolarAngle = Math.PI / 2;
    controls.enableDamping = true;
    controls.dampingFactor = CONFIG.SCENE.CONTROLS.DAMPING_FACTOR;
    controls.minDistance = 1;
    controls.maxDistance = 6;
    controls.target.set(0, 0.5, 0);

    const ambient = new THREE.AmbientLight(
      CONFIG.SCENE.LIGHTS.AMBIENT.COLOR,
      CONFIG.SCENE.LIGHTS.AMBIENT.INTENSITY,
    );
    scene.add(ambient);
    const key = new THREE.DirectionalLight(
      CONFIG.SCENE.LIGHTS.KEY.COLOR,
      CONFIG.SCENE.LIGHTS.KEY.INTENSITY,
    );
    key.position.set(...CONFIG.SCENE.LIGHTS.KEY.POSITION);
    key.castShadow = true;
    key.shadow.mapSize.set(CONFIG.SCENE.LIGHTS.SHADOW_MAP_SIZE, CONFIG.SCENE.LIGHTS.SHADOW_MAP_SIZE);
    scene.add(key);
    const fill = new THREE.DirectionalLight(
      CONFIG.SCENE.LIGHTS.FILL.COLOR,
      CONFIG.SCENE.LIGHTS.FILL.INTENSITY,
    );
    fill.position.set(...CONFIG.SCENE.LIGHTS.FILL.POSITION);
    scene.add(fill);
    const rim = new THREE.DirectionalLight(
      CONFIG.SCENE.LIGHTS.RIM.COLOR,
      CONFIG.SCENE.LIGHTS.RIM.INTENSITY,
    );
    rim.position.set(...CONFIG.SCENE.LIGHTS.RIM.POSITION);
    scene.add(rim);

    const size = CONFIG.SCENE.ENV_MAP_SIZE;
    const data = new Uint8Array(size * (size / 2) * 4);
    const h = size / 2;
    for (let y = 0; y < h; y++) {
      const t = y / (h - 1);
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
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromEquirectangular(tex).texture;
    pmrem.dispose();
    tex.dispose();

    buildKartCharacter(selectedCharacter.headGroup)
      .then((kartGroup) => {
        if (cancelled) return;
        kartGroupRef.current = kartGroup;
        scene.add(kartGroup);
        const driverBody = kartGroup.getObjectByName('driverBody');
        const driverHead = kartGroup.getObjectByName('driverHead');
        if (driverBody) {
          setDriverPos([driverBody.position.x, driverBody.position.y, driverBody.position.z]);
          setDriverRot([driverBody.rotation.x, driverBody.rotation.y, driverBody.rotation.z]);
        }
        if (driverHead) {
          setHeadPos([driverHead.position.x, driverHead.position.y, driverHead.position.z]);
          setHeadRot([driverHead.rotation.x, driverHead.rotation.y, driverHead.rotation.z]);
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('[GameSelectPreview] buildKartCharacter', err);
      });

    const onResize = () => {
      if (!container) return;
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);

    let animationId = 0;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      const kg = kartGroupRef.current;
      const d = debugRef.current;
      if (kg) {
        const driverBody = kg.getObjectByName('driverBody');
        const driverHead = kg.getObjectByName('driverHead');
        if (driverBody) {
          driverBody.position.set(d.driverPos[0], d.driverPos[1], d.driverPos[2]);
          driverBody.rotation.set(d.driverRot[0], d.driverRot[1], d.driverRot[2]);
        }
        if (driverHead) {
          driverHead.position.set(d.headPos[0], d.headPos[1], d.headPos[2]);
          driverHead.rotation.set(d.headRot[0], d.headRot[1], d.headRot[2]);
        }
      }
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    sceneRef.current = { renderer, scene, camera, controls, animationId };

    return () => {
      cancelled = true;
      kartGroupRef.current = null;
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(animationId);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      sceneRef.current = null;
    };
  }, [selectedCharacter?.headGroup]);

  const updateDriverPos = (i: 0 | 1 | 2, v: number) =>
    setDriverPos((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateDriverRot = (i: 0 | 1 | 2, v: number) =>
    setDriverRot((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateHeadPos = (i: 0 | 1 | 2, v: number) =>
    setHeadPos((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);
  const updateHeadRot = (i: 0 | 1 | 2, v: number) =>
    setHeadRot((p) => [...p.slice(0, i), v, ...p.slice(i + 1)] as Vec3);

  const valueText = `DRIVER.POSITION: [${driverPos.map((n) => n.toFixed(3)).join(', ')}]
DRIVER.ROTATION: [${driverRot.map((n) => n.toFixed(4)).join(', ')}]
HEAD.POSITION: [${headPos.map((n) => n.toFixed(3)).join(', ')}]
HEAD.ROTATION: [${headRot.map((n) => n.toFixed(4)).join(', ')}]`;

  if (!selectedCharacter) return null;

  const slider = (
    label: string,
    value: number,
    onChange: (v: number) => void,
    min: number,
    max: number,
    step: number,
  ) => (
    <label key={label} className="game-select-debug-row">
      <span className="game-select-debug-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="game-select-debug-val">{value.toFixed(3)}</span>
    </label>
  );

  return (
    <div className="game-select-preview-wrap">
      <div ref={containerRef} className="canvas-container game-select-preview" />
      <div className="game-select-debug-panel">
        <h3 className="game-select-debug-title">Debug: driver & head (temporary)</h3>
        <div className="game-select-debug-section">
          <strong>Body position</strong>
          {(['x', 'y', 'z'] as const).map((axis, i) =>
            slider(axis, driverPos[i], (v) => updateDriverPos(i as 0 | 1 | 2, v), -0.5, 0.5, 0.01),
          )}
        </div>
        <div className="game-select-debug-section">
          <strong>Body rotation (rad)</strong>
          {(['x', 'y', 'z'] as const).map((axis, i) =>
            slider(axis, driverRot[i], (v) => updateDriverRot(i as 0 | 1 | 2, v), -Math.PI, Math.PI, 0.01),
          )}
        </div>
        <div className="game-select-debug-section">
          <strong>Head position</strong>
          {(['x', 'y', 'z'] as const).map((axis, i) =>
            slider(
              axis,
              headPos[i],
              (v) => updateHeadPos(i as 0 | 1 | 2, v),
              -0.5,
              axis === 'y' ? 1 : 0.5,
              0.01,
            ),
          )}
        </div>
        <div className="game-select-debug-section">
          <strong>Head rotation (rad)</strong>
          {(['x', 'y', 'z'] as const).map((axis, i) =>
            slider(axis, headRot[i], (v) => updateHeadRot(i as 0 | 1 | 2, v), -Math.PI, Math.PI, 0.01),
          )}
        </div>
        <label className="game-select-debug-output">
          <strong>Copy these values:</strong>
          <textarea readOnly rows={6} value={valueText} className="game-select-debug-textarea" />
        </label>
      </div>
    </div>
  );
}
