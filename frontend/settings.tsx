import { ConfirmModal, DialogButton, Dropdown, Field, findClassModule, ProgressBar, showModal, Toggle, usePluginConfig } from 'millennium';
import { useEffect, useState, type MouseEvent, type ReactNode } from 'react';
import { CONFIG, REPO_URL } from './constants';
import { useFullPreview, useSmallPreviews } from './preview';
import type { Color, Preview } from './render';
import { syncStore, useSyncState, type SyncState } from './store';
import { loadColors, removeArtworks, setColor, syncArtworks } from './sync';

// Same class Steam puts on its settings buttons; the hashed name changes between Steam builds.
const settingsButtonClass = (findClassModule((m) => m.SettingsDialogButton && m.SettingsDialogSubHeader) || {}).SettingsDialogButton;

/** Same markup as a section in Steam's settings, e.g. Settings → In Game → "The Steam Overlay". */
const Section = ({ title, children }: { title: string; children: ReactNode }) => (
	<div role="region" className="DialogControlsSection DialogLabelledControlsSection DialogSettingsSection">
		<div role="heading" aria-level={3} className="SettingsDialogSubHeader">
			{title}
		</div>
		{children}
	</div>
);

const SettingsButton = ({ children, disabled, onClick }: { children: ReactNode; disabled?: boolean; onClick: (e: MouseEvent) => void }) => (
	<DialogButton className={settingsButtonClass} disabled={disabled} onClick={onClick}>
		{children}
	</DialogButton>
);

