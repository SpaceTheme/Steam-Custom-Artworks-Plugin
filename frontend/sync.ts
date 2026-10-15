import { pluginConfig, sleep } from 'millennium';
import { ARTWORKS, ARTWORKS_URL, COLORS_URL, CONFIG, DEFAULT_COLOR, LOGO_ASSET_TYPE, MANIFEST_URL, PARALLEL_RENDERS } from './constants';
import { updateGamepageStyle } from './gamepage';
import { blobToDataUrl, renderArtwork, resetTemplate, type ArtworkInfo, type Color } from './render';
import { syncStore } from './store';
import { showFinishedToast, showProgressToast } from './toast';

interface ManifestEntry {
	name: string;
	publisher: string;
	release: string;
	/** path below artworks/, e.g. "Valve/570/imageSource.webp" */
	image: string;
	rev: string;
}

interface Manifest {
	schema: number;
	template: string;
	apps: Record<string, ManifestEntry>;
}

/** appId → render key (artwork revision + template + colors) of the artwork the plugin applied */
type Installed = Record<string, string>;
/** appId → bytes of the files the plugin wrote for the game */
type Sizes = Record<string, number>;

const ALL_ASSET_TYPES = [...ARTWORKS.map((a) => a.assetType), LOGO_ASSET_TYPE];

const log = (...args: unknown[]) => console.log('[Steam-Custom-Artworks]', ...args);

// Timeouts so a dead connection can't block the sync (and the settings buttons) forever.
async function fetchJson(url: string) {
	const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
	if (!res.ok) throw new Error(`HTTP ${res.status}`);
	return res.json();
}

let lastManifest: Manifest | null = null;

async function loadManifest(): Promise<Manifest> {
	const manifest = await fetchJson(MANIFEST_URL).catch((err) => {
		throw new Error(`Could not load the artwork list (${err.message})`);
	});
	if (manifest?.schema !== 2 || typeof manifest.apps !== 'object') {
		throw new Error('Unsupported artwork list - please update the plugin');
	}
	lastManifest = manifest;
	return manifest;
}

/** Colors from templates/colors.json, so new colors don't need a plugin update. */
export async function loadColors(): Promise<Color[]> {
	try {
		const colors = await fetchJson(COLORS_URL);
		const valid: Color[] = [];
		for (const c of Array.isArray(colors) ? colors : []) {
			if (!c || typeof c.id !== 'string' || typeof c.name !== 'string' || typeof c.background !== 'string') continue;
			// "foreground" is the older single text/shadow color; a missing divider or shadow uses the text color
			const text = typeof c.text === 'string' ? c.text : typeof c.foreground === 'string' ? c.foreground : null;
			if (!text) continue;
			const divider = typeof c.divider === 'string' ? c.divider : text;
			const shadow = typeof c.shadow === 'string' ? c.shadow : typeof c.foreground === 'string' ? c.foreground : text;
			valid.push({ id: c.id, name: c.name, background: c.background, text, divider, shadow });
		}
		return valid.length ? valid : [DEFAULT_COLOR];
	} catch (err) {
		log('Could not load the colors:', err);
		return [DEFAULT_COLOR];
	}
}

async function getColor(colors: Color[]): Promise<Color> {
	const id = await pluginConfig.get<string>(CONFIG.color).catch((): undefined => undefined);
	return colors.find((c) => c.id === id) ?? colors[0];
}

function renderKey(entry: ManifestEntry, manifest: Manifest, color: Color) {
	return `${entry.rev}.${manifest.template}.${color.background}${color.text}${color.divider}${color.shadow}`;
}

// Stored as JSON strings, pluginConfig.set(key, value) only takes strings.
async function getJson<T extends object>(key: string): Promise<T> {
	try {
		const parsed = JSON.parse((await pluginConfig.get<string>(key)) || '{}');
		return parsed && typeof parsed === 'object' ? parsed : ({} as T);
	} catch {
		return {} as T;
	}
}

const getInstalled = () => getJson<Installed>(CONFIG.installed);
const getSizes = () => getJson<Sizes>(CONFIG.sizes);

function saveInstalled(installed: Installed, sizes: Sizes) {
	return Promise.all([pluginConfig.set(CONFIG.installed, JSON.stringify(installed)), pluginConfig.set(CONFIG.sizes, JSON.stringify(sizes))]);
}

function getOverview(appId: string) {
	const overview = window.appStore?.GetAppOverviewByAppID(Number(appId)) as any;
	return overview && !overview.BIsModOrShortcut?.() ? overview : null;
}

/** Whether Steam currently has a custom capsule for the game (it may have been removed outside the plugin). */
function hasCustomArtwork(overview: any) {
	try {
		return window.appStore.GetCustomVerticalCapsuleURLs(overview).length > 0;
	} catch {
		return true; // can't tell - trust the stored state
	}
}

function needsUpdate(appId: string, key: string, installed: Installed) {
	const overview = getOverview(appId);
	return Boolean(overview) && (installed[appId] !== key || !hasCustomArtwork(overview));
}

