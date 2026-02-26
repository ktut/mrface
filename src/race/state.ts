import type { RaceState, RacePlayerState } from './types';

/** Create initial race state for a single local player (multiplayer can add more players later). */
export function createInitialRaceState(localPlayerId: string): RaceState {
  const player: RacePlayerState = {
    id: localPlayerId,
  };
  return {
    phase: 'intro',
    players: { [localPlayerId]: player },
    localPlayerId,
    startTime: null,
    endTime: null,
    currentTime: 0,
  };
}

/** Get local player from race state. */
export function getLocalPlayer(state: RaceState): RacePlayerState | undefined {
  return state.players[state.localPlayerId];
}