function formatBytes(bytes: number) {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function lastCheckText(state: SyncState) {
	switch (state.phase) {
		case 'checking':
			return 'Checking for new artworks…';
		case 'downloading':
			return `Rendering ${state.done} of ${state.total}…`;
		case 'removing':
			return 'Removing artworks…';
	}
	if (state.error) return `Last check failed: ${state.error}`;
	return state.lastCheck ? `Last checked at ${new Date(state.lastCheck).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Not checked yet';
}

/** Dropdown entry: small rendered capsule of the preview game + name */
const ColorOption = ({ color, thumbnail }: { color: Color; thumbnail?: string }) => (
	<span className="sca-color-option" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
		{thumbnail ? (
			<img src={thumbnail} style={{ width: 32, height: 48, borderRadius: 3, objectFit: 'cover' }} />
		) : (
			<span style={{ width: 32, height: 48, borderRadius: 3, background: color.background }} />
		)}
		{color.name}
	</span>
);

const ColorLabel = ({ color }: { color: Color }) => (
	<span>
		<span
			style={{
				display: 'inline-block',
				width: 12,
				height: 12,
				marginRight: 8,
				verticalAlign: -1,
				borderRadius: 3,
				background: color.background,
				boxShadow: `inset 0 0 0 2px ${color.text}, 2px 2px 0 0 ${color.shadow}`,
			}}
		/>
		{color.name}
	</span>
);

function confirmRemove(e: MouseEvent) {
	showModal(
		<ConfirmModal
			strTitle="Remove all artworks?"
			strDescription="Steam's default artwork is restored for every game this plugin changed. You can download the artworks again at any time."
			strOKButtonText="Remove"
			bDestructiveWarning
			onOK={() => removeArtworks()}
		/>,
		(e.currentTarget as HTMLElement).ownerDocument.defaultView ?? window,
		{ strTitle: 'Remove all artworks', popupWidth: 500, popupHeight: 260 },
	);
}

/**
 * Capsule on the left, header and hero stacked on the right (like the README image).
 * Sizes are fractions of one 1732 × 900 layout, so every image keeps its aspect ratio at any width:
 * capsule 600 × 900, header and hero 1108 wide, 24 units gap.
 */
const PreviewGrid = ({ color, preview }: { color: Color; preview: Preview | null }) => {
	const tile = (src: string | undefined, area: string) =>
		src ? (
			<img src={src} style={{ gridArea: area, width: '100%', height: '100%', display: 'block', borderRadius: 8 }} />
		) : (
			<div style={{ gridArea: area, borderRadius: 8, background: color.background, opacity: 0.5 }} />
		);
	return (
		<div
			style={{
				display: 'grid',
				gridTemplateColumns: '600fr 1108.4fr',
				gridTemplateRows: '518.06fr 357.94fr',
				gridTemplateAreas: '"capsule header" "capsule hero"',
				columnGap: `${(24 / 1732.4) * 100}%`,
				rowGap: `${(24 / 900) * 100}%`,
				aspectRatio: '1732.4 / 900',
				width: '100%',
				maxWidth: 720,
			}}
		>
			{tile(preview?.capsule, 'capsule')}
			{tile(preview?.header, 'header')}
			{tile(preview?.hero, 'hero')}
		</div>
	);
};

/**
 * Choosing a color only changes the preview; "Apply" renders the library again in it.
 * The previews are rendered locally from one game of the library.
 */
const AppearanceSection = ({ state, busy }: { state: SyncState; busy: boolean }) => {
	const current = state.colorId ?? state.colors[0]?.id;
	const [choice, setChoice] = useState<string | undefined>(undefined);
	const shownId = choice ?? current;
	const shown = state.colors.find((c) => c.id === shownId) ?? state.colors[0];
	const thumbnails = useSmallPreviews(state.colors);
	const preview = useFullPreview(shown);

	return (
		<Section title="Appearance">
			<Field label="Artwork color" description="Pick a color to preview it below.">
				<Dropdown
					rgOptions={state.colors.map((color) => ({ data: color.id, label: <ColorOption color={color} thumbnail={thumbnails[color.id]} /> }))}
					selectedOption={shownId}
					disabled={!state.colors.length}
					onChange={(option) => setChoice(option.data)}
					contextMenuPositionOptions={{ bMatchWidth: false }}
					renderButtonValue={() => (shown ? <ColorLabel color={shown} /> : null)}
				/>
			</Field>
			<Field childrenLayout="below">
				<div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
					<div style={{ marginBottom: 8, opacity: 0.7 }}>Preview</div>
					{shown && <PreviewGrid color={shown} preview={preview} />}
				</div>
			</Field>
			<Field
				label="Apply color"
				description={shownId === current ? 'This color is in use.' : 'Renders all artworks of your library again in this color.'}
			>
				<SettingsButton
					disabled={busy || !shownId || shownId === current}
					onClick={() => {
						setChoice(undefined);
						if (shownId) setColor(shownId);
					}}
				>
					Apply
				</SettingsButton>
			</Field>
		</Section>
	);
};

export const SettingsContent = () => {
	const state = useSyncState();
	const [autoUpdate, setAutoUpdate] = usePluginConfig<boolean>(CONFIG.autoUpdate);
	const busy = state.phase !== 'idle';
	const counted = state.collection !== null;

	// The color list normally arrives with the first check; load it here if the page opens earlier
	useEffect(() => {
		if (!syncStore.get().colors.length) loadColors().then((colors) => syncStore.set({ colors }));
	}, []);

	return (
		<>
			<Section title="Status">
				<Field
					label="Installed artworks"
					description={
						state.phase === 'downloading' ? (
							<>
								{lastCheckText(state)}
								<div style={{ marginTop: 8, width: '100%' }}>
									<ProgressBar nProgress={state.total ? (state.done / state.total) * 100 : 0} nTransitionSec={0.3} />
								</div>
							</>
						) : (
							lastCheckText(state)
						)
					}
				>
					{counted ? `${state.installedCount} / ${state.ownedCount}` : '–'}
				</Field>
				<Field label="Storage used" description="Disk space the artworks of this plugin take up in Steam's grid folder.">
					{state.storageBytes === null ? '–' : formatBytes(state.storageBytes)}
				</Field>
			</Section>

			<AppearanceSection state={state} busy={busy} />

			<Section title="Updates">
				<Field label="Update artworks automatically">
					<Toggle value={autoUpdate !== false} onChange={(checked) => setAutoUpdate(checked)} />
				</Field>
				<Field label="Check for updates">
					<SettingsButton disabled={busy} onClick={() => syncArtworks({ manual: true })}>
						Check now
					</SettingsButton>
				</Field>
				<Field label="Reinstall all artworks">
					<SettingsButton disabled={busy} onClick={() => syncArtworks({ manual: true, reinstall: true })}>
						Reinstall
					</SettingsButton>
				</Field>
			</Section>

			<Section title="Artworks">
				<Field label="Request an artwork" description="Or right-click a game in your library.">
					<SettingsButton onClick={() => SteamClient.System.OpenInSystemBrowser(REPO_URL)}>Open GitHub</SettingsButton>
				</Field>
				<Field label="Remove all artworks" description="Restore Steam's default artwork for all games?">
					<SettingsButton disabled={busy} onClick={confirmRemove}>
						Remove
					</SettingsButton>
				</Field>
			</Section>
		</>
	);
};
