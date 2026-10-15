import { ProgressBar, toaster } from 'millennium';
import { useSyncState } from './store';

const TITLE = 'Steam-Custom-Artworks';

export const Logo = () => (
	<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
		<rect x="3" y="3" width="18" height="18" rx="2" />
		<circle cx="8.5" cy="8.5" r="1.5" />
		<path d="m21 15-5-5L5 21" />
	</svg>
);

/** Lives inside the toast and follows the download progress. */
const ProgressBody = () => {
	const { done, total, failed, current } = useSyncState();
	const percent = total ? Math.round((done / total) * 100) : 0;
	return (
		<div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 220 }}>
			<div>
				{done} / {total} artworks
				{failed > 0 && ` · ${failed} failed`}
			</div>
			<ProgressBar nProgress={percent} nTransitionSec={0.3} />
			{current && <div style={{ opacity: 0.6, fontSize: '0.9em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current}</div>}
		</div>
	);
};

function toast(data: Parameters<typeof toaster.toast>[0]): ReturnType<typeof toaster.toast> | null {
	try {
		return toaster.toast({ logo: <Logo />, icon: <Logo />, ...data });
	} catch (err) {
		console.error('[Steam-Custom-Artworks] Could not show notification:', err);
		return null;
	}
}

/**
 * Shows the progress toast until close() is called.
 *
 * Millennium's dismiss() only removes a toast from the notification tray; the popup stays
 * until its duration runs out. Steam's own long-running toasts instead set
 * fnNotificationResolved, which the toast window polls and then hides the popup itself.
 */
export function showProgressToast() {
	let finished = false;
	const marker = `sca-progress-${Date.now()}`; // MobX may wrap the data, so match by a unique class name
	const notification = toast({ title: TITLE, body: <ProgressBody />, className: marker, duration: 24 * 60 * 60 * 1000, playSound: false });
	try {
		const entry = window.NotificationStore?.m_rgNotificationToasts?.find((e: any) => e?.data?.className === marker);
		if (entry) entry.fnNotificationResolved = () => finished;
	} catch (err) {
		console.error('[Steam-Custom-Artworks] Could not attach to the progress notification:', err);
	}
	return {
		close() {
			finished = true;
			notification?.dismiss();
		},
	};
}

export function showFinishedToast(message: string) {
	return toast({ title: TITLE, body: message, duration: 6000 });
}
