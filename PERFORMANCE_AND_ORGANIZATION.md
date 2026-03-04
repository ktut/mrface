# Performance & Organization Audit

Summary of potential improvements identified across the MR. FACE app (React + Three.js + Rapier + MediaPipe).

---

## Bugs fixed

### Duplicate face detection (fixed)
- **File:** `src/App.tsx` — `processImage`
- **Issue:** `faceCapture.detectFromImage(img)` was called twice (once ignored, once used), doubling MediaPipe work on every upload/initial load.
- **Fix:** Removed the redundant first call; only the result of the second call is used.

---

## Performance

### 1. SceneManager render loop when a game is active — **fixed**
- **File:** `src/rendering/SceneManager.ts`, `src/App.tsx`
- **Issue:** When the user is on Cart or Waterpark screen, the home `SceneManager` is still mounted (app-shell is `display: none`). Its `animate()` loop keeps running via `requestAnimationFrame`, so two render loops run (home + game).
- **Fix:** Added `pause()` / `resume()` to `SceneManager`; `App` calls `pause()` when `screen !== 'home'` and `resume()` when `screen === 'home'`.

### 2. Timer updates every frame (Cart & Waterpark)
- **Files:** `src/screens/CartGameScreen.tsx`, `src/screens/WaterparkGameScreen.tsx`
- **Issue:** During racing/sliding, `setDisplayTime(...)` is called inside the `requestAnimationFrame` callback, causing React re-renders every frame (~60/sec) just to update the timer text.
- **Suggestion:** Throttle timer updates to e.g. 4–10 Hz (e.g. only call `setDisplayTime` when `Math.floor(elapsed * 10) !== lastDisplayedTenth`) or use a ref + direct DOM update for the timer so the game loop doesn’t trigger React state updates every frame.

### 3. Intro progress updates every frame (Cart & Waterpark)
- **Files:** Same as above.
- **Issue:** `setIntroProgress(progress)` in the intro phase is also called every frame; same pattern as the timer.
- **Suggestion:** Throttle (e.g. by 100–200 ms) or drive a single “intro progress” state from a timestamp so you don’t set state 60 times per second.

### 4. Dependency on `selectedCharacter?.headGroup` in game screens
- **Files:** `CartGameScreen.tsx`, `WaterparkGameScreen.tsx` — `useEffect(..., [selectedCharacter?.headGroup])`
- **Issue:** `headGroup` is a Three.js object. If the same logical character is recreated (e.g. after a refresh or state restore), reference equality can cause the effect to re-run and tear down/recreate the whole game (Rapier world, renderer, etc.).
- **Suggestion:** Depend on a stable id (e.g. `selectedCharacter?.id` or `characters[clampedSelectedIndex]?.id`) if the intent is “re-run when the selected character identity changes,” so you don’t re-run on every new object reference for the same character.

---

## Organization & maintainability

### 1. Duplicate `getHeadSkinColor` — **fixed**
- **Files:** `src/character/KartCharacter.ts`, `src/character/WaterparkCharacter.ts`
- **Issue:** Same `getHeadSkinColor(headGroup)` logic is duplicated in both files.
- **Fix:** Extracted to `src/character/headSkinColor.ts`; both character modules import it.

### 2. Shared race/UI logic between Cart and Waterpark
- **Files:** `src/screens/CartGameScreen.tsx`, `src/screens/WaterparkGameScreen.tsx`, `src/race/ui.ts`
- **Issue:** Countdown lights, “GO” overlay, timer formatting, and finished overlay are similar in both games; `formatRaceTime` and `getCountdownLightStates` from `race/ui` are already shared.
- **Suggestion:** Consider a small shared “game HUD” component or hook (countdown lights, timer, “GO”, finished time) to avoid drift and duplication.

### 3. HomeDebugPanel callback identity
- **File:** `src/App.tsx`
- **Issue:** `onChangeAttachment` and `onChangeBody` are inline arrow functions, so they are new on every render. This can cause `HomeDebugPanel`’s `useEffect` that depends on them to run more often than needed.
- **Suggestion:** Wrap handlers in `useCallback` (e.g. `useCallback((t) => { sceneManagerRef.current?.updateHomeAttachmentTransform(t); }, [])`) so the effect in `HomeDebugPanel` keyed on `gameId` doesn’t re-run unnecessarily.

### 4. SceneManager has no teardown — **fixed**
- **File:** `src/rendering/SceneManager.ts`
- **Issue:** Constructor adds a `window` resize listener and starts an infinite `animate()` loop. There is no `dispose()` or equivalent, so if the component that owns it ever unmounts (or the canvas is removed), the listener and rAF continue unless the app is closed.
- **Fix:** Added `dispose()` that cancels the rAF, removes the resize listener, disposes the renderer, and removes the canvas. `App` calls it in the init effect cleanup on unmount.

### 5. Vite / bundle
- **File:** `vite.config.ts`
- **Issue:** `optimizeDeps.exclude: ['@mediapipe/face_mesh']` is set (likely because it’s an IIFE). No explicit code-splitting for the game screens.
- **Suggestion:** Consider dynamic `import()` for `CartGameScreen` and `WaterparkGameScreen` (and their heavy deps like Rapier, Three.js game setup) so the initial bundle is smaller and games load on demand. Same for `FaceCapture` / `FaceMeshBuilder` if they are only needed on the home flow.

---

## Summary table

| Area              | Issue                                      | Severity / effort |
|-------------------|--------------------------------------------|-------------------|
| Bug               | Double `detectFromImage` in `processImage`  | Fixed             |
| Performance       | SceneManager loop runs during game         | Medium / medium   |
| Performance       | Timer setState every frame                 | Medium / low      |
| Performance       | Intro progress setState every frame        | Low / low         |
| Performance       | Effect deps on `headGroup` reference      | Low / low         |
| Organization      | Duplicate `getHeadSkinColor`               | Low / low         |
| Organization      | Shared game HUD components                 | Low / medium      |
| Organization      | HomeDebugPanel inline callbacks            | Low / low         |
| Organization      | SceneManager dispose                       | Medium / low      |
| Bundle            | Code-split game screens                    | Optional / medium |
