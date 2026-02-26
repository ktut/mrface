/**
 * Race state types — structured for future multiplayer (multiple players, same phase/timer).
 * Linear track: start line → finish line; race ends when player crosses the finish line.
 */

export type RacePhase = 'intro' | 'countdown' | 'racing' | 'finished';

export interface RacePlayerState {
  /** Unique id for this racer (local or remote). */
  id: string;
  /** For remote players: position/rotation could be synced here. */
  position?: { x: number; y: number; z: number };
}

export interface RaceState {
  phase: RacePhase;
  /** All players in this race (for multiplayer). */
  players: Record<string, RacePlayerState>;
  /** Local player id (key into players). */
  localPlayerId: string;
  /** Race start time (seconds since load) when phase moved to 'racing'. */
  startTime: number | null;
  /** Race end time when phase moved to 'finished'. */
  endTime: number | null;
  /** Current time used for display (updated each frame when racing). */
  currentTime: number;
}

export const RACE_CONFIG = {
  /** Start line Z: kart starts just behind this. */
  START_LINE_Z: -5,
  /** Finish line Z: crossing this (t.z >= FINISH_LINE_Z) ends the race. */
  FINISH_LINE_Z: 195,
  /** Track length (Z extent from start to finish line). */
  TRACK_LENGTH: 200,
  /** Half-width of track (X extent ± TRACK_HALF_WIDTH). */
  TRACK_HALF_WIDTH: 20,
  /** Extra grass/ground (units) before the start line. */
  ROOM_BEFORE_START: 25,
  /** Extra grass/ground (units) after the finish line so the player can cross it. */
  ROOM_AFTER_FINISH: 25,
  /** Intro + countdown duration in seconds (camera anim + 3 red lights then GO). */
  INTRO_DURATION: 4,
  /** Seconds to show final time before returning to menu. */
  FINISHED_VIEW_TIME: 3,
} as const;