/** Waits until Steam has loaded the library, otherwise owned games look missing. */
async function waitForLibrary(timeoutMs = 120_000) {
	const start = Date.now();
	let lastSize = -1;
	while (Date.now() - start < timeoutMs) {
		const size: number = (window.appStore as any)?.m_mapApps?.size ?? 0;
		if (size > 0 && size === lastSize) return;
		lastSize = size;
		await sleep(2000);
	}
}

function blobToBase64(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const url = String(reader.result);
			resolve(url.slice(url.indexOf('base64,') + 7));
		};
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

// The rendered files are WebP (smaller than PNG). Steam displays them fine,
// but if it ever refuses one, convert it to a real PNG and try again.
async function toPng(blob: Blob): Promise<Blob> {
	const bitmap = await createImageBitmap(blob);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
	return canvas.convertToBlob({ type: 'image/png' });
}

/** @returns the size of the file Steam wrote */
async function setArtwork(appId: number, blob: Blob, assetType: number): Promise<number> {
	try {
		await SteamClient.Apps.SetCustomArtworkForApp(appId, await blobToBase64(blob), 'png', assetType);
		return blob.size;
	} catch (err) {
		log(`Retrying ${appId} (asset ${assetType}) as PNG:`, err);
		const png = await toPng(blob);
		await SteamClient.Apps.SetCustomArtworkForApp(appId, await blobToBase64(png), 'png', assetType);
		return png.size;
	}
}

