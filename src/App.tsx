import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SceneManager } from './rendering/SceneManager';
import { FaceCapture } from './character/face-capture/FaceCapture';
import { FaceMeshBuilder } from './character/mesh-builder/FaceMeshBuilder';
import { CONFIG } from './config';

const SWIPE_THRESHOLD_PX = 50;
const HELMET_SATURATION = 0.35; // Higher so hue is clearly visible
const HELMET_LIGHTNESS_MIN = 0.38; // Slider left = darker
const HELMET_LIGHTNESS_MAX = 0.62; // Slider right = slightly lighter
const THUMB_SIZE = 64;

interface CharacterEntry {
  id: string;
  name: string;
  headGroup: THREE.Group;
  thumbnailUrl: string;
}

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
  // Slider left (0) = darker, right (360) = slightly lighter
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
  const touchStartXRef = useRef(0);
  const characterStripRef = useRef<HTMLDivElement | null>(null);

  const [progress, setProgress] = useState(0);
  const [uploadDisabled, setUploadDisabled] = useState(true);
  const [helmetHue, setHelmetHue] = useState<number>(CONFIG.HELMET.DEFAULT_HUE);
  const [characters, setCharacters] = useState<CharacterEntry[]>([]);
  const [selectedCharacterIndex, setSelectedCharacterIndex] = useState(0);

  const applyHueToCurrentHead = useCallback((hue: number) => {
    const head = sceneManagerRef.current?.getCharacterHead();
    if (head) applyHelmetHue(head, hue);
  }, []);

  const setHelmetHueAndApply = useCallback((hue: number) => {
    const h = Math.max(0, Math.min(360, hue));
    setHelmetHue(h);
    applyHueToCurrentHead(h);
  }, [applyHueToCurrentHead]);

  const processImage = useCallback(
    async (img: HTMLImageElement, isInitialLoad: boolean) => {
      const sceneManager = sceneManagerRef.current;
      const faceCapture = faceCaptureRef.current;
      const faceMeshBuilder = faceMeshBuilderRef.current;
      if (!sceneManager || !faceCapture || !faceMeshBuilder) return;

      setUploadDisabled(true);
      try {
        setProgress(5);
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
        const entry: CharacterEntry = { id, name, headGroup, thumbnailUrl };

        setCharacters((prev) => (isInitialLoad ? [entry] : [...prev, entry]));
        setSelectedCharacterIndex(isInitialLoad ? 0 : characters.length);
        sceneManager.setCharacterHead(headGroup);
        setProgress(100);
      } catch (err) {
        console.error('[processImage]', err);
        setProgress(0);
      } finally {
        setUploadDisabled(false);
      }
    },
    [helmetHue, characters.length],
  );

  // Mount Three.js scene and run init
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
          const img = await loadImage('/test-face.png');
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

  const selectCharacter = useCallback(
    (index: number) => {
      if (index < 0 || index >= characters.length) return;
      setSelectedCharacterIndex(index);
      const entry = characters[index];
      sceneManagerRef.current?.setCharacterHead(entry.headGroup);
      applyHelmetHue(entry.headGroup, helmetHue);
    },
    [characters, helmetHue],
  );

  const characterPrev = useCallback(
    () => selectCharacter(selectedCharacterIndex - 1),
    [selectedCharacterIndex, selectCharacter],
  );
  const characterNext = useCallback(
    () => selectCharacter(selectedCharacterIndex + 1),
    [selectedCharacterIndex, selectCharacter],
  );

  const onCharacterTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  }, []);

  const onCharacterTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.changedTouches.length === 0) return;
      const dx = e.changedTouches[0].clientX - touchStartXRef.current;
      if (dx > SWIPE_THRESHOLD_PX) selectCharacter(selectedCharacterIndex - 1);
      else if (dx < -SWIPE_THRESHOLD_PX) selectCharacter(selectedCharacterIndex + 1);
    },
    [selectedCharacterIndex, selectCharacter],
  );

  useEffect(() => {
    applyHueToCurrentHead(helmetHue);
  }, [helmetHue, applyHueToCurrentHead]);

  useEffect(() => {
    const strip = characterStripRef.current;
    if (!strip) return;
    const option = strip.querySelector(`.character-option:nth-child(${selectedCharacterIndex + 1})`) as HTMLElement | null;
    if (option) option.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedCharacterIndex]);

  return (
    <div className="app-shell">
      <div
        className={`global-progress ${progress > 0 && progress < 100 ? 'global-progress--active' : ''}`}
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
      <h1 className="app-title">Choose character.</h1>
      <div className="app-main">
        <div ref={containerRef} className="canvas-container" />

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

      <div className="ui-overlay">
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
        <input
          id="file-input"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          aria-hidden
          tabIndex={-1}
        />

        {characters.length > 0 && (
          <div
            className="character-swiper"
            role="group"
            aria-label="Characters"
          >
            <button
              type="button"
              onClick={characterPrev}
              disabled={selectedCharacterIndex <= 0}
              aria-label="Previous character"
            >
              ‹
            </button>
            <div
              ref={characterStripRef}
              className="character-strip"
              onTouchStart={onCharacterTouchStart}
              onTouchEnd={onCharacterTouchEnd}
              role="list"
            >
              {characters.map((char, index) => (
                <button
                  key={char.id}
                  type="button"
                  className={`character-option ${index === selectedCharacterIndex ? 'character-option--selected' : ''}`}
                  onClick={() => selectCharacter(index)}
                  role="listitem"
                  aria-pressed={index === selectedCharacterIndex}
                  aria-label={char.name}
                >
                  <span className="character-option-thumb">
                    <img src={char.thumbnailUrl} alt="" width={THUMB_SIZE} height={THUMB_SIZE} />
                  </span>
                  <span className="character-option-label">{char.name}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={characterNext}
              disabled={selectedCharacterIndex >= characters.length - 1}
              aria-label="Next character"
            >
              ›
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
