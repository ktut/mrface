import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { useApp } from '../context/AppContext';
import { VehicleController } from '../physics/VehicleController';
import { InputManager } from '../engine/InputManager';
import { buildKartCharacter } from '../character/KartCharacter';

interface CartGameScreenProps {
  onExitToMenu: () => void;
}

export function CartGameScreen({ onExitToMenu }: CartGameScreenProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { selectedCharacter } = useApp();
  const [paused, setPaused] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mobileInputRef = useRef({ steer: 0, throttle: 0, brake: 0 });

  // Camera orbit: directly behind kart = yaw 0 with offset (0, height, -distance).
  const CAM_DISTANCE = 6;
  const CAM_HEIGHT = 4;
  const defaultCameraYaw = 0;
  const cameraOrbitRef = useRef({ yaw: defaultCameraYaw });
  const pointerRef = useRef<{ isDown: boolean; startX: number; startYaw: number }>({
    isDown: false,
    startX: 0,
    startYaw: 0,
  });

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
        vehicle.addGround();

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
        key.position.set(5, 10, 5);
        key.castShadow = true;
        key.shadow.mapSize.set(1024, 1024);
        scene.add(key);

        const groundGeo = new THREE.PlaneGeometry(100, 100);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x2d5a3d });
        const groundMesh = new THREE.Mesh(groundGeo, groundMat);
        groundMesh.rotation.x = -Math.PI / 2;
        groundMesh.receiveShadow = true;
        scene.add(groundMesh);

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
    if (!ready || paused || !gameRef.current) return;

    const g = gameRef.current;
    let lastTime = performance.now() / 1000;

    const loop = () => {
      g.animationId = requestAnimationFrame(loop);
      const now = performance.now() / 1000;
      const dt = Math.min(now - lastTime, 0.1);
      lastTime = now;

      const mi = mobileInputRef.current;
      g.input.setMobileInput(mi.steer, mi.throttle, mi.brake);
      const { throttle, brake, steer } = g.input.getInput(dt);
      g.vehicle.applyInput(throttle, brake, steer);
      g.vehicle.getWorld().step();
      g.vehicle.update(dt);
      g.vehicle.syncToObject3D(g.kartGroup);

      const chassis = g.vehicle.getChassisBody();
      const t = chassis.translation();
      const yaw = cameraOrbitRef.current.yaw;
      const targetPos = new THREE.Vector3(
        t.x + CAM_DISTANCE * Math.sin(yaw),
        t.y + CAM_HEIGHT,
        t.z - CAM_DISTANCE * Math.cos(yaw),
      );
      g.camera.position.lerp(targetPos, 0.05);
      g.camera.lookAt(t.x, t.y + 1, t.z);

      g.renderer.render(g.scene, g.camera);
    };

    loop();
    return () => cancelAnimationFrame(g.animationId);
  }, [ready, paused]);

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

  // Swipe / drag on canvas to orbit the camera around the kart.
  const ORBIT_SENSITIVITY = 0.004;
  useEffect(() => {
    const g = gameRef.current;
    if (!ready || !g) return;
    const canvas = g.renderer.domElement;

    const onPointerDown = (e: PointerEvent) => {
      pointerRef.current.isDown = true;
      pointerRef.current.startX = e.clientX;
      pointerRef.current.startYaw = cameraOrbitRef.current.yaw;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!pointerRef.current.isDown) return;
      e.preventDefault();
      const dx = e.clientX - pointerRef.current.startX;
      cameraOrbitRef.current.yaw = pointerRef.current.startYaw - dx * ORBIT_SENSITIVITY;
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

  return (
    <div className="cart-game-screen">
      <div ref={containerRef} className="cart-game-canvas" />
      {!ready && <div className="cart-game-loading">Loading…</div>}
      <button
        type="button"
        className="cart-game-pause-btn"
        aria-label="Pause"
        onClick={() => setPaused((p) => !p)}
      >
        II
      </button>
      {ready && (
        <div className="cart-game-mobile-controls" aria-hidden>
          <div className="cart-game-mobile-steer">
            <button
              type="button"
              className="cart-game-mobile-btn"
              onTouchStart={() => (mobileInputRef.current.steer = -1)}
              onTouchEnd={() => (mobileInputRef.current.steer = 0)}
              onMouseDown={() => (mobileInputRef.current.steer = -1)}
              onMouseUp={() => (mobileInputRef.current.steer = 0)}
              onMouseLeave={() => (mobileInputRef.current.steer = 0)}
            >
              ←
            </button>
            <button
              type="button"
              className="cart-game-mobile-btn"
              onTouchStart={() => (mobileInputRef.current.steer = 1)}
              onTouchEnd={() => (mobileInputRef.current.steer = 0)}
              onMouseDown={() => (mobileInputRef.current.steer = 1)}
              onMouseUp={() => (mobileInputRef.current.steer = 0)}
              onMouseLeave={() => (mobileInputRef.current.steer = 0)}
            >
              →
            </button>
          </div>
          <div className="cart-game-mobile-drive">
            <button
              type="button"
              className="cart-game-mobile-btn cart-game-mobile-gas"
              onTouchStart={() => (mobileInputRef.current.throttle = 1)}
              onTouchEnd={() => (mobileInputRef.current.throttle = 0)}
              onMouseDown={() => (mobileInputRef.current.throttle = 1)}
              onMouseUp={() => (mobileInputRef.current.throttle = 0)}
              onMouseLeave={() => (mobileInputRef.current.throttle = 0)}
            >
              Gas
            </button>
            <button
              type="button"
              className="cart-game-mobile-btn cart-game-mobile-brake"
              onTouchStart={() => (mobileInputRef.current.brake = 1)}
              onTouchEnd={() => (mobileInputRef.current.brake = 0)}
              onMouseDown={() => (mobileInputRef.current.brake = 1)}
              onMouseUp={() => (mobileInputRef.current.brake = 0)}
              onMouseLeave={() => (mobileInputRef.current.brake = 0)}
            >
              Brake
            </button>
          </div>
        </div>
      )}
      {paused && (
        <div className="cart-game-pause-overlay" role="dialog" aria-label="Paused">
          <div className="cart-game-pause-menu">
            <h2>Paused</h2>
            <button type="button" className="cart-game-menu-btn" onClick={handleExit}>
              Exit to main menu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
