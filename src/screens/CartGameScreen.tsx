import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { useApp } from '../context/AppContext';
import { VehicleController } from '../physics/VehicleController';
import { InputManager } from '../engine/InputManager';
import { buildKartCharacter } from '../character/KartCharacter';
import { CONFIG } from '../config';
import { RACE_CONFIG } from '../race/types';
import { createInitialRaceState } from '../race/state';
import { addTrackColliders, addTrackMeshes, KART_START_POSITION, KART_START_ROTATION } from '../race/track';

/** Offset so kart visual (nose along +X in chassis space) faces +Z (away from camera). Applied after chassis sync. */
const KART_FORWARD_OFFSET_QUAT = new THREE.Quaternion().setFromAxisAngle(
  new THREE.Vector3(0, 1, 0),
  -Math.PI / 2,
);

/** Creates a subtle repeating grid texture for the kart ground (green base + darker grid lines). */
function createGroundGridTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  // Base fill: green ground
  ctx.fillStyle = '#2d5a3d';
  ctx.fillRect(0, 0, size, size);
  // Subtle grid: slightly darker green, thin lines
  const gridSpacing = 32;
  const lineColor = 'rgba(0, 0, 0, 0.14)';
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= size; i += gridSpacing) {
    ctx.moveTo(i, 0);
    ctx.lineTo(i, size);
    ctx.moveTo(0, i);
    ctx.lineTo(size, i);
  }
  ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(10, 10); // 100x100 plane → 10 units per tile, subtle grid scale
  texture.needsUpdate = true;
  return texture;
}

interface CartGameScreenProps {
  onExitToMenu: () => void;
}

const LOCAL_PLAYER_ID = 'local';

