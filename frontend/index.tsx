import { definePlugin, pluginConfig } from 'millennium';
import { CHECK_INTERVAL_MS, CONFIG } from './constants';
import { installStyles, removeGamepageStyle } from './gamepage';
import { patchContextMenu } from './menu';
import { SettingsContent } from './settings';
import { syncArtworks } from './sync';
import { Logo } from './toast';

async function isAutoUpdateEnabled() {
	return (await pluginConfig.get<boolean>(CONFIG.autoUpdate).catch((): undefined => undefined)) !== false;
}

export default definePlugin(() => {
	installStyles();
	// Without automatic updates only the list is loaded, so the context menu still knows which games have an artwork.
	const autoSync = async () => syncArtworks({ download: await isAutoUpdateEnabled() });
	autoSync();
	const interval = setInterval(autoSync, CHECK_INTERVAL_MS);
	const unpatchMenu = patchContextMenu();

	return {
		title: 'Steam-Custom-Artworks',
		icon: <Logo />,
		content: <SettingsContent />,
		onDismount: () => {
			clearInterval(interval);
			unpatchMenu.then((unpatch) => unpatch());
			removeGamepageStyle();
		},
	};
});
