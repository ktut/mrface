import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { SceneManager } from './rendering/SceneManager';
import { FaceCapture } from './character/face-capture/FaceCapture';
import { FaceMeshBuilder } from './character/mesh-builder/FaceMeshBuilder';

const HEAD_TOPPER_OPTIONS = [
  { id: 0, label: 'frizzy hair', icon: 'hair', color: '#c9a87a' },
  { id: 1, label: 'helmet', icon: 'helmet', color: '#c0c0c8' },
] as const;

function TopperIcon({ type, color }: { type: 'hair' | 'helmet'; color: string }) {
  if (type === 'hair') {
    // Frizzy hair: face oval with curly strokes above
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" aria-hidden>
        <ellipse cx="12" cy="14" rx="5" ry="6" />
        <path d="M7 9 Q7 3 12 2 Q17 3 17 9" />
        <path d="M8 7 Q10 4 12 5 Q14 4 16 7" />
        <path d="M9 5 Q11 2 12 3 Q13 2 15 5" />
        <path d="M10 8 Q12 6 14 8" />
      </svg>
    );
  }
  // Helmet: dome with visor line
  return (
    <svg viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M4 13c0-4.4 3.6-8 8-8s8 3.6 8 8v7H4v-7z" />
      <path d="M6 13c0-3.3 2.7-6 6-6s6 2.7 6 6" fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth="0.8" />
    </svg>
  );
}
const SWIPE_THRESHOLD_PX = 50;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

export function App() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sceneManagerRef = useRef<SceneManager | null>(null);
  const faceCaptureRef = useRef<FaceCapture | null>(null);
  const faceMeshBuilderRef = useRef<FaceMeshBuilder | null>(null);
  const touchStartXRef = useRef(0);
  const topperStripRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState('Loading MediaPipe…');
  const [uploadDisabled, setUploadDisabled] = useState(true);
  const [headTopperIndex, setHeadTopperIndexState] = useState(0);

  const setHeadTopperIndex = useCallback((index: number) => {
    const n = HEAD_TOPPER_OPTIONS.length;
    const i = ((index % n) + n) % n;
    setHeadTopperIndexState(i);
    const head = sceneManagerRef.current?.getCharacterHead();
    if (head) {
      const headwear = head.getObjectByName('headwear') as THREE.Group | undefined;
      if (headwear) {
        const hair = headwear.getObjectByName('hair');
        const helmet = headwear.getObjectByName('helmet');
        if (hair) hair.visible = i === 0;
        if (helmet) helmet.visible = i === 1;
        // Add more named visibility toggles here when new toppers are added
      }
    }
    return i;
  }, []);

  const processImage = useCallback(
    async (img: HTMLImageElement) => {
      const sceneManager = sceneManagerRef.current;
      const faceCapture = faceCaptureRef.current;
      const faceMeshBuilder = faceMeshBuilderRef.current;
      if (!sceneManager || !faceCapture || !faceMeshBuilder) return;

      setUploadDisabled(true);
      try {
        setStatus('Detecting face landmarks…');
        const landmarks = await faceCapture.detectFromImage(img);
        if (!landmarks) {
          setStatus('No face detected — try a clearer front-facing photo.');
          return;
        }
        setStatus(`Found ${landmarks.length} landmarks — building mesh…`);
        const headGroup = await faceMeshBuilder.build(landmarks, img);
        sceneManager.setCharacterHead(headGroup);
        setHeadTopperIndex(0);
        setStatus('Done! Drag to orbit · scroll to zoom.');
      } catch (err) {
        console.error('[processImage]', err);
        setStatus('Error processing image — check the console for details.');
      } finally {
        setUploadDisabled(false);
      }
    },
    [setHeadTopperIndex],
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
        setStatus('Initialising MediaPipe Face Mesh…');
        await faceCapture.init();
        setUploadDisabled(false);
        setStatus('Loading default face…');
        try {
          const img = await loadImage('/test-face.png');
          await processImage(img);
        } catch {
          setStatus('Ready — upload a face photo to get started.');
        }
      } catch (err) {
        console.error('[init]', err);
        setStatus('Failed to load MediaPipe — check your internet connection.');
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
        await processImage(img);
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

  const topperPrev = useCallback(() => setHeadTopperIndex(headTopperIndex - 1), [headTopperIndex, setHeadTopperIndex]);
  const topperNext = useCallback(() => setHeadTopperIndex(headTopperIndex + 1), [headTopperIndex, setHeadTopperIndex]);

  const onTopperTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  }, []);

  const onTopperTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.changedTouches.length === 0) return;
      const dx = e.changedTouches[0].clientX - touchStartXRef.current;
      if (dx > SWIPE_THRESHOLD_PX) setHeadTopperIndex(headTopperIndex - 1);
      else if (dx < -SWIPE_THRESHOLD_PX) setHeadTopperIndex(headTopperIndex + 1);
    },
    [headTopperIndex, setHeadTopperIndex],
  );

  // Scroll strip so the selected option is in view when changing via arrows
  useEffect(() => {
    const strip = topperStripRef.current;
    if (!strip) return;
    const option = strip.querySelector(`.topper-option:nth-child(${headTopperIndex + 1})`) as HTMLElement | null;
    if (option) option.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [headTopperIndex]);

  return (
    <>
      <div ref={containerRef} className="canvas-container" />

      <div
        className="head-topper-control"
        role="group"
        aria-label="Head topper"
      >
        <button type="button" onClick={topperPrev} aria-label="Previous head topper">
          ‹
        </button>
        <div
          ref={topperStripRef}
          className="head-topper-strip"
          onTouchStart={onTopperTouchStart}
          onTouchEnd={onTopperTouchEnd}
          role="list"
        >
          {HEAD_TOPPER_OPTIONS.map((opt, index) => (
            <button
              key={opt.id}
              type="button"
              className={`topper-option ${index === headTopperIndex ? 'topper-option--selected' : ''}`}
              onClick={() => setHeadTopperIndex(index)}
              role="listitem"
              aria-pressed={index === headTopperIndex}
              aria-label={opt.label}
            >
              <span className="topper-option-icon-wrap">
                <TopperIcon type={opt.icon} color={opt.color} />
              </span>
              <span className="topper-option-label">{opt.label}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={topperNext} aria-label="Next head topper">
          ›
        </button>
      </div>

      <div className="ui-overlay">
        <div className="status" aria-live="polite">
          {status}
        </div>
        <button
          type="button"
          className="upload-btn"
          onClick={handleUploadClick}
          disabled={uploadDisabled}
          aria-label="Upload face photo"
        >
          Upload Face Photo
        </button>
        <input
          id="file-input"
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          aria-hidden
          tabIndex={-1}
        />
      </div>
    </>
  );
}