/** Name, publisher, release date and the source image (as data: URL) of one game */
async function loadArtworkInfo(entry: ManifestEntry): Promise<ArtworkInfo> {
	const imageUrl = `${ARTWORKS_URL}/${entry.image.split('/').map(encodeURIComponent).join('/')}?v=${entry.rev}`;
	const res = await fetch(imageUrl, { signal: AbortSignal.timeout(60_000) });
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${entry.image}`);
	return { name: entry.name, publisher: entry.publisher, release: entry.release, image: await blobToDataUrl(await res.blob()) };
}

/** @returns the bytes written for the game */
async function applyArtwork(appId: string, entry: ManifestEntry, color: Color): Promise<number> {
	// Render everything first, so a game never ends up with half old, half new artwork.
	const assets = await renderArtwork(await loadArtworkInfo(entry), color);
	let bytes = 0;
	for (const { assetType, blob } of assets) {
		bytes += await setArtwork(Number(appId), blob, assetType);
	}
	return bytes;
}

/** Size of a game's custom files as Steam serves them (for artworks installed before sizes were stored). */
async function measureArtwork(appId: string): Promise<number | null> {
	const overview = getOverview(appId);
	if (!overview) return null;
	const store = window.appStore as any;
	let bytes = 0;
	for (const getUrls of ['GetCustomVerticalCapsuleURLs', 'GetCustomLandcapeImageURLs', 'GetCustomHeroImageURLs', 'GetCustomLogoImageURLs']) {
		// Each asset is listed once per possible extension; only one of them exists
		for (const url of (store[getUrls]?.(overview) as string[] | undefined) ?? []) {
			const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10_000) }).catch((): null => null);
			if (!res?.ok) continue;
			bytes += (await res.blob()).size;
			break;
		}
	}
	return bytes;
}

/** Fills in missing sizes and shows the disk space of all installed artworks. */
async function updateStorage() {
	const [installed, sizes] = await Promise.all([getInstalled(), getSizes()]);
	const missing = Object.keys(installed).filter((id) => typeof sizes[id] !== 'number');
	if (missing.length) {
		log(`Measuring ${missing.length} artworks`);
		const worker = async () => {
			for (let appId = missing.shift(); appId; appId = missing.shift()) {
				const bytes = await measureArtwork(appId);
				if (bytes !== null) sizes[appId] = bytes;
			}
		};
		await Promise.all(Array.from({ length: 4 }, worker));
		// Sizes of games that are no longer installed are dropped
		await pluginConfig.set(CONFIG.sizes, JSON.stringify(Object.fromEntries(Object.keys(installed).filter((id) => id in sizes).map((id) => [id, sizes[id]]))));
	}
	syncStore.set({ storageBytes: Object.keys(installed).reduce((sum, id) => sum + (sizes[id] ?? 0), 0) });
}

function countStatus(collection: Record<string, string>, installed: Installed) {
	const owned = Object.keys(collection).filter((id) => getOverview(id));
	return {
		ownedCount: owned.length,
		installedCount: owned.filter((id) => !needsUpdate(id, collection[id], installed)).length,
	};
}

let running = false;

/**
 * Renders missing and changed artworks for all games in the library.
 * @param manual show a notification even if nothing changed or the check failed
 * @param reinstall render everything again
 * @param download false = only load the artwork list and update the status
 */
export async function syncArtworks({ manual = false, reinstall = false, download = true } = {}) {
	if (running) return;
	running = true;
	syncStore.set({ phase: 'checking', error: null });
	let progress: ReturnType<typeof showProgressToast> | null = null;

	try {
		await waitForLibrary();
		resetTemplate();
		const [manifest, installed, sizes, colors] = await Promise.all([loadManifest(), getInstalled(), getSizes(), loadColors()]);
		const color = await getColor(colors);
		updateGamepageStyle(color.background);
		if (reinstall) Object.keys(installed).forEach((id) => delete installed[id]);

		// appId → the render key it should have with the current template and color
		const collection = Object.fromEntries(Object.entries(manifest.apps).map(([id, entry]) => [id, renderKey(entry, manifest, color)]));
		const queue = Object.keys(collection).filter((id) => needsUpdate(id, collection[id], installed));
		const status = countStatus(collection, installed);
		const storedBytes = () => Object.keys(installed).reduce((sum, id) => sum + (sizes[id] ?? 0), 0);
		syncStore.set({ collection, colors, colorId: color.id, lastCheck: Date.now(), ...status, storageBytes: storedBytes() });
		log(`${queue.length} artworks to render (color: ${color.id})`);

		if (!download) return;
		if (!queue.length) {
			if (manual) showFinishedToast('All artworks are up to date.');
			return;
		}

		syncStore.set({ phase: 'downloading', total: queue.length, done: 0, failed: 0, current: '' });
		progress = showProgressToast();
		let updated = 0;
		let failed = 0;
		let unsaved = 0;

		const worker = async () => {
			for (let appId = queue.shift(); appId; appId = queue.shift()) {
				syncStore.set({ current: getOverview(appId)?.display_name ?? appId });
				try {
					sizes[appId] = await applyArtwork(appId, manifest.apps[appId], color);
					installed[appId] = collection[appId];
					updated++;
					// Every game in the queue needed an update, so each finished one counts as installed now
					syncStore.set({ installedCount: status.installedCount + updated, storageBytes: storedBytes() });
					if (++unsaved >= 10) {
						unsaved = 0;
						await saveInstalled(installed, sizes);
					}
				} catch (err) {
					failed++;
					log(`Failed to apply artwork for ${appId}:`, err);
				}
				syncStore.set({ done: updated + failed, failed });
				await sleep(30); // rendering runs on Steam's UI thread, give it room to breathe
			}
		};
		await Promise.all(Array.from({ length: PARALLEL_RENDERS }, worker));
		await saveInstalled(installed, sizes);

		progress.close();
		progress = null;
		syncStore.set(countStatus(collection, installed));
		showFinishedToast(
			`${updated} artwork${updated === 1 ? '' : 's'} updated` +
				(failed ? ` · ${failed} failed, retrying on the next check` : ''),
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log('Sync failed:', err);
		syncStore.set({ error: message });
		if (manual) showFinishedToast(`Update failed: ${message}`);
	} finally {
		progress?.close(); // also when the sync failed halfway
		await updateStorage().catch((err) => log('Could not measure the artworks:', err));
		running = false;
		syncStore.set({ phase: 'idle', current: '' });
	}
}

/** Removes every artwork this plugin has applied and restores Steam's default ones. */
export async function removeArtworks() {
	if (running) return;
	running = true;
	syncStore.set({ phase: 'removing' });
	try {
		const [installed, sizes] = await Promise.all([getInstalled(), getSizes()]);
		const total = Object.keys(installed).length;
		for (const appId of Object.keys(installed)) {
			for (const assetType of ALL_ASSET_TYPES) {
				await SteamClient.Apps.ClearCustomArtworkForApp(Number(appId), assetType).catch((err: unknown) =>
					log(`Failed to clear ${appId} (asset ${assetType}):`, err),
				);
			}
			// Saved per game, so an interrupted removal never leaves games marked as installed.
			delete installed[appId];
			delete sizes[appId];
			await saveInstalled(installed, sizes);
		}
		syncStore.set({ installedCount: 0, storageBytes: 0 });
		showFinishedToast(`Removed ${total} artworks.`);
	} finally {
		running = false;
		syncStore.set({ phase: 'idle' });
	}
}

/** Saves the chosen color and renders all artworks again in it. */
export async function setColor(id: string) {
	await pluginConfig.set(CONFIG.color, id);
	syncStore.set({ colorId: id });
	const color = syncStore.get().colors.find((c) => c.id === id);
	if (color) updateGamepageStyle(color.background); // the game page follows right away
	await syncArtworks({ manual: true });
}

let previewGame: Promise<ArtworkInfo | null> | null = null;

/** The game used for the color previews: the most recently played game in the library that has an artwork. */
export function getPreviewGame(): Promise<ArtworkInfo | null> {
	previewGame ??= (async () => {
		const manifest = lastManifest ?? (await loadManifest());
		const lastPlayed = (id: string) => Number(getOverview(id)?.rt_last_time_played) || 0;
		const owned = Object.keys(manifest.apps).filter((id) => getOverview(id));
		const appId = owned.sort((a, b) => lastPlayed(b) - lastPlayed(a))[0] ?? Object.keys(manifest.apps)[0];
		return appId ? loadArtworkInfo(manifest.apps[appId]) : null;
	})().catch((err) => {
		previewGame = null;
		throw err;
	});
	return previewGame;
}

export function hasArtwork(appId: number): boolean {
	return Boolean(syncStore.get().collection?.[String(appId)]);
}
