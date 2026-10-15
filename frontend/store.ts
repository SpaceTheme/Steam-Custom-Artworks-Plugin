import { useEffect, useReducer } from 'react';
import type { Color } from './render';

export interface SyncState {
	phase: 'idle' | 'checking' | 'downloading' | 'removing';
	/** appId → render key of every artwork in the collection, null until the manifest was loaded */
	collection: Record<string, string> | null;
	/** colors from templates/colors.json and the chosen one */
	colors: Color[];
	colorId: string | null;
	/** artworks of games in the library that are installed / available */
	installedCount: number;
	ownedCount: number;
	/** disk space of the installed artworks in bytes, null until known */
	storageBytes: number | null;
	total: number;
	done: number;
	failed: number;
	current: string;
	lastCheck: number | null;
	error: string | null;
}

type Listener = () => void;

function createStore<T extends object>(initial: T) {
	let state = initial;
	const listeners = new Set<Listener>();
	return {
		get: () => state,
		set(patch: Partial<T>) {
			state = { ...state, ...patch };
			listeners.forEach((listener) => listener());
		},
		subscribe(listener: Listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}

export const syncStore = createStore<SyncState>({
	phase: 'idle',
	collection: null,
	colors: [],
	colorId: null,
	installedCount: 0,
	ownedCount: 0,
	storageBytes: null,
	total: 0,
	done: 0,
	failed: 0,
	current: '',
	lastCheck: null,
	error: null,
});

/** Re-renders the component whenever the sync state changes. */
export function useSyncState(): SyncState {
	const [, rerender] = useReducer((x: number) => x + 1, 0);
	useEffect(() => syncStore.subscribe(rerender), []);
	return syncStore.get();
}
