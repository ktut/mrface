/**
 * Shared race / time utilities used by both Kart and Waterpark games.
 */

/**
 * Format a race time in seconds as `M:SS.ss`.
 */
export function formatRaceTime(seconds: number): string {
  const clamped = Math.max(0, seconds);
  const m = Math.floor(clamped / 60);
  const s = (clamped % 60).toFixed(2);
  return `${m}:${s.padStart(5, '0')}`;
}

/**
 * Given an intro progress value in \[0, 1], return which countdown lights
 * should be lit. Used by both Kart and Waterpark countdown UIs so the timing
 * stays consistent.
 */
export function getCountdownLightStates(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  return {
    red1: p >= 0.25,
    red2: p >= 0.5,
    red3: p >= 0.75,
    green: p >= 1,
  };
}

