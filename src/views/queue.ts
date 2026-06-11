import { getEncoderQueue, type PublicEncoder, type PublicQueueGroup } from "../api.ts";
import { el, toast } from "../utils.ts";

const REFRESH_MS = 10_000;
const TICK_MS = 500;

let refreshTimer: ReturnType<typeof setInterval> | null = null;
let tickTimer: ReturnType<typeof setInterval> | null = null;

export async function renderQueue(app: HTMLElement, brand: string): Promise<void> {
	// Clear any timers left over from a previous mount of this page.
	stopRefresh();

	app.replaceChildren(
		el("h1", { className: "page-title", text: "Encoding Queue" }),
		el("p", {
			className: "page-sub",
			text: "What's currently being encoded and what's coming next. Estimates are approximate.",
		}),
		el("div", { className: "queue-root", children: [el("div", { className: "loading-screen", text: "Loading…" })] }),
	);

	const root = app.querySelector<HTMLElement>(".queue-root")!;

	const load = async (silent: boolean) => {
		try {
			const data = await getEncoderQueue();

			if (!data.enabled) {
				root.replaceChildren(emptyState("🛠️", "Encoder status is not configured.", `Ask the ${brand} admin to enable it.`));
				stopRefresh();
				return;
			}

			if (data.encoders.length === 0) {
				root.replaceChildren(emptyState("📭", "No encoders are being tracked yet.", "Check back soon."));
				return;
			}

			root.replaceChildren(...data.encoders.map((enc) => encoderSection(enc)));
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to load queue";
			if (!silent) {
				root.replaceChildren(emptyState("⚠️", msg, "Retrying automatically…"));
				toast(msg, "error");
			}
		}
	};

	await load(false);

	// Auto-refresh data while this page is mounted; stop once the user leaves.
	refreshTimer = setInterval(() => {
		if (!document.body.contains(root)) {
			stopRefresh();
			return;
		}
		void load(true);
	}, REFRESH_MS);

	// Tick the "updated Xs ago" labels between fetches so they stay accurate.
	// This only rewrites text from a stored timestamp — no network, no re-render.
	tickTimer = setInterval(() => {
		if (!document.body.contains(root)) {
			stopRefresh();
			return;
		}
		refreshTimestamps(root);
	}, TICK_MS);
}

function refreshTimestamps(root: HTMLElement): void {
	for (const node of root.querySelectorAll<HTMLElement>(".enc-updated[data-ts]")) {
		const ts = Number(node.dataset.ts);
		if (Number.isFinite(ts)) node.textContent = `updated ${relativeTime(ts)}`;
	}
}

function stopRefresh(): void {
	if (refreshTimer) {
		clearInterval(refreshTimer);
		refreshTimer = null;
	}
	if (tickTimer) {
		clearInterval(tickTimer);
		tickTimer = null;
	}
}

function encoderSection(enc: PublicEncoder): HTMLElement {
	const statusDot = el("span", {
		className: `enc-dot ${enc.online ? "is-online" : "is-offline"}`,
		attrs: { title: enc.online ? "Online" : "Offline — showing last known data" },
	});

	const titleRow = el("div", {
		className: "enc-title",
		children: [statusDot, el("span", { className: "enc-name", text: enc.name })],
	});

	const badges: HTMLElement[] = [];
	if (enc.paused) badges.push(el("span", { className: "enc-badge is-paused", text: "Paused" }));
	if (!enc.online) badges.push(el("span", { className: "enc-badge is-offline", text: "Offline" }));
	if (enc.lastUpdated) {
		badges.push(
			el("span", {
				className: "enc-updated",
				text: `updated ${relativeTime(enc.lastUpdated)}`,
				attrs: { "data-ts": String(enc.lastUpdated) },
			}),
		);
	}

	const header = el("div", {
		className: "enc-header",
		children: [titleRow, el("div", { className: "enc-header-right", children: badges })],
	});

	const stats = el("div", {
		className: "enc-stats",
		children: [
			statChip("encoding", enc.totals.encoding, "Encoding"),
			statChip("queued", enc.totals.queued, "Queued"),
			statChip("done", enc.totals.done, "Done"),
			enc.totals.error > 0 ? statChip("error", enc.totals.error, "Failed") : null,
			enc.etaMs !== null ? el("span", { className: "enc-eta", children: ["~", el("strong", { text: formatDurationShort(enc.etaMs) }), " remaining"] }) : null,
		].filter(Boolean) as HTMLElement[],
	});

	const body =
		enc.groups.length > 0
			? el("div", { className: "queue-grid", children: enc.groups.map((g) => groupCard(g)) })
			: el("div", {
					className: "queue-idle",
					text: enc.online ? "Idle — nothing in the queue right now." : "No data available.",
				});

	return el("section", { className: `enc-section${enc.online ? "" : " is-offline"}`, children: [header, stats, body] });
}

