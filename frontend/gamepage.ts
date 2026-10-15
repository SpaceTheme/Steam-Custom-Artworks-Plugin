import { findClassModule } from 'millennium';

// Makes the custom artworks look right on the game page and the downloads page, with or without
// a Steam theme (same rules as options/library/customArtwork.css in SpaceTheme/Steam):
// - Steam's own logo is hidden on top of a custom hero (the artwork has the title already)
// - the hero is shown completely (scaled to fit, centered) instead of cropped
// - the space around it gets the artwork color picked in the plugin settings
//
// Steam's class names are hashed and change between builds, so they are looked up at runtime.

const STYLE_ID = 'steam-custom-artworks-gamepage';
const log = (...args: unknown[]) => console.log('[Steam-Custom-Artworks]', ...args);

type ClassModule = Record<string, string>;

function lookup(filter: (m: ClassModule) => boolean): ClassModule | null {
	try {
		return (findClassModule(filter as (m: any) => boolean) as ClassModule) || null;
	} catch {
		return null;
	}
}

/** ".a.b" for a class value (CSS module values can hold several classes) */
function sel(module: ClassModule | null, name: string): string | null {
	const value = module?.[name];
	return value ? `.${value.trim().split(/\s+/).join('.')}` : null;
}

function buildCss(background: string): string {
	// Game page header: hero (TopCapsule › ImgContainer › img.ImgSrc) + logo (TitleLogo)
	const header = lookup((m) => !!(m.TopCapsule && m.ImgSrc && m.TitleLogo && m.ImgContainer));
	// Downloads page: hero + logo of the active download
	const downloads = lookup((m) => !!(m.HeroAndLogo && m.HeroContainer && m.HeaderImage && m.HeroGradient));
	const libraryImage = lookup((m) => !!(m.PortraitImage && m.LandscapeImage && m.CustomImage && m.Image && m.Container));
	const downloadsPage = lookup((m) => !!(m.DownloadGraph && m.DownloadsPage));
	// Shared library view (playbar option of the SpaceTheme theme)
	const sharedLibrary = lookup((m) => !!(m.SharedLibrary && m.PlayBar));

	const custom = '[src*="/customimages/"]';
	const rules: string[] = [];

	const topCapsule = sel(header, 'TopCapsule');
	const imgSrc = sel(header, 'ImgSrc');
	const imgContainer = sel(header, 'ImgContainer');
	const titleLogo = sel(header, 'TitleLogo');
	const loaded = sel(header, 'Loaded');
	if (topCapsule && imgSrc && imgContainer) {
		const hasCustomHero = `${topCapsule}:has(img${imgSrc}${custom})`;
		if (titleLogo) rules.push(`${hasCustomHero} ${titleLogo}${loaded ?? ''} { display: none !important; }`);
		rules.push(`${imgContainer}:has(img${imgSrc}${custom}) { background-color: ${background} !important; }`);
		// Without a theme Steam makes the image container taller than the visible header (for its
		// scroll effect), which cuts off the bottom of a fitted hero; keep it at the header height.
		rules.push(`${topCapsule} ${imgContainer}:has(img${imgSrc}${custom}) { height: 100% !important; }`);
		rules.push(`${topCapsule} img${imgSrc}${custom} {
	width: auto !important;
	height: auto !important;
	max-width: 100% !important;
	max-height: 100% !important;
	margin: auto;
}`);
		const sharedLibrarySel = sel(sharedLibrary, 'SharedLibrary');
		rules.push(`@container style(--st-option-playbarInBanner: on) {
	body ${hasCustomHero} ${imgContainer} { box-sizing: border-box; padding-bottom: calc(16px + 56px + 16px); }
	${sharedLibrarySel ? `body:has(${sharedLibrarySel}) ${hasCustomHero} ${imgContainer} { box-sizing: border-box; padding-bottom: calc(16px + 56px + 56px + 16px); }` : ''}
}`);
	}

	const heroAndLogo = sel(downloads, 'HeroAndLogo');
	const heroContainer = sel(downloads, 'HeroContainer');
	const headerImage = sel(downloads, 'HeaderImage');
	const heroGradient = sel(downloads, 'HeroGradient');
	const graphAndStats = sel(downloads, 'GraphAndStats');
	const image = sel(libraryImage, 'Image');
	const container = sel(libraryImage, 'Container');
	const downloadGraph = sel(downloadsPage, 'DownloadGraph');
	if (heroAndLogo && image) {
		const customImage = `img${image}${custom}`;
		if (container) rules.push(`${heroAndLogo}:has(${customImage}) ${container}:has(img[src*="/assets/"]) { display: none !important; }`);
		if (graphAndStats && downloadGraph) rules.push(`${graphAndStats}${downloadGraph}:has(${customImage}) { background-color: ${background} !important; }`);
		if (heroContainer) rules.push(`${heroAndLogo} ${heroContainer}:has(${customImage}) { -webkit-mask-image: none !important; }`);
		if (headerImage) rules.push(`${heroAndLogo} ${headerImage}:has(${customImage}) { height: -webkit-fill-available !important; }`);
		rules.push(`${heroAndLogo} ${customImage} {
	width: auto !important;
	height: auto !important;
	max-width: unset !important;
	max-height: 100% !important;
	margin: auto;
}`);
		if (heroContainer && heroGradient) {
			rules.push(`${heroAndLogo} ${heroContainer}:has(${customImage}) ${heroGradient} {
	top: unset;
	bottom: 0;
	left: unset;
	right: 0;
	height: 46px;
	width: 110px;
	background: none;
	background-color: ${background} !important;
	mix-blend-mode: unset;
}`);
		}
	}

	if (!rules.length) log('Game page classes not found, artwork layout fixes are disabled');
	return rules.join('\n\n');
}

