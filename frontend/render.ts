import { ARTWORKS, DEFAULT_COLOR, FONT_CSS_URL, LOGO_ASSET_TYPE, TEMPLATE_CSS_URL, TEMPLATE_HTML_URL } from './constants';

// Renders the artworks inside Steam from the repository's template (templates/index.css +
// index.html.mustache), the same files GitHub used to screenshot. The HTML is drawn through an
// SVG <foreignObject> onto a canvas, so nothing has to be rendered or stored on GitHub.

export interface Color {
	id: string;
	name: string;
	background: string;
	/** title, publisher and date */
	text: string;
	/** line between title and image */
	divider: string;
	/** offset shadow under the image */
	shadow: string;
}

export interface ArtworkInfo {
	name: string;
	publisher: string;
	release: string;
	/** data: URL of the source image (artworks/<publisher>/<appId>/imageSource.*) */
	image: string;
}

export interface RenderedAsset {
	assetType: number;
	blob: Blob;
}

interface Template {
	css: string;
	html: string;
}

const IMAGE_PLACEHOLDER = 'sca-image-placeholder';

async function fetchText(url: string) {
	const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
	if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
	return res.text();
}

export function blobToDataUrl(blob: Blob): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result));
		reader.onerror = () => reject(reader.error);
		reader.readAsDataURL(blob);
	});
}

function escapeHtml(text: string) {
	return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

function safeColor(value: string, fallback: string) {
	return /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
}

// The font has to be inside the SVG, an SVG image can't load anything from outside
async function loadFontCss() {
	let css = await fetchText(FONT_CSS_URL);
	for (const url of [...new Set(css.match(/https:[^)'"]+\.woff2/g) ?? [])]) {
		const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
		if (!res.ok) throw new Error(`HTTP ${res.status} for the artwork font`);
		css = css.split(url).join(await blobToDataUrl(await res.blob()));
	}
	return css;
}

async function loadTemplate(): Promise<Template> {
	const [css, html, fontCss] = await Promise.all([fetchText(TEMPLATE_CSS_URL), fetchText(TEMPLATE_HTML_URL), loadFontCss()]);
	// The page-level html/body rules size the screenshot page; for a single artwork the
	// body rule (font, color, layout) moves to the wrapper element.
	const artworkCss = css.replace(/html\s*,\s*body\s*\{[^}]*\}/, '').replace(/\bbody\s*\{/, '.sca-body {');
	return { css: `${fontCss}\n${artworkCss}`, html };
}

let templateCache: Promise<Template> | null = null;

/** Loads the template once per sync, so design changes in the repository are picked up. */
export function resetTemplate() {
	templateCache = null;
}

function getTemplate() {
	templateCache ??= loadTemplate().catch((err) => {
		templateCache = null;
		throw err;
	});
	return templateCache;
}

async function renderSvg(svg: string, width: number, height: number): Promise<Blob> {
	const image = new Image();
	image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
	await image.decode();
	const canvas = new OffscreenCanvas(width, height);
	canvas.getContext('2d')!.drawImage(image, 0, 0, width, height);
	// WebP keeps the files small; Steam accepts it like the WebP files in grid.zip
	return canvas.convertToBlob({ type: 'image/webp', quality: 0.9 });
}

let logoCache: Promise<Blob> | null = null;
function transparentLogo() {
	if (!logoCache) {
		const canvas = new OffscreenCanvas(1, 1);
		canvas.getContext('2d'); // convertToBlob needs a rendering context, even for an empty canvas
		logoCache = canvas.convertToBlob({ type: 'image/png' }).catch((err) => {
			logoCache = null;
			throw err;
		});
	}
	return logoCache;
}

/** Renders the given template elements of one game in one color. */
async function renderElements(info: ArtworkInfo, color: Color, artworks: typeof ARTWORKS): Promise<RenderedAsset[]> {
	const template = await getTemplate();
	// Same placeholders scripts/process-issue.js fills with Mustache
	const values: Record<string, string> = {
		APP_NAME: escapeHtml(info.name),
		APP_PUBLISHER: escapeHtml(info.publisher),
		APP_RELEASE: escapeHtml(info.release),
	};
	const filled = template.html
		.replace(/\{\{(APP_NAME|APP_PUBLISHER|APP_RELEASE)\}\}/g, (_, key: string) => values[key])
		.replace(/(\.\/)?\{\{IMAGE_NAME\}\}/g, IMAGE_PLACEHOLDER);
	const doc = new DOMParser().parseFromString(filled, 'text/html');
	const background = safeColor(color.background, DEFAULT_COLOR.background);
	const text = safeColor(color.text, DEFAULT_COLOR.text);
	const divider = safeColor(color.divider, text);
	const shadow = safeColor(color.shadow, text);

	const assets: RenderedAsset[] = [];
	for (const { element, width, height, assetType } of artworks) {
		const node = doc.getElementById(element);
		if (!node) throw new Error(`#${element} is missing in templates/index.html.mustache`);
		node.setAttribute('style', `width:${width}px;height:${height}px`);
		// XHTML, because the content of an SVG has to be well-formed XML
		const xhtml = new XMLSerializer().serializeToString(node).split(IMAGE_PLACEHOLDER).join(info.image);
		const svg =
			`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><foreignObject width="100%" height="100%">` +
			`<div xmlns="http://www.w3.org/1999/xhtml" class="sca-body" style="padding:0;gap:0;width:${width}px;height:${height}px;` +
			`--artwork-background:${background};--artwork-text:${text};--artwork-divider:${divider};--artwork-shadow:${shadow}">` +
			`<style><![CDATA[${template.css}]]></style>${xhtml}</div></foreignObject></svg>`;
		assets.push({ assetType, blob: await renderSvg(svg, width, height) });
	}
	return assets;
}

/** Renders capsule, header and hero of one game, plus the transparent logo. */
export async function renderArtwork(info: ArtworkInfo, color: Color): Promise<RenderedAsset[]> {
	const assets = await renderElements(info, color, ARTWORKS);
	assets.push({ assetType: LOGO_ASSET_TYPE, blob: await transparentLogo() });
	return assets;
}

export interface Preview {
	/** object URLs of the rendered images (only capsule for the small dropdown preview) */
	capsule: string;
	header?: string;
	hero?: string;
}

const PREVIEW_ELEMENTS = { small: ['grid'], full: ['grid', 'p', 'hero'] };

/** Renders a preview of one game in one color; nothing is applied to Steam. */
export async function renderPreview(info: ArtworkInfo, color: Color, size: keyof typeof PREVIEW_ELEMENTS): Promise<Preview> {
	const artworks = ARTWORKS.filter((a) => PREVIEW_ELEMENTS[size].includes(a.element));
	const [capsule, header, hero] = (await renderElements(info, color, artworks)).map((asset) => URL.createObjectURL(asset.blob));
	return { capsule, header, hero };
}
