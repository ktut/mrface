/**
 * Waterpark (waterslide) game state and config — start to finish, similar to Kart race.
 */

export type WaterparkPhase = 'intro' | 'countdown' | 'sliding' | 'finished';

export interface WaterparkState {
  phase: WaterparkPhase;
  startTime: number | null;
  endTime: number | null;
  currentTime: number;
}

export const WATERPARK_CONFIG = {
  START_LINE_Z: -8,
  FINISH_LINE_Z: 172,
  SLIDE_LENGTH: 180,
  SLIDE_HALF_WIDTH: 12,
  ROOM_BEFORE: 20,
  ROOM_AFTER: 20,
  INTRO_DURATION: 4,
  FINISHED_VIEW_TIME: 3,
} as const;