// Plugin UI rules, needed before the first check: the color dropdown would otherwise be as narrow
// as its button (horizontal scrollbar without a theme) and as tall as all entries together.
// The list itself scrolls, not the positioning container around it.
const UI_CSS = `
/* Repeated classes raise the specificity above themes that size Steam's dropdowns themselves */
.DialogMenuPosition.DialogMenuPosition.DialogMenuPosition:has(.sca-color-option) {
	max-height: none !important;
	overflow: visible !important;
}
.DialogMenuPosition.DialogMenuPosition.DialogMenuPosition:has(.sca-color-option) > ._DialogInputContainer._DialogInputContainer._DialogInputContainer {
	max-height: min(480px, 70vh) !important;
	overflow-x: hidden !important;
	overflow-y: auto !important;
}
.sca-color-option { white-space: nowrap; }
`;

let gamepageCss = '';
let css = UI_CSS;
let unsubscribe: (() => void) | null = null;

function applyTo(doc: Document | undefined) {
	if (!doc?.head) return;
	let style = doc.getElementById(STYLE_ID) as HTMLStyleElement | null;
	if (!style) {
		style = doc.createElement('style');
		style.id = STYLE_ID;
		doc.head.appendChild(style);
	}
	if (style.textContent !== css) style.textContent = css;
}

function popups(): any[] {
	const manager = (window as any).g_PopupManager;
	try {
		return manager ? [...manager.GetPopups()] : [];
	} catch {
		return [];
	}
}

/** Adds the plugin's styles to every Steam window (and windows opened later). */
export function installStyles() {
	css = UI_CSS + gamepageCss;
	for (const popup of popups()) applyTo(popup?.m_popup?.document);

	if (!unsubscribe) {
		const manager = (window as any).g_PopupManager;
		const onCreated = (popup: any) => applyTo(popup?.m_popup?.document);
		const result = manager?.AddPopupCreatedCallback?.(onCreated);
		unsubscribe = () => (typeof result?.Unregister === 'function' ? result.Unregister() : typeof result === 'function' ? result() : undefined);
	}
}

/**
 * Adds or updates the game page layout fixes.
 * @param background the artwork background color from the plugin settings
 */
export function updateGamepageStyle(background: string) {
	gamepageCss = buildCss(/^#[0-9a-f]{3,8}$/i.test(background) ? background : '#CCC1A1');
	installStyles();
}

/** Removes the layout fixes again (plugin disabled). */
export function removeGamepageStyle() {
	unsubscribe?.();
	unsubscribe = null;
	for (const popup of popups()) popup?.m_popup?.document?.getElementById(STYLE_ID)?.remove();
}
