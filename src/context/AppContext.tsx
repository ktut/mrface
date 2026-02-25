import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import * as THREE from 'three';

const STORAGE_KEY = 'mrface-app';

export interface CharacterEntry {
  id: string;
  name: string;
  headGroup: THREE.Group;
  thumbnailUrl: string;
}

interface StoredState {
  selectedCharacterIndex: number;
  helmetHue: number;
  selectedGameId: string | null;
  charactersMeta: { id: string; name: string; thumbnailUrl: string }[];
}

function loadStored(): Partial<StoredState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<StoredState>;
  } catch {
    return {};
  }
}

function saveStored(state: StoredState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

interface AppContextValue {
  characters: CharacterEntry[];
  selectedCharacterIndex: number;
  selectedCharacter: CharacterEntry | null;
  helmetHue: number;
  selectedGameId: string | null;
  setCharacters: React.Dispatch<React.SetStateAction<CharacterEntry[]>>;
  selectCharacter: (index: number) => void;
  setHelmetHue: (hue: number) => void;
  setSelectedGameId: (id: string | null) => void;
  addCharacter: (entry: CharacterEntry) => void;
  updateCharacter: (index: number, updates: Partial<Pick<CharacterEntry, 'name'>>) => void;
  deleteCharacter: (index: number) => void;
  /** Clamp selectedCharacterIndex after characters change. */
  clampedSelectedIndex: number;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

interface AppProviderProps {
  children: ReactNode;
  initialCharacters?: CharacterEntry[];
  initialSelectedIndex?: number;
  initialHelmetHue?: number;
}

export function AppProvider({
  children,
  initialCharacters = [],
  initialSelectedIndex = 0,
  initialHelmetHue = 220,
}: AppProviderProps) {
  const [characters, setCharactersState] = useState<CharacterEntry[]>(initialCharacters);
  const [selectedCharacterIndex, setSelectedCharacterIndexState] = useState(initialSelectedIndex);
  const [helmetHue, setHelmetHueState] = useState(initialHelmetHue);
  const [selectedGameId, setSelectedGameIdState] = useState<string | null>(null);

  const setCharacters = useCallback((action: React.SetStateAction<CharacterEntry[]>) => {
    setCharactersState(action);
  }, []);

  const selectCharacter = useCallback(
    (index: number) => {
      if (index < 0 || index >= characters.length) return;
      setSelectedCharacterIndexState(index);
    },
    [characters.length],
  );

  const setHelmetHue = useCallback((hue: number) => {
    setHelmetHueState(Math.max(0, Math.min(360, hue)));
  }, []);

  const setSelectedGameId = useCallback((id: string | null) => {
    setSelectedGameIdState(id);
  }, []);

  const addCharacter = useCallback((entry: CharacterEntry) => {
    setCharactersState((prev) => [...prev, entry]);
    setSelectedCharacterIndexState(characters.length);
  }, [characters.length]);

  const updateCharacter = useCallback(
    (index: number, updates: Partial<Pick<CharacterEntry, 'name'>>) => {
      if (index < 0 || index >= characters.length) return;
      setCharactersState((prev) =>
        prev.map((c, i) => (i === index ? { ...c, ...updates } : c)),
      );
    },
    [characters.length],
  );

  const deleteCharacter = useCallback(
    (index: number) => {
      if (index < 0 || index >= characters.length) return;
      setCharactersState((prev) => prev.filter((_, i) => i !== index));
      setSelectedCharacterIndexState((prev) => {
        if (prev === index) return Math.max(0, index - 1);
        return prev > index ? prev - 1 : prev;
      });
    },
    [characters.length],
  );

  const selectedCharacter = useMemo(
    () =>
      characters.length > 0 && selectedCharacterIndex >= 0 && selectedCharacterIndex < characters.length
        ? characters[selectedCharacterIndex]
        : null,
    [characters, selectedCharacterIndex],
  );

  // Persist to localStorage (only serializable data)
  useEffect(() => {
    const meta = characters.map((c) => ({ id: c.id, name: c.name, thumbnailUrl: c.thumbnailUrl }));
    saveStored({
      selectedCharacterIndex,
      helmetHue,
      selectedGameId,
      charactersMeta: meta,
    });
  }, [characters, selectedCharacterIndex, helmetHue, selectedGameId]);

  // Restore from localStorage on mount (only indices and meta; headGroups stay in memory from session)
  useEffect(() => {
    const stored = loadStored();
    if (stored.helmetHue != null) setHelmetHueState(stored.helmetHue);
    if (stored.selectedGameId !== undefined) setSelectedGameIdState(stored.selectedGameId);
    if (stored.selectedCharacterIndex != null && stored.charactersMeta?.length) {
      setSelectedCharacterIndexState(
        Math.min(stored.selectedCharacterIndex, stored.charactersMeta.length - 1),
      );
    }
    // We do NOT restore characters from localStorage here because headGroup cannot be
    // serialized. Character list is built during this session (upload/test photo).
  }, []);

  const clampedSelectedIndex =
    characters.length === 0 ? 0 : Math.min(selectedCharacterIndex, characters.length - 1);

  const value = useMemo<AppContextValue>(
    () => ({
      characters,
      selectedCharacterIndex,
      selectedCharacter,
      helmetHue,
      selectedGameId,
      setCharacters,
      selectCharacter,
      setHelmetHue,
      setSelectedGameId,
      addCharacter,
      updateCharacter,
      deleteCharacter,
      clampedSelectedIndex,
    }),
    [
      characters,
      selectedCharacterIndex,
      selectedCharacter,
      helmetHue,
      selectedGameId,
      setCharacters,
      selectCharacter,
      setHelmetHue,
      setSelectedGameId,
      addCharacter,
      updateCharacter,
      deleteCharacter,
      clampedSelectedIndex,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
