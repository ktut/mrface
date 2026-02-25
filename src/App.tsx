import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SceneManager } from './rendering/SceneManager';
import { FaceCapture } from './character/face-capture/FaceCapture';
import { FaceMeshBuilder } from './character/mesh-builder/FaceMeshBuilder';
import { useApp } from './context/AppContext';
import { SwipeableStrip } from './components/SwipeableStrip';
import { CartGameScreen } from './screens/CartGameScreen';
import { GameSelectPreview } from './components/GameSelectPreview';

const HELMET_SATURATION = 0.35;
const HELMET_LIGHTNESS_MIN = 0.38;
const HELMET_LIGHTNESS_MAX = 0.62;
const THUMB_SIZE = 64;

const GAMES = [{ id: 'cart', name: 'Kart Racing' }] as const;

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
  const characterMenuRef = useRef<HTMLDivElement | null>(null);

  const {
    characters,
    selectedCharacterIndex,
    helmetHue,
    setHelmetHue,
    selectCharacter,
    setCharacters,
    addCharacter,
    updateCharacter,
    deleteCharacter,
    setSelectedGameId,
    clampedSelectedIndex,
  } = useApp();

  const [screen, setScreen] = useState<'home' | 'gameSelect' | 'cartGame'>('home');
  const [progress, setProgress] = useState(0);
  const [uploadDisabled, setUploadDisabled] = useState(true);
  const [characterMenuIndex, setCharacterMenuIndex] = useState<number | null>(null);

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
          const img = await loadImage('/test/test-face.png');
          await processImage(img, true);
        } catch {
          try {
            const imgAdult = await loadImage('/test/test-face-adult.png');
            await processImage(imgAdult, true);
          } catch {
            setProgress(100);
          }
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

  const handleCharacterSelect = useCallback(
    (index: number) => {
      if (index === selectedCharacterIndex) {
        setCharacterMenuIndex(index);
      } else {
        setCharacterMenuIndex(null);
        selectCharacter(index);
      }
    },
    [selectedCharacterIndex, selectCharacter],
  );

  const handleRenameCharacter = useCallback(() => {
    if (characterMenuIndex == null || characterMenuIndex >= characters.length) {
      setCharacterMenuIndex(null);
      return;
    }
    const currentName = characters[characterMenuIndex].name;
    const newName =
      typeof window !== 'undefined' && window.prompt
        ? window.prompt('Rename character', currentName)
        : currentName;
    const trimmed = newName?.trim();
    if (trimmed) updateCharacter(characterMenuIndex, { name: trimmed });
    setCharacterMenuIndex(null);
  }, [characterMenuIndex, characters, updateCharacter]);

  const handleDeleteCharacter = useCallback(() => {
    if (characterMenuIndex == null || characterMenuIndex >= characters.length) {
      setCharacterMenuIndex(null);
      return;
    }
    deleteCharacter(characterMenuIndex);
    setCharacterMenuIndex(null);
  }, [characterMenuIndex, characters.length, deleteCharacter]);

  useEffect(() => {
    applyHueToCurrentHead(helmetHue);
  }, [helmetHue, applyHueToCurrentHead]);

  const handleChooseGame = useCallback(() => {
    setScreen('gameSelect');
  }, []);

  const handleSelectGame = useCallback(
    (index: number) => {
      const game = GAMES[index];
      if (game?.id === 'cart') {
        setSelectedGameId('cart');
        setScreen('cartGame');
      }
    },
    [setSelectedGameId],
  );

  const handleExitToMenu = useCallback(() => {
    setSelectedGameId(null);
    setScreen('home');
  }, [setSelectedGameId]);

  if (screen === 'cartGame') {
    return <CartGameScreen onExitToMenu={handleExitToMenu} />;
  }

  return (
    <div className="app-shell">
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
      <h1 className="app-title">
        {screen === 'gameSelect' ? 'Choose game.' : 'Choose character.'}
      </h1>
      <div className="app-main">
        <div
          ref={containerRef}
          className="canvas-container"
          style={{ display: screen === 'home' ? 'block' : 'none' }}
          aria-hidden={screen !== 'home'}
        />
        {screen === 'gameSelect' && <GameSelectPreview />}

        <div className="ui-overlay">
          {screen === 'home' && (
            <>
              <div className="helmet-hue-control" role="group" aria-label="Helmet hue">
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
                />
              </div>
              <button
                type="button"
                className="upload-btn"
                onClick={handleUploadClick}
                disabled={uploadDisabled}
                aria-label="Upload face"
              >
                <span className="upload-btn-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="M21 15l-5-5L5 21" />
                  </svg>
                </span>
                Upload Face
              </button>
              {/* Child / Adult test buttons — commented out
              <div className="test-image-buttons" role="group" aria-label="Load test image">
                <button
                  type="button"
                  className="test-image-btn"
                  onClick={async () => {
                    if (uploadDisabled) return;
                    try {
                      const img = await loadImage('/test/test-face.png');
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
                      const img = await loadImage('/test/test-face-adult.png');
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
              */}
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

          {screen === 'home' && characters.length > 0 && (
            <SwipeableStrip
              items={characters}
              selectedIndex={clampedSelectedIndex}
              onSelect={handleCharacterSelect}
              getItemId={(c) => c.id}
              renderItem={(char, _index, _selected) => (
                <>
                  <span className="character-option-thumb">
                    <img src={char.thumbnailUrl} alt="" width={THUMB_SIZE} height={THUMB_SIZE} />
                  </span>
                  <span className="character-option-label">{char.name}</span>
                </>
              )}
              className="character-swiper"
              stripClassName="character-strip"
              itemClassName="character-option"
              selectedItemClassName="character-option--selected"
              ariaLabel="Characters"
              ariaLabelPrev="Previous character"
              ariaLabelNext="Next character"
            />
          )}

          {screen === 'home' && characters.length > 0 && (
            <button
              type="button"
              className="choose-game-btn"
              onClick={handleChooseGame}
            >
              Choose game
            </button>
          )}

          {screen === 'gameSelect' && (
            <>
              <button
                type="button"
                className="back-from-games-btn"
                onClick={() => setScreen('home')}
              >
                ‹ Back
              </button>
              <SwipeableStrip
                items={[...GAMES]}
                selectedIndex={0}
                onSelect={handleSelectGame}
                getItemId={(g) => g.id}
                renderItem={(game, _index, _selected) => (
                  <span className="game-option-label">{game.name}</span>
                )}
                className="game-swiper"
                stripClassName="game-strip"
                itemClassName="game-option"
                selectedItemClassName="game-option--selected"
                ariaLabel="Games"
                ariaLabelPrev="Previous game"
                ariaLabelNext="Next game"
              />
            </>
          )}

          {characterMenuIndex !== null && screen === 'home' && (
            <>
              <div
                className="character-menu-backdrop"
                role="presentation"
                aria-hidden
                onClick={() => setCharacterMenuIndex(null)}
              />
              <div
                ref={characterMenuRef}
                className="character-menu"
                role="menu"
                aria-label="Character options"
              >
                <button
                  type="button"
                  className="character-menu-btn"
                  role="menuitem"
                  onClick={handleRenameCharacter}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="character-menu-btn character-menu-btn--danger"
                  role="menuitem"
                  onClick={handleDeleteCharacter}
                >
                  Delete
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
