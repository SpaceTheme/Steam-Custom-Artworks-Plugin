import { afterPatch, fakeRenderComponent, findModuleExport, MenuItem, sleep } from 'millennium';
import { createElement, Fragment } from 'react';
import { REPO_URL } from './constants';
import { hasArtwork } from './sync';

const log = (...args: unknown[]) => console.log('[Steam-Custom-Artworks]', ...args);

/** Opens the request issue form with the App ID already filled in (new or replace is detected by the bot). */
function openRequest(appId: number) {
	const query = new URLSearchParams({ template: 'ARTWORK.yml', app_id: String(appId) });
	SteamClient.System.OpenInSystemBrowser(`${REPO_URL}/issues/new?${query}`);
}

/** @param apps the apps the context menu was opened for */
function renderArtworkMenuItem(apps: unknown) {
	if (!Array.isArray(apps) || apps.length !== 1) return null;
	const app = apps[0];
	if (!app || typeof app.appid !== 'number' || app.BIsModOrShortcut?.()) return null;

	const exists = hasArtwork(app.appid);
	return (
		<MenuItem key="steam-custom-artworks" onSelected={() => openRequest(app.appid)}>
			{exists ? 'Change artwork' : 'Request artwork'}
		</MenuItem>
	);
}

/**
 * Steam's library context menu is a class component that is only exported through a small wrapper:
 *   function W(props) { ...; return jsx(LibraryContextMenu, { navigator, instance, ...props }) }
 * Fake-rendering the wrapper returns that element, whose type is the menu class.
 */
function findLibraryContextMenu(): any {
	const isMenuWrapper = (exp: any) => {
		if (typeof exp !== 'function') return false;
		const src = Function.prototype.toString.call(exp);
		if (!/navigator:[\w$]+,instance:[\w$]+,\.\.\.[\w$]+/.test(src)) return false;
		try {
			return Boolean(fakeRenderComponent(exp)?.type?.prototype?.BuildManageSubmenu);
		} catch {
			return false;
		}
	};
	const wrapper = findModuleExport(isMenuWrapper);
	return wrapper ? fakeRenderComponent(wrapper).type : null;
}

/**
 * Adds "Request artwork" / "Change artwork" right after the "Manage" submenu.
 * Patched at runtime, so it works without Millennium's file hooking.
 * @returns a function that removes the patch
 */
export async function patchContextMenu(): Promise<() => void> {
	for (let attempt = 0; attempt < 10; attempt++) {
		const LibraryContextMenu = findLibraryContextMenu();
		if (LibraryContextMenu) {
			const patch = afterPatch(LibraryContextMenu.prototype, 'BuildManageSubmenu', (args: any[], ret: any) => {
				const item = renderArtworkMenuItem(args[0]);
				return item ? createElement(Fragment, null, ret, item) : ret;
			});
			log('Context menu patched');
			return () => patch.unpatch();
		}
		await sleep(3000);
	}
	log('Could not find the library context menu, the "Request artwork" item is disabled');
	return () => {};
}
