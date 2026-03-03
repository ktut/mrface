import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SceneManager } from './rendering/SceneManager';
import { FaceCapture } from './character/face-capture/FaceCapture';
import { FaceMeshBuilder } from './character/mesh-builder/FaceMeshBuilder';
import { useApp } from './context/AppContext';
import { SwipeableStrip } from './components/SwipeableStrip';
import { CartGameScreen } from './screens/CartGameScreen';
import { WaterparkGameScreen } from './screens/WaterparkGameScreen';
import { HomeDebugPanel, type HomeAttachmentTransform } from './components/HomeDebugPanel';

import testFaceAdultUrl from './assets/test/test-face-adult.png';

/** Default face image on load: served from public/test-face.png (dev and prod). */
const DEFAULT_TEST_FACE_URL = '/test-face.png';

const HELMET_SATURATION = 0.35;
const HELMET_LIGHTNESS_MIN = 0.38;
const HELMET_LIGHTNESS_MAX = 0.62;
const THUMB_SIZE = 64;

const GAMES = [
  { id: 'waterpark', name: 'Waterpark' },
  { id: 'cart', name: 'Kart' },
] as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

function createThumbnailFromImage(img: HTMLImageElement): string {
  const canvas = document.createElement('canvas');
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, THUMB_SIZE, THUMB_SIZE);
  return canvas.toDataURL('image/jpeg', 0.75);
}

function applyHelmetHue(head: THREE.Object3D, hue: number) {
  const headwear = head.getObjectByName('headwear') as THREE.Group | undefined;
  if (!headwear) return;
  const helmet = headwear.getObjectByName('helmet');
  if (!helmet) return;
  const t = hue / 360;
  const lightness = HELMET_LIGHTNESS_MIN + t * (HELMET_LIGHTNESS_MAX - HELMET_LIGHTNESS_MIN);
  const color = new THREE.Color().setHSL(t, HELMET_SATURATION, lightness);
  helmet.traverse((child) => {
    if (child instanceof THREE.Mesh && child.material) {
      const mat = child.material as THREE.MeshStandardMaterial;
      if (mat.color) mat.color.copy(color);
    }
  });
}

