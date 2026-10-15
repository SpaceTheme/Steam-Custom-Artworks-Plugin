import { sleep } from 'millennium';
import { useEffect, useState } from 'react';
import { renderPreview, type Color, type Preview } from './render';
import { getPreviewGame } from './sync';

// Color previews for the settings: rendered locally from one game of the library, nothing is
// applied to Steam. Cached for the session, so switching back and forth is instant.

const cache = new Map<string, Promise<Preview | null>>();

function previewFor(color: Color, size: 'small' | 'full'): Promise<Preview | null> {
	const key = `${size}|${color.background}|${color.text}|${color.divider}|${color.shadow}`;
	let preview = cache.get(key);
	if (!preview) {
		preview = getPreviewGame()
			.then((game) => (game ? renderPreview(game, color, size) : null))
			.catch((err): null => {
				cache.delete(key);
				console.log('[Steam-Custom-Artworks] Preview failed:', err);
				return null;
			});
		cache.set(key, preview);
	}
	return preview;
}

/** Small capsule previews for every color (rendered one after another to keep Steam responsive). */
export function useSmallPreviews(colors: Color[]): Record<string, string> {
	const [previews, setPreviews] = useState<Record<string, string>>({});
	useEffect(() => {
		let cancelled = false;
		(async () => {
			for (const color of colors) {
				if (cancelled) return;
				const preview = await previewFor(color, 'small');
				if (preview && !cancelled) setPreviews((current) => ({ ...current, [color.id]: preview.capsule }));
				await sleep(20);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [colors]);
	return previews;
}

/** Capsule, header and hero preview of one color. */
export function useFullPreview(color: Color | undefined): Preview | null {
	const [preview, setPreview] = useState<Preview | null>(null);
	useEffect(() => {
		if (!color) return undefined;
		let cancelled = false;
		previewFor(color, 'full').then((result) => !cancelled && setPreview(result));
		return () => {
			cancelled = true;
		};
	}, [color?.background, color?.text, color?.divider, color?.shadow]);
	return preview;
}