function statChip(kind: string, count: number, label: string): HTMLElement {
	return el("span", {
		className: `enc-stat enc-stat-${kind}`,
		children: [el("strong", { text: String(count) }), ` ${label}`],
	});
}

function groupCard(g: PublicQueueGroup): HTMLElement {
	const titleLine = el("h3", { className: "qc-title", text: g.title });

	const metaChildren: (HTMLElement | string)[] = [];
	if (g.completed) metaChildren.push(el("span", { className: "qc-complete-badge", text: "✓ Completed" }));
	if (g.season) metaChildren.push(el("span", { className: "qc-season", text: g.season }));
	metaChildren.push(el("span", { className: "qc-count", text: `${g.total} ${g.total === 1 ? "episode" : "episodes"}` }));

	const bar = el("div", {
		className: "qc-bar",
		children: [
			el("div", {
				className: `qc-bar-fill${g.active ? " is-active" : ""}${g.completed ? " is-complete" : ""}`,
				attrs: { style: `width:${g.progress}%` },
			}),
		],
	});

	const footChildren: (HTMLElement | string)[] = [];
	if (g.encoding > 0) footChildren.push(el("span", { className: "qc-tag is-encoding", text: `${g.encoding} encoding` }));
	if (g.queued > 0) footChildren.push(el("span", { className: "qc-tag is-queued", text: `${g.queued} queued` }));
	if (g.done > 0) footChildren.push(el("span", { className: "qc-tag is-done", text: `${g.done} done` }));
	if (g.error > 0) footChildren.push(el("span", { className: "qc-tag is-error", text: `${g.error} failed` }));

	const eta = el("span", {
		className: "qc-eta",
		text: g.completed ? "awaiting upload" : g.etaMs !== null ? `~${formatDurationShort(g.etaMs)} left` : "—",
	});

	return el("div", {
		className: `queue-card${g.active ? " is-active" : ""}${g.completed ? " is-complete" : ""}`,
		children: [
			titleLine,
			el("div", { className: "qc-meta", children: metaChildren }),
			bar,
			el("div", {
				className: "qc-foot",
				children: [el("div", { className: "qc-tags", children: footChildren }), eta],
			}),
		],
	});
}

function emptyState(icon: string, title: string, detail: string): HTMLElement {
	return el("div", {
		className: "empty",
		children: [el("div", { className: "empty-icon", text: icon }), el("div", { text: title }), el("div", { className: "page-sub", text: detail })],
	});
}

function formatDurationShort(ms: number): string {
	const sec = Math.floor(ms / 1000);
	const d = Math.floor(sec / 86400);
	const h = Math.floor((sec % 86400) / 3600);
	const m = Math.floor((sec % 3600) / 60);
	if (d > 0) return `${d}d ${h}h`;
	if (h > 0) return `${h}h ${m}m`;
	if (m > 0) return `${m}m`;
	return `${sec}s`;
}

function relativeTime(ts: number): string {
	const diff = Math.max(0, Date.now() - ts);
	const sec = Math.floor(diff / 1000);
	if (sec < 1) return "just now";
	if (sec < 60) return `${sec}s ago`;
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const h = Math.floor(min / 60);
	return `${h}h ago`;
}
