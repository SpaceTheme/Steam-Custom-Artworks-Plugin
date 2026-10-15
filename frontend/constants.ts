export const REPO_URL = 'https://github.com/SpaceTheme/Steam-Custom-Artworks';

// Everything is read straight from the repository; raw.githubusercontent.com allows
// cross-origin requests, so Steam's UI can fetch from it directly.
export const RAW_URL = 'https://raw.githubusercontent.com/SpaceTheme/Steam-Custom-Artworks/main';
export const MANIFEST_URL = `${RAW_URL}/artworks/manifest.json`; // scripts/build-manifest.js
export const ARTWORKS_URL = `${RAW_URL}/artworks`;
export const TEMPLATE_CSS_URL = `${RAW_URL}/templates/index.css`;
export const TEMPLATE_HTML_URL = `${RAW_URL}/templates/index.html.mustache`;
export const COLORS_URL = `${RAW_URL}/templates/colors.json`;
export const FONT_CSS_URL = 'https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@600;900&display=block';

export const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Rendering runs on Steam's UI thread, so only a few games at a time
export const PARALLEL_RENDERS = 2;

// Elements of templates/index.html.mustache → size and SteamClient ELibraryAssetType
export const ARTWORKS = [
	{ element: 'grid', width: 600, height: 900, assetType: 0 }, // Capsule (portrait)
	{ element: 'p', width: 920, height: 430, assetType: 3 }, // Header (wide)
	{ element: 'hero', width: 3840, height: 1240, assetType: 1 }, // Hero
];
export const LOGO_ASSET_TYPE = 2; // transparent logo, hides Steam's logo on top of the hero

export const DEFAULT_COLOR = { id: 'sand', name: 'Sand (default)', background: '#CCC1A1', text: '#161616', divider: '#161616', shadow: '#161616' };

export const CONFIG = {
	installed: 'installed', // JSON: Record<appId, render key> of the artworks this plugin applied
	autoUpdate: 'autoUpdate',
	color: 'color', // id from templates/colors.json
	sizes: 'sizes', // JSON: Record<appId, bytes> the plugin's files of each game take up on disk
};
