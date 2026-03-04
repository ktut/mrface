import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { useApp } from '../context/AppContext';
import { buildWaterparkCharacter } from '../character/WaterparkCharacter';
import { applyHelmetHue } from '../character/helmetHue';
import { CONFIG } from '../config';
import { WATERPARK_CONFIG } from '../waterpark/types';
import { formatRaceTime, getCountdownLightStates } from '../race/ui';
import { addSlideMeshes, createWaterMesh, TUBE_START_POSITION, TUBE_START_ROTATION } from '../waterpark/slide';
import { WaterParticleSystem } from '../waterpark/WaterParticles';

interface WaterparkGameScreenProps {
  onExitToMenu: () => void;
}

const WP = CONFIG.WATERPARK;
const SLIDE_SPEED = 42;
const BOB_AMPLITUDE = 0.12;
const BOB_FREQ = 4;
const SLIDE_CENTER_Z = (WP.START_LINE_Z + WP.FINISH_LINE_Z) / 2;
const TROUGH_RADIUS = WP.SLIDE_HALF_WIDTH;

export function WaterparkGameScreen({ onExitToMenu }: WaterparkGameScreenProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { selectedCharacter, helmetHue } = useApp();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<'intro' | 'countdown' | 'sliding' | 'finished'>('intro');
  const [displayTime, setDisplayTime] = useState(0);
  const [finishedTime, setFinishedTime] = useState<number | null>(null);
  const [introProgress, setIntroProgress] = useState(0);
  const [goVisible, setGoVisible] = useState(false);
  const [paused, setPaused] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const finishedAtRef = useRef<number | null>(null);
  const introStartTimeRef = useRef<number | null>(null);
  const slideProgressRef = useRef(0);
  const waterTimeRef = useRef(0);
  const lastDisplayTimeUpdateRef = useRef(0);
  const lastIntroProgressUpdateRef = useRef(0);
  const gameRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    tubeGroup: THREE.Group;
    waterMesh: THREE.Mesh;
    waterBasePositions: Float32Array;
    particles: WaterParticleSystem;
    animationId: number;
  } | null>(null);

  // Camera orbit: same logic as kart game — spherical around tube, mouse drag to orbit, reset when not dragging.
  const CAM_DISTANCE = 6;
  const CAM_HEIGHT = 4;
  const CAM_RADIUS = Math.hypot(CAM_DISTANCE, CAM_HEIGHT);
  const defaultPitch = Math.atan2(CAM_HEIGHT, CAM_DISTANCE);
  const cameraOrbitRef = useRef({ yaw: 0, pitch: defaultPitch });
  const PITCH_MIN = -0.4;
  const PITCH_MAX = Math.PI / 2 - 0.15;
  const pointerRef = useRef<{ isDown: boolean; startX: number; startY: number; startYaw: number; startPitch: number }>({
    isDown: false,
    startX: 0,
    startY: 0,
    startYaw: 0,
    startPitch: 0,
  });
  const CAM_FOLLOW_SPEED = 2.5;

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !selectedCharacter?.headGroup) {
      setError('No character selected');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(WP.BACKGROUND_COLOR);

        const camera = new THREE.PerspectiveCamera(
          CONFIG.SCENE.CAMERA.FOV,
          container.clientWidth / container.clientHeight,
          CONFIG.SCENE.CAMERA.NEAR,
          CONFIG.SCENE.CAMERA.FAR,
        );
        camera.position.set(
          0,
          TUBE_START_POSITION.y + CAM_HEIGHT,
          TUBE_START_POSITION.z - CAM_DISTANCE,
        );

        const lights = WP.LIGHTS;
        scene.add(new THREE.AmbientLight(lights.AMBIENT.COLOR, lights.AMBIENT.INTENSITY));
        const sun = new THREE.DirectionalLight(lights.SUN.COLOR, lights.SUN.INTENSITY);
        sun.position.set(...lights.SUN.POSITION);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 250;
        sun.shadow.camera.left = -30;
        sun.shadow.camera.right = 30;
        sun.shadow.camera.bottom = -30;
        sun.shadow.camera.top = 120;
        sun.shadow.camera.updateProjectionMatrix();
        scene.add(sun);
        const fillLight = new THREE.DirectionalLight(lights.FILL.COLOR, lights.FILL.INTENSITY);
        fillLight.position.set(...lights.FILL.POSITION);
        scene.add(fillLight);

        addSlideMeshes(scene);

        const { mesh: waterMesh, basePositions } = createWaterMesh();
        scene.add(waterMesh);

        const tubeGroup = new THREE.Group();
        tubeGroup.position.set(TUBE_START_POSITION.x, TUBE_START_POSITION.y, TUBE_START_POSITION.z);
        // When re-instantiating on mode switch, tube rotation must match current head rotation so they stay aligned.
        tubeGroup.quaternion.set(TUBE_START_ROTATION.x, TUBE_START_ROTATION.y, TUBE_START_ROTATION.z, TUBE_START_ROTATION.w);
        scene.add(tubeGroup);

        const character = await buildWaterparkCharacter(selectedCharacter.headGroup, { usePrimitiveBody: true });
        const driverHead = character.getObjectByName('driverHead');
        if (driverHead) applyHelmetHue(driverHead, helmetHue);
        tubeGroup.add(character);

        const particles = new WaterParticleSystem(scene);

        gameRef.current = {
          renderer,
          scene,
          camera,
          tubeGroup,
          waterMesh,
          waterBasePositions: basePositions,
          particles,
          animationId: 0,
        };
        if (!cancelled) setReady(true);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load game');
      }
    })();

    return () => {
      cancelled = true;
      const g = gameRef.current;
      if (g) {
        g.particles.dispose();
        g.renderer.dispose();
        if (g.renderer.domElement.parentNode) g.renderer.domElement.parentNode.removeChild(g.renderer.domElement);
        gameRef.current = null;
      }
    };
  }, [selectedCharacter?.headGroup]);

  useEffect(() => {
    if (!ready || !gameRef.current) return;

    const g = gameRef.current;
    let lastTime = performance.now() / 1000;
    const startZ = WP.START_LINE_Z + 2;
    const endZ = WP.FINISH_LINE_Z;
    const totalDist = endZ - startZ;

    const loop = () => {
      g.animationId = requestAnimationFrame(loop);
      const now = performance.now() / 1000;
      const dt = Math.min(now - lastTime, 0.1);
      lastTime = now;

      if (paused) {
        g.renderer.render(g.scene, g.camera);
        return;
      }

      if (phase === 'intro') {
        if (introStartTimeRef.current == null) introStartTimeRef.current = now;
        const elapsed = now - introStartTimeRef.current;
        const progress = Math.min(1, elapsed / WATERPARK_CONFIG.INTRO_DURATION);
        if (now - lastIntroProgressUpdateRef.current >= 0.1) {
          setIntroProgress(progress);
          lastIntroProgressUpdateRef.current = now;
        }
        const orbitRadius = 10;
        const angle = Math.PI / 2 - progress * Math.PI * 0.85;
        g.camera.position.set(
          orbitRadius * Math.cos(angle),
          5,
          TUBE_START_POSITION.z + orbitRadius * Math.sin(angle),
        );
        g.camera.lookAt(0, 1.5, TUBE_START_POSITION.z + 8);
        if (progress >= 1) {
          setPhase('sliding');
          startTimeRef.current = now;
          setGoVisible(true);
          window.setTimeout(() => setGoVisible(false), 600);
        }
        g.particles.setSourcePosition(0, TUBE_START_POSITION.y, TUBE_START_POSITION.z);
        g.particles.update(dt);
        g.renderer.render(g.scene, g.camera);
        return;
      }

      if (phase === 'sliding') {
        const elapsed = now - (startTimeRef.current ?? now);
        if (now - lastDisplayTimeUpdateRef.current >= 0.1) {
          setDisplayTime(elapsed);
          lastDisplayTimeUpdateRef.current = now;
        }
        slideProgressRef.current = Math.min(1, (SLIDE_SPEED * elapsed) / totalDist);
        const z = startZ + slideProgressRef.current * totalDist;
        const bob = BOB_AMPLITUDE * Math.sin(elapsed * BOB_FREQ) + BOB_AMPLITUDE * 0.5 * Math.sin(elapsed * 2.3);
        g.tubeGroup.position.set(0.15 * Math.sin(elapsed * 1.2), TUBE_START_POSITION.y + bob, z);
        g.tubeGroup.rotation.x = Math.sin(elapsed * 2) * 0.03;
        g.tubeGroup.rotation.z = Math.sin(elapsed * 1.5) * 0.02;
        g.particles.setSourcePosition(g.tubeGroup.position.x, g.tubeGroup.position.y, g.tubeGroup.position.z);
        g.particles.update(dt);

        if (z >= endZ) {
          setPhase('finished');
          setFinishedTime(elapsed);
          setDisplayTime(elapsed);
          finishedAtRef.current = now;
        }
      }

      if (phase === 'finished') {
        if (finishedAtRef.current != null && now - finishedAtRef.current >= WATERPARK_CONFIG.FINISHED_VIEW_TIME) {
          onExitToMenu();
          return;
        }
        g.particles.setSourcePosition(g.tubeGroup.position.x, g.tubeGroup.position.y, g.tubeGroup.position.z);
        g.particles.update(dt);
      }

      // Animate water vertices for choppy waves that react around the tube.
      waterTimeRef.current += dt;
      const t = waterTimeRef.current;
      const waterGeo = g.waterMesh.geometry as THREE.BufferGeometry;
      const posAttr = waterGeo.getAttribute('position') as THREE.BufferAttribute;
      const posArray = posAttr.array as Float32Array;
      const base = g.waterBasePositions;
      const tubePos = g.tubeGroup.position;

      // Half-cylinder water: rotation.x = -PI/2 so local Z → world Y. Displace local Z for vertical waves.
      for (let i = 0; i < base.length; i += 3) {
        const x = base[i];
        const y0 = base[i + 1];
        const z0 = base[i + 2];
        const tubeLocalY = SLIDE_CENTER_Z - tubePos.z;
        const tubeLocalZ = tubePos.y - TROUGH_RADIUS;
        const dx = x - tubePos.x;
        const dy = y0 - tubeLocalY;
        const dz = z0 - tubeLocalZ;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const nearFactor = Math.exp(-dist * 0.4);
        const halfWidth = WP.SLIDE_HALF_WIDTH || 1;
        const nx = x / halfWidth;
        const channelShape = -0.35 * (1 - Math.min(1, nx * nx));
        const baseWave =
          Math.sin(y0 * 0.55 - t * 3.2 + x * 0.7) * 0.28 +
          Math.sin(x * 1.0 + t * 4.5) * 0.15;
        const splashWave =
          Math.sin((y0 + x) * 2.2 - t * 6.0) * 0.5 * nearFactor;
        const displacement = channelShape + baseWave + splashWave;
        posArray[i] = x;
        posArray[i + 1] = y0;
        posArray[i + 2] = z0 + displacement;
      }
      posAttr.needsUpdate = true;
      waterGeo.computeVertexNormals();

      // Orbit camera (same as kart): spherical around tube, mouse drag to orbit, reset when not dragging.
      if (phase === 'sliding' || phase === 'finished') {
        const t = g.tubeGroup.position;
        const orbit = cameraOrbitRef.current;
        const pointerDown = pointerRef.current.isDown;
        if (!pointerDown) {
          const targetYaw = 0; // behind tube (tube moves along +Z)
          let diff = targetYaw - orbit.yaw;
          while (diff > Math.PI) diff -= 2 * Math.PI;
          while (diff < -Math.PI) diff += 2 * Math.PI;
          orbit.yaw += diff * Math.min(1, CAM_FOLLOW_SPEED * dt);
          orbit.pitch += (defaultPitch - orbit.pitch) * Math.min(1, CAM_FOLLOW_SPEED * dt);
        }
        const { yaw, pitch } = orbit;
        const cosP = Math.cos(pitch);
        const targetPos = new THREE.Vector3(
          t.x + CAM_RADIUS * cosP * Math.sin(yaw),
          t.y + CAM_RADIUS * Math.sin(pitch),
          t.z - CAM_RADIUS * cosP * Math.cos(yaw),
        );
        g.camera.position.lerp(targetPos, 0.05);
        g.camera.lookAt(t.x, t.y + 1, t.z);
      }

      g.renderer.render(g.scene, g.camera);
    };

    loop();
    return () => cancelAnimationFrame(g.animationId);
  }, [ready, phase, paused, onExitToMenu]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !gameRef.current) return;
    const onResize = () => {
      const g = gameRef.current;
      if (!g) return;
      g.camera.aspect = container.clientWidth / container.clientHeight;
      g.camera.updateProjectionMatrix();
      g.renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [ready]);

  // Swipe / drag on canvas to orbit the camera (same as kart game).
  const ORBIT_SENSITIVITY = 0.004;
  useEffect(() => {
    const g = gameRef.current;
    if (!ready || !g) return;
    const canvas = g.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      pointerRef.current.isDown = true;
      pointerRef.current.startX = e.clientX;
      pointerRef.current.startY = e.clientY;
      pointerRef.current.startYaw = cameraOrbitRef.current.yaw;
      pointerRef.current.startPitch = cameraOrbitRef.current.pitch;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointerRef.current.isDown) return;
      e.preventDefault();
      const dx = e.clientX - pointerRef.current.startX;
      const dy = e.clientY - pointerRef.current.startY;
      const orbit = cameraOrbitRef.current;
      orbit.yaw = pointerRef.current.startYaw - dx * ORBIT_SENSITIVITY;
      orbit.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, pointerRef.current.startPitch + dy * ORBIT_SENSITIVITY));
    };

    const onPointerUp = () => {
      pointerRef.current.isDown = false;
    };

    const onPointerLeave = () => {
      pointerRef.current.isDown = false;
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove, { passive: false });
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('pointercancel', onPointerUp);
    window.addEventListener('pointerup', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('pointercancel', onPointerUp);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [ready]);

  const handleExit = useCallback(() => {
    onExitToMenu();
  }, [onExitToMenu]);

  if (error) {
    return (
      <div className="waterpark-game-screen waterpark-game-screen--error">
        <p>{error}</p>
        <button type="button" onClick={onExitToMenu}>Back to menu</button>
      </div>
    );
  }

  const showCountdown = ready && phase === 'intro';
  const showTimer = ready && phase === 'sliding';
  const showFinishedTime = phase === 'finished' && finishedTime != null;

  const lights = getCountdownLightStates(introProgress);

  return (
    <div className="waterpark-game-screen">
      <div ref={containerRef} className="waterpark-game-canvas" />
      {!ready && <div className="waterpark-game-loading">Loading…</div>}
      {showCountdown && (
        <div className="waterpark-game-countdown" aria-live="polite">
          <div className="waterpark-game-countdown-lights">
            <span className={`waterpark-game-light waterpark-game-light--red ${lights.red1 ? 'waterpark-game-light--on' : ''}`} />
            <span className={`waterpark-game-light waterpark-game-light--red ${lights.red2 ? 'waterpark-game-light--on' : ''}`} />
            <span className={`waterpark-game-light waterpark-game-light--red ${lights.red3 ? 'waterpark-game-light--on' : ''}`} />
            <span className={`waterpark-game-light waterpark-game-light--green ${lights.green ? 'waterpark-game-light--on' : ''}`} />
          </div>
        </div>
      )}
      {goVisible && (
        <div className="waterpark-game-go-overlay" aria-live="polite">
          <span className="waterpark-game-go-text">GO</span>
        </div>
      )}
      {showTimer && !showFinishedTime && (
        <div className="waterpark-game-hud">
          <div className="waterpark-game-timer" aria-live="polite">
            {formatRaceTime(displayTime)}
          </div>
          <div className="waterpark-game-hint" aria-hidden>
            Slide to the finish!
          </div>
        </div>
      )}
      {showFinishedTime && (
        <div className="waterpark-game-finished-overlay" aria-live="polite">
          <div className="waterpark-game-finished-time">Time: {formatRaceTime(finishedTime)}</div>
        </div>
      )}
      {ready && phase !== 'intro' && (
        <button
          type="button"
          className="cart-game-pause-btn"
          aria-label="Pause"
          onClick={() => setPaused(true)}
        >
          II
        </button>
      )}
      {paused && (
        <div className="cart-game-pause-overlay" role="dialog" aria-label="Paused">
          <div className="cart-game-pause-menu">
            <h2>Paused</h2>
            <button
              type="button"
              className="cart-game-menu-btn cart-game-menu-btn--primary"
              onClick={() => setPaused(false)}
            >
              Resume
            </button>
            <button type="button" className="cart-game-menu-btn" onClick={handleExit}>
              Exit to main menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