export function CartGameScreen({ onExitToMenu }: CartGameScreenProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { selectedCharacter } = useApp();
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mobileInputRef = useRef({ steer: 0, throttle: 0, brake: 0 });

  // Race state (multiplayer-ready: phase, timer; UI reads from these)
  const [racePhase, setRacePhase] = useState<'intro' | 'countdown' | 'racing' | 'finished'>('intro');
  const [displayTime, setDisplayTime] = useState(0);
  const [finishedTime, setFinishedTime] = useState<number | null>(null);
  const [introProgress, setIntroProgress] = useState(0);
  const [goVisible, setGoVisible] = useState(false);
  const raceStateRef = useRef(createInitialRaceState(LOCAL_PLAYER_ID));
  const introStartTimeRef = useRef<number | null>(null);
  const finishedAtRef = useRef<number | null>(null);
  const introOrbitCenterRef = useRef(new THREE.Vector3());
  const introOrbitRadiusHRef = useRef(0);
  const introLookAtStartRef = useRef(new THREE.Vector3());
  const introLookAtEndRef = useRef(new THREE.Vector3());
  const _introLookAtRef = useRef(new THREE.Vector3());
  const _introPosRef = useRef(new THREE.Vector3());

  // Camera orbit: spherical around kart. yaw = horizontal, pitch = elevation (0 = horizontal).
  const CAM_DISTANCE = 6;
  const CAM_HEIGHT = 4;
  const CAM_RADIUS = Math.hypot(CAM_DISTANCE, CAM_HEIGHT);
  const defaultPitch = Math.atan2(CAM_HEIGHT, CAM_DISTANCE);
  // Start behind the kart: kart drives toward +Z in world, so "behind" is yaw = 0 (camera at -Z).
  const cameraOrbitRef = useRef({ yaw: 0, pitch: defaultPitch });
  const PITCH_MIN = -0.4;  // don't go below horizon too much
  const PITCH_MAX = Math.PI / 2 - 0.15;
  const pointerRef = useRef<{ isDown: boolean; startX: number; startY: number; startYaw: number; startPitch: number }>({
    isDown: false,
    startX: 0,
    startY: 0,
    startYaw: 0,
    startPitch: 0,
  });
  /** When not dragging, camera yaw smoothly follows kart facing (Mario Kart style). */
  const CAM_FOLLOW_SPEED = 2.5;
  const _chassisQuat = useRef(new THREE.Quaternion());
  const _kartForward = useRef(new THREE.Vector3(1, 0, 0));
  const gameRef = useRef<{
    renderer: THREE.WebGLRenderer;
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    vehicle: VehicleController;
    input: InputManager;
    kartGroup: THREE.Group;
    animationId: number;
  } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !selectedCharacter?.headGroup) {
      setError('No character selected');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        await RAPIER.init();
        if (cancelled) return;

        const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
        world.timestep = 1 / 60;

        const vehicle = new VehicleController(world);
        addTrackColliders(world);

        const chassis = vehicle.getChassisBody();
        chassis.setTranslation(
          { x: KART_START_POSITION.x, y: KART_START_POSITION.y, z: KART_START_POSITION.z },
          true,
        );
        chassis.setRotation(KART_START_ROTATION, true);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(container.clientWidth, container.clientHeight);
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x1a1a2e);

        const camera = new THREE.PerspectiveCamera(
          50,
          container.clientWidth / container.clientHeight,
          0.1,
          500,
        );
        camera.position.set(0, 1 + CAM_HEIGHT, -CAM_DISTANCE);

        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        scene.add(ambient);
        const key = new THREE.DirectionalLight(0xfff5e0, 1.2);
        key.position.set(50, 80, 50);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        key.shadow.camera.near = 0.5;
        key.shadow.camera.far = 200;
        const groundLength = RACE_CONFIG.TRACK_LENGTH + RACE_CONFIG.ROOM_BEFORE_START + RACE_CONFIG.ROOM_AFTER_FINISH;
        const groundCenterZ = (RACE_CONFIG.START_LINE_Z - RACE_CONFIG.ROOM_BEFORE_START + RACE_CONFIG.FINISH_LINE_Z + RACE_CONFIG.ROOM_AFTER_FINISH) / 2;
        key.shadow.camera.left = -RACE_CONFIG.TRACK_HALF_WIDTH - 10;
        key.shadow.camera.right = RACE_CONFIG.TRACK_HALF_WIDTH + 10;
        key.shadow.camera.bottom = -groundLength / 2 - 10;
        key.shadow.camera.top = groundLength / 2 + 10;
        key.shadow.camera.updateProjectionMatrix();
        scene.add(key);

        const groundW = RACE_CONFIG.TRACK_HALF_WIDTH * 2 + 8;
        const groundL = groundLength + 8;
        const groundGeo = new THREE.PlaneGeometry(groundW, groundL);
        const groundTexture = createGroundGridTexture();
        const groundMat = new THREE.MeshStandardMaterial({
          color: 0x2d5a3d,
          map: groundTexture,
          roughness: 0.9,
          metalness: 0,
        });
        const groundMesh = new THREE.Mesh(groundGeo, groundMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.position.set(0, 0, groundCenterZ);
        groundMesh.receiveShadow = true;
        scene.add(groundMesh);

        addTrackMeshes(scene);

        const kartGroup = new THREE.Group();
        scene.add(kartGroup);

        const kartCharacter = await buildKartCharacter(selectedCharacter.headGroup);
        kartGroup.add(kartCharacter);

        const input = new InputManager();
        input.start();

        gameRef.current = {
          renderer,
          scene,
          camera,
          vehicle,
          input,
          kartGroup,
          animationId: 0,
        };
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load game');
      }
    })();

    return () => {
      cancelled = true;
      const g = gameRef.current;
      if (g) {
        g.input.stop();
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

    const loop = () => {
      g.animationId = requestAnimationFrame(loop);
      const now = performance.now() / 1000;
      const dt = Math.min(now - lastTime, 0.1);
      lastTime = now;

      const chassis = g.vehicle.getChassisBody();
      const t = chassis.translation();
      const phase = raceStateRef.current.phase;

      // ----- Intro: camera orbits around character (front → side → back), stays on character then looks ahead -----
      if (phase === 'intro') {
        const orbitRadiusH = CAM_RADIUS * Math.cos(defaultPitch);
        const orbitHeight = CAM_RADIUS * Math.sin(defaultPitch);
        if (introStartTimeRef.current == null) {
          introStartTimeRef.current = now;
          g.vehicle.syncToObject3D(g.kartGroup);
          g.kartGroup.position.y -= CONFIG.KART.GROUND_OFFSET_Y;
          g.kartGroup.quaternion.multiply(KART_FORWARD_OFFSET_QUAT);
          g.kartGroup.updateMatrixWorld(true);
          const head = g.kartGroup.getObjectByName('driverHead');
          if (head) head.getWorldPosition(introLookAtStartRef.current);
          else introLookAtStartRef.current.set(t.x, t.y + 1, t.z);
          introOrbitCenterRef.current.set(t.x, t.y + orbitHeight, t.z);
          introOrbitRadiusHRef.current = orbitRadiusH;
          introLookAtEndRef.current.set(t.x, t.y + 1, t.z + 15);
        }
        const elapsed = now - (introStartTimeRef.current ?? now);
        const progress = Math.min(1, elapsed / RACE_CONFIG.INTRO_DURATION);
        setIntroProgress(progress);
        const center = introOrbitCenterRef.current;
        const r = introOrbitRadiusHRef.current;
        // Start in front of kart (angle = PI/2), orbit around to behind (angle = -PI/2). Hold in front briefly then rotate.
        const INTRO_HOLD = 1.2;
        const orbitDuration = Math.max(0, RACE_CONFIG.INTRO_DURATION - INTRO_HOLD);
        const orbitProgress = orbitDuration > 0 ? Math.min(1, (elapsed - INTRO_HOLD) / orbitDuration) : 0;
        const angle = Math.PI / 2 - orbitProgress * Math.PI;
        _introPosRef.current.set(
          center.x + r * Math.cos(angle),
          center.y,
          center.z + r * Math.sin(angle),
        );
        g.camera.position.copy(_introPosRef.current);
        // Look at character during hold; during orbit, keep at character for first half then blend to ahead.
        const lookAtProgress =
          elapsed < INTRO_HOLD ? 0 : orbitProgress <= 0.5 ? 0 : (orbitProgress - 0.5) * 2;
        _introLookAtRef.current
          .copy(introLookAtStartRef.current)
          .lerp(introLookAtEndRef.current, lookAtProgress);
        g.camera.lookAt(_introLookAtRef.current);
        if (progress >= 1) {
          raceStateRef.current.phase = 'racing';
          raceStateRef.current.startTime = now;
          setRacePhase('racing');
          setGoVisible(true);
          window.setTimeout(() => setGoVisible(false), 600);
          cameraOrbitRef.current.yaw = 0;
        }
        g.vehicle.update(dt);
        g.vehicle.getWorld().step();
        g.vehicle.syncToObject3D(g.kartGroup);
        g.kartGroup.position.y -= CONFIG.KART.GROUND_OFFSET_Y;
        g.kartGroup.quaternion.multiply(KART_FORWARD_OFFSET_QUAT);
        g.renderer.render(g.scene, g.camera);
        return;
      }

      // ----- Racing or finished: normal physics and driving -----
      const isRacing = phase === 'racing';
      const isFinished = phase === 'finished';

      if (isRacing && !paused) {
        const mi = mobileInputRef.current;
        g.input.setMobileInput(mi.steer, mi.throttle, mi.brake);
        const { throttle, brake, steer } = g.input.getInput(dt);
        if (throttle > 0 || brake > 0) chassis.wakeUp();
        g.vehicle.applyInput(throttle, brake, steer);
        raceStateRef.current.currentTime = now - (raceStateRef.current.startTime ?? now);
        setDisplayTime(raceStateRef.current.currentTime);

        if (t.z >= RACE_CONFIG.FINISH_LINE_Z) {
          raceStateRef.current.phase = 'finished';
          raceStateRef.current.endTime = now;
          raceStateRef.current.currentTime = now - (raceStateRef.current.startTime ?? now);
          setRacePhase('finished');
          setFinishedTime(raceStateRef.current.currentTime);
          setDisplayTime(raceStateRef.current.currentTime);
          finishedAtRef.current = now;
          chassis.setLinearDamping(15);
        }
      } else if (isRacing && paused) {
        g.vehicle.applyInput(0, 0, 0);
      } else if (isFinished) {
        g.vehicle.applyInput(0, 1, 0);
        if (finishedAtRef.current != null && now - finishedAtRef.current >= RACE_CONFIG.FINISHED_VIEW_TIME) {
          onExitToMenu();
          return;
        }
      }

      g.vehicle.update(dt);
      g.vehicle.getWorld().step();
      g.vehicle.syncToObject3D(g.kartGroup);
      g.kartGroup.position.y -= CONFIG.KART.GROUND_OFFSET_Y;
      g.kartGroup.quaternion.multiply(KART_FORWARD_OFFSET_QUAT);

      const orbit = cameraOrbitRef.current;
      const pointerDown = pointerRef.current.isDown;
      if (!pointerDown) {
        const r = chassis.rotation();
        _chassisQuat.current.set(r.x, r.y, r.z, r.w);
        _kartForward.current.set(0, 0, 1).applyQuaternion(_chassisQuat.current);
        const targetYaw = Math.atan2(-_kartForward.current.x, _kartForward.current.z);
        let diff = targetYaw - orbit.yaw;
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        orbit.yaw += diff * Math.min(1, CAM_FOLLOW_SPEED * dt);
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

      g.renderer.render(g.scene, g.camera);
    };

    loop();
    return () => cancelAnimationFrame(g.animationId);
  }, [ready, paused, onExitToMenu]);

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

  // Swipe / drag on canvas to orbit the camera around the kart (horizontal and vertical).
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
    setPaused(false);
    onExitToMenu();
  }, [onExitToMenu]);

  if (error) {
    return (
      <div className="cart-game-screen cart-game-screen--error">
        <p>{error}</p>
        <button type="button" onClick={onExitToMenu}>Back to menu</button>
      </div>
    );
  }

  const showCountdown = ready && racePhase === 'intro';
  const showTimer = ready && racePhase === 'racing';
  const showFinishedTime = racePhase === 'finished' && finishedTime != null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = (seconds % 60).toFixed(2);
    return `${m}:${s.padStart(5, '0')}`;
  };

  return (
    <div className="cart-game-screen">
      <div ref={containerRef} className="cart-game-canvas" />
      {!ready && <div className="cart-game-loading">Loading…</div>}
      {showCountdown && (
        <div className="cart-game-countdown" aria-live="polite">
          <div className="cart-game-countdown-lights">
            <span className={`cart-game-light cart-game-light--red ${introProgress >= 0.25 ? 'cart-game-light--on' : ''}`} />
            <span className={`cart-game-light cart-game-light--red ${introProgress >= 0.5 ? 'cart-game-light--on' : ''}`} />
            <span className={`cart-game-light cart-game-light--red ${introProgress >= 0.75 ? 'cart-game-light--on' : ''}`} />
            <span className={`cart-game-light cart-game-light--green ${introProgress >= 1 ? 'cart-game-light--on' : ''}`} />
          </div>
        </div>
      )}
      {goVisible && (
        <div className="cart-game-go-overlay" aria-live="polite">
          <span className="cart-game-go-text">GO</span>
        </div>
      )}
      {showTimer && !showFinishedTime && (
        <div className="cart-game-race-hud">
          <div className="cart-game-timer" aria-live="polite">
            {formatTime(displayTime)}
          </div>
          <div className="cart-game-track-hint" aria-hidden>
            Drive to the checkered finish line.
          </div>
        </div>
      )}
      {showFinishedTime && (
        <div className="cart-game-finished-overlay" aria-live="polite">
          <div className="cart-game-finished-time">Time: {formatTime(finishedTime)}</div>
        </div>
      )}
      {ready && racePhase !== 'intro' && (
        <button
          type="button"
          className="cart-game-pause-btn"
          aria-label="Pause"
          onClick={() => setPaused((p) => !p)}
        >
          II
        </button>
      )}
      {ready && racePhase === 'racing' && (
        <div className="cart-game-mobile-controls" aria-hidden>
          <div className="cart-game-mobile-steer">
            <button
              type="button"
              className="cart-game-mobile-btn"
              aria-label="Steer left"
              onTouchStart={() => (mobileInputRef.current.steer = -1)}
              onTouchEnd={() => (mobileInputRef.current.steer = 0)}
              onMouseDown={() => (mobileInputRef.current.steer = -1)}
              onMouseUp={() => (mobileInputRef.current.steer = 0)}
              onMouseLeave={() => (mobileInputRef.current.steer = 0)}
            >
              <span aria-hidden>←</span>
            </button>
            <button
              type="button"
              className="cart-game-mobile-btn"
              aria-label="Steer right"
              onTouchStart={() => (mobileInputRef.current.steer = 1)}
              onTouchEnd={() => (mobileInputRef.current.steer = 0)}
              onMouseDown={() => (mobileInputRef.current.steer = 1)}
              onMouseUp={() => (mobileInputRef.current.steer = 0)}
              onMouseLeave={() => (mobileInputRef.current.steer = 0)}
            >
              <span aria-hidden>→</span>
            </button>
          </div>
          <div className="cart-game-mobile-drive">
            <button
              type="button"
              className="cart-game-mobile-btn cart-game-mobile-brake"
              aria-label="Brake"
              onTouchStart={() => (mobileInputRef.current.brake = 1)}
              onTouchEnd={() => (mobileInputRef.current.brake = 0)}
              onMouseDown={() => (mobileInputRef.current.brake = 1)}
              onMouseUp={() => (mobileInputRef.current.brake = 0)}
              onMouseLeave={() => (mobileInputRef.current.brake = 0)}
            >
              <span aria-hidden>■</span>
            </button>
            <button
              type="button"
              className="cart-game-mobile-btn cart-game-mobile-gas"
              aria-label="Gas"
              onTouchStart={() => (mobileInputRef.current.throttle = 1)}
              onTouchEnd={() => (mobileInputRef.current.throttle = 0)}
              onMouseDown={() => (mobileInputRef.current.throttle = 1)}
              onMouseUp={() => (mobileInputRef.current.throttle = 0)}
              onMouseLeave={() => (mobileInputRef.current.throttle = 0)}
            >
              <span aria-hidden>▲</span>
            </button>
          </div>
        </div>
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