export function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const faceCaptureRef = useRef<FaceCapture | null>(null);
  const faceMeshBuilderRef = useRef<FaceMeshBuilder | null>(null);
  const {
    characters,
    selectedCharacter,
    helmetHue,
    setHelmetHue,
    selectCharacter,
    setCharacters,
    addCharacter,
    selectedGameId,
    setSelectedGameId,
    clampedSelectedIndex,
    isDev,
    debugMode,
    setDebugMode,
  } = useApp();

  const [screen, setScreen] = useState<'home' | 'cartGame' | 'waterparkGame'>('home');
  const [progress, setProgress] = useState(0);
  const [uploadDisabled, setUploadDisabled] = useState(true);
  const [characterMenuOpen, setCharacterMenuOpen] = useState(false);

  const applyHueToCurrentHead = useCallback((hue: number) => {
    const head = sceneManagerRef.current?.getCharacterHead();
    if (head) applyHelmetHue(head, hue);
  }, []);

  const setHelmetHueAndApply = useCallback(
    (hue: number) => {
      const h = Math.max(0, Math.min(360, hue));
      setHelmetHue(h);
      applyHueToCurrentHead(h);
    },
    [setHelmetHue, applyHueToCurrentHead],
  );

  const processImage = useCallback(
    async (img: HTMLImageElement, isInitialLoad: boolean) => {
      const sceneManager = sceneManagerRef.current;
      const faceCapture = faceCaptureRef.current;
      const faceMeshBuilder = faceMeshBuilderRef.current;
      if (!sceneManager || !faceCapture || !faceMeshBuilder) return;

      setUploadDisabled(true);
      try {
        setProgress(5);
        await faceCapture.detectFromImage(img);
        const landmarks = await faceCapture.detectFromImage(img);
        if (!landmarks) {
          setProgress(0);
          return;
        }
        setProgress(20);
        const headGroup = await faceMeshBuilder.build(landmarks, img, (p) =>
          setProgress(20 + Math.round((p / 100) * 70)),
        );
        applyHelmetHue(headGroup, helmetHue);

        const thumbnailUrl = createThumbnailFromImage(img);
        const name = isInitialLoad ? 'Z baby' : `Character ${characters.length + 1}`;
        const id = `char-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        const entry = { id, name, headGroup, thumbnailUrl };

        if (isInitialLoad) {
          setCharacters([entry]);
          selectCharacter(0);
        } else {
          addCharacter(entry);
        }
        sceneManager.setCharacterHead(headGroup);
        setProgress(100);
      } catch (err) {
        console.error('[processImage]', err);
        setProgress(0);
      } finally {
        setUploadDisabled(false);
      }
    },
    [helmetHue, characters.length, setCharacters, selectCharacter, addCharacter],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const sceneManager = new SceneManager(container);
    const faceCapture = new FaceCapture();
    const faceMeshBuilder = new FaceMeshBuilder();
    sceneManagerRef.current = sceneManager;
    faceCaptureRef.current = faceCapture;
    faceMeshBuilderRef.current = faceMeshBuilder;

    (async () => {
      try {
        setProgress(10);
        await faceCapture.init();
        setProgress(40);
        setUploadDisabled(false);
        try {
          const img = await loadImage(DEFAULT_TEST_FACE_URL);
          await processImage(img, true);
        } catch {
          setProgress(100);
        }
      } catch (err) {
        console.error('[init]', err);
        setProgress(0);
      }
    })();
  }, []);

  useEffect(() => {
    const entry = characters[clampedSelectedIndex];
    sceneManagerRef.current?.setCharacterHead(entry?.headGroup ?? null);
    if (entry) applyHelmetHue(entry.headGroup, helmetHue);
  }, [characters, clampedSelectedIndex, helmetHue, applyHelmetHue]);

  useEffect(() => {
    sceneManagerRef.current?.setDebugMode(debugMode);
  }, [debugMode]);

  useEffect(() => {
    const sceneManager = sceneManagerRef.current;
    const entry = characters[clampedSelectedIndex];
    if (!sceneManager) return;
    const head = entry?.headGroup ?? null;
    const gameId = (selectedGameId ?? 'waterpark') as 'cart' | 'waterpark';
    void sceneManager.setHomeAttachment(head ? gameId : null, head);
  }, [characters, clampedSelectedIndex, selectedGameId]);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const objectUrl = URL.createObjectURL(file);
      try {
        const img = await loadImage(objectUrl);
        await processImage(img, false);
      } finally {
        URL.revokeObjectURL(objectUrl);
        e.target.value = '';
      }
    },
    [processImage],
  );

  const handleUploadClick = useCallback(() => {
    document.getElementById('file-input')?.click();
  }, []);

  useEffect(() => {
    applyHueToCurrentHead(helmetHue);
  }, [helmetHue, applyHueToCurrentHead]);

  const selectedGameIndex = GAMES.findIndex((g) => g.id === (selectedGameId ?? 'waterpark'));
  const effectiveGameIndex = selectedGameIndex < 0 ? 0 : selectedGameIndex;

  const handleSelectGame = useCallback(
    (index: number) => {
      const game = GAMES[index];
      if (game) setSelectedGameId(game.id);
    },
    [setSelectedGameId],
  );

  const handlePlay = useCallback(() => {
    const gameId = selectedGameId ?? 'waterpark';
    setSelectedGameId(gameId);
    if (gameId === 'cart') setScreen('cartGame');
    else if (gameId === 'waterpark') setScreen('waterparkGame');
  }, [selectedGameId, setSelectedGameId]);

  const handleExitToMenu = useCallback(() => {
    setSelectedGameId(null);
    setScreen('home');
  }, [setSelectedGameId]);

  return (
    <>
      {screen === 'cartGame' && <CartGameScreen onExitToMenu={handleExitToMenu} />}
      {screen === 'waterparkGame' && <WaterparkGameScreen onExitToMenu={handleExitToMenu} />}
      <div
        className="app-shell"
        style={{ display: screen === 'cartGame' || screen === 'waterparkGame' ? 'none' : undefined }}
        aria-hidden={screen === 'cartGame' || screen === 'waterparkGame'}
      >
      {isDev && (
        <div className="debug-mode-toggle" role="group" aria-label="Debug mode">
          <label className="debug-mode-label">
            <input
              type="checkbox"
              checked={debugMode}
              onChange={(e) => setDebugMode(e.target.checked)}
              aria-label="Debug mode"
            />
            <span>Debug Mode</span>
          </label>
        </div>
      )}
      <div
        className={`global-progress ${progress > 0 && progress < 100 ? 'global-progress--active' : ''} ${progress === 100 ? 'global-progress--complete' : ''}`}
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Progress"
      >
        <div className="global-progress-track">
          <div className="global-progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <h1 className="app-title">MR. FACE</h1>
      <div className="app-main">
        <div
          ref={containerRef}
          className="canvas-container"
          style={{ display: screen === 'home' ? 'block' : 'none' }}
          aria-hidden={screen !== 'home'}
        />
        {screen === 'home' && debugMode && (
          <HomeDebugPanel
            onChangeAttachment={(t: HomeAttachmentTransform) => {
              sceneManagerRef.current?.updateHomeAttachmentTransform(t);
            }}
            onChangeBody={(t: HomeAttachmentTransform) => {
              sceneManagerRef.current?.updateHomeDriverBodyTransform(t);
            }}
          />
        )}
        <div className="ui-overlay">
          {screen === 'home' && (
            <>
              <div className="customize-character-section">
                <span className="customize-character-label">Customize Character</span>
                <div className="customize-character-row">
                  <div className="character-dropdown-wrap" role="group" aria-label="Character">
                    <button
                      type="button"
                      className="character-avatar-trigger"
                      onClick={() => {
                        if (characters.length === 0) return;
                        setCharacterMenuOpen((open) => !open);
                      }}
                      disabled={characters.length === 0}
                      aria-haspopup="listbox"
                      aria-expanded={characterMenuOpen}
                    >
                      {selectedCharacter && (
                        <span className="character-avatar">
                          <img src={selectedCharacter.thumbnailUrl} alt="" />
                        </span>
                      )}
                      <span className="character-avatar-name">
                        {selectedCharacter?.name ?? 'Z baby'}
                      </span>
                      <span className="character-avatar-chevron" aria-hidden>
                        {characterMenuOpen ? '▴' : '▾'}
                      </span>
                    </button>
                    {characterMenuOpen && characters.length > 0 && (
                      <div
                        className="character-avatar-menu"
                        role="listbox"
                        aria-label="Select character"
                      >
                        {characters.map((c, i) => (
                          <button
                            key={c.id}
                            type="button"
                            className={`character-avatar-option${
                              i === clampedSelectedIndex ? ' character-avatar-option--selected' : ''
                            }`}
                            role="option"
                            aria-selected={i === clampedSelectedIndex}
                            onClick={() => {
                              selectCharacter(i);
                              setCharacterMenuOpen(false);
                            }}
                          >
                            <span className="character-avatar">
                              <img src={c.thumbnailUrl} alt="" />
                            </span>
                            <span className="character-avatar-name">{c.name}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    className="upload-btn upload-btn--icon-only"
                    onClick={handleUploadClick}
                    disabled={uploadDisabled}
                    aria-label="Upload face"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </button>
                  <div className="helmet-hue-control" role="group" aria-label="Helmet color">
                    <input
                      id="helmet-hue-slider"
                      type="range"
                      min={0}
                      max={360}
                      value={helmetHue}
                      onChange={(e) => setHelmetHueAndApply(Number(e.target.value))}
                      className="helmet-hue-slider"
                      style={{ '--thumb-hue': helmetHue } as React.CSSProperties}
                      aria-valuemin={0}
                      aria-valuemax={360}
                      aria-valuenow={helmetHue}
                      title="Helmet color"
                    />
                  </div>
                </div>
              </div>
              <input
                id="file-input"
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                aria-hidden
                tabIndex={-1}
              />
            </>
          )}

          {screen === 'home' && (
            <div className="game-and-play-section">
              {debugMode && (
                <div className="test-image-buttons" role="group" aria-label="Load test image">
                  <button
                    type="button"
                    className="test-image-btn"
                    onClick={async () => {
                      if (uploadDisabled) return;
                      try {
                        const img = await loadImage(DEFAULT_TEST_FACE_URL);
                        await processImage(img, characters.length === 0);
                      } catch {
                        // ignore
                      }
                    }}
                    disabled={uploadDisabled}
                  >
                    Child test
                  </button>
                  <button
                    type="button"
                    className="test-image-btn"
                    onClick={async () => {
                      if (uploadDisabled) return;
                      try {
                        const img = await loadImage(testFaceAdultUrl);
                        await processImage(img, characters.length === 0);
                      } catch {
                        // ignore
                      }
                    }}
                    disabled={uploadDisabled}
                  >
                    Adult test
                  </button>
                </div>
              )}
              <SwipeableStrip
                items={[...GAMES]}
                selectedIndex={effectiveGameIndex}
                onSelect={handleSelectGame}
                getItemId={(g) => g.id}
                renderItem={(game, _index, _selected) => (
                  <span className="game-option-label">
                    {game.id === 'waterpark' ? '🌊 Waterpark' : '🏎️ Kart'}
                  </span>
                )}
                className="game-swiper"
                stripClassName="game-strip"
                itemClassName="game-option"
                selectedItemClassName="game-option--selected"
                ariaLabel="Games"
                ariaLabelPrev="Previous game"
                ariaLabelNext="Next game"
              />
              <button
                type="button"
                className="play-btn"
                onClick={handlePlay}
                disabled={characters.length === 0}
              >
                PLAY
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
    </>
  );
}
