import { getRelease, torrentUrl, type Category, type ReleaseDetail, type ReleaseFile } from "../api.ts";
import { parseMediaInfo, formatValue, type MediaInfoSection } from "../mediainfo.ts";
import { el, formatDate, toast, categoryLabel, formatBytes } from "../utils.ts";

// Fields we like to surface in each card
const VIDEO_KEYS = [
	"Format",
	"Width",
	"Height",
	"Display aspect ratio",
	"Frame rate",
	"Bit rate",
	"Stream size",
	"Bit depth",
	"Color space",
	"Chroma subsampling",
	"Writing library",
];
const AUDIO_KEYS = ["Format", "Channel(s)", "Sampling rate", "Bit rate", "Stream size", "Language", "Default", "Forced", "Commentary"];
const TEXT_KEYS = ["Format", "Language", "Title", "Stream size", "Default", "Forced", "Hearing impaired", "Commentary"];
const GENERAL_KEYS = [
	"Complete name",
	"Source",
	"File size",
	"Duration",
	"Overall bit rate",
	"Frame rate",
	"Encoded date",
	"Encoded by",
	"Encoder",
	"RABBIT_ENCODER/VERSION",
	"RABBIT_ENCODER/SETTINGS",
	"LANGUAGE_DETECTOR/VERSION",
];

const DISPLAY_NAMES: Record<string, string> = {
	"Complete name": "File",
	SOURCE: "Source",
	"LANGUAGE_DETECTOR/VERSION": "Language Detector",
	"RABBIT_ENCODER/VERSION": "Rabbit Encoder Version",
	"RABBIT_ENCODER/SETTINGS": "Rabbit Encoder Settings",
};

export async function renderDetail(app: HTMLElement, category: Category, id: number): Promise<void> {
	app.replaceChildren(el("div", { className: "loading-screen", text: "Loading…" }));

	try {
		const release = await getRelease(category, id);
		const info = parseMediaInfo(release.mediainfo);

		// Header
		const titleParts = [release.title];
		if (release.year) titleParts.push(`(${release.year})`);
		if (release.season) titleParts.push(`- ${release.season}`);

		const backLink = el("a", {
			className: "back-link",
			attrs: { href: `/${release.category}`, "data-link": "true" },
			text: `← Back to ${categoryLabel(release.category)}`,
		});

		const metaChildren: (HTMLElement | string)[] = [
			categoryLabel(release.category),
			el("span", { className: "dot", text: "·" }),
			`Uploaded ${formatDate(release.uploaded_at)}`,
		];

		const downloadBtn = el("a", {
			className: "download-btn",
			attrs: {
				href: torrentUrl(release.category, release.id),
				download: `${release.torrent_name}.torrent`,
			},
			children: ["⬇ Download .torrent"],
		});

		const magnetBtn = el("button", {
			className: "magnet-btn",
			attrs: { type: "button" },
			text: "🧲 Copy magnet",
		}) as HTMLButtonElement;

		if (!release.magnet) {
			magnetBtn.disabled = true;
			magnetBtn.title = "Magnet link unavailable for this release";
		}

		magnetBtn.addEventListener("click", async () => {
			if (!release.magnet) return;
			const restore = () => {
				magnetBtn.disabled = false;
				magnetBtn.textContent = "🧲 Copy magnet";
			};
			magnetBtn.disabled = true;
			try {
				await navigator.clipboard.writeText(release.magnet);
				magnetBtn.textContent = "✓ Copied";
				toast("Magnet link copied to clipboard", "success");
				setTimeout(restore, 1800);
			} catch (err) {
				const msg = err instanceof Error ? err.message : "Could not copy magnet link";
				toast(msg, "error");
				restore();
			}
		});

		const tagRow = el("div", {
			className: "rc-tags",
			attrs: { style: "margin-top: 8px;" },
			children: release.tags.map((tag, i) => el("span", { className: i === 0 ? "tag accent" : "tag", text: tag })),
		});

		const header = el("div", {
			className: "detail-header",
			children: [
				el("h1", { text: titleParts.join(" ") }),
				el("div", { className: "detail-meta", children: metaChildren }),
				tagRow,
				el("div", {
					className: "button-row",
					attrs: { style: "margin-top: 20px;" },
					children: [downloadBtn, magnetBtn],
				}),
			],
		});

		// Season nav (only when the group has more than one release)
		const seasonNav =
			release.group.length > 1
				? el("div", {
						className: "season-nav",
						children: [
							el("span", { className: "season-nav-label", text: "Seasons:" }),
							...release.group.map((g) =>
								el("a", {
									className: g.id === release.id ? "season-chip current" : "season-chip",
									attrs: {
										href: `/${release.category}/${g.id}`,
										"data-link": "true",
									},
									text: g.season ?? "Release",
								}),
							),
						],
					})
				: null;

		// Tracker stats (seeders / leechers / completed)
		const trackerStats = buildTrackerStats(release);

		// File list from the .torrent
		const filesCard = buildFilesCard(release.files);

		// ----- Build cards grouped by type -----
		const generalVideoCards: HTMLElement[] = [];

		// General card
		if (info.general) {
			generalVideoCards.push(buildCard("📄 General", info.general, GENERAL_KEYS));
		}

		// Video cards
		info.video.forEach((v, i) => {
			const suffix = info.video.length > 1 ? ` #${i + 1}` : "";
			generalVideoCards.push(buildCard(`🎞️ Video${suffix}`, v, VIDEO_KEYS));
		});

		// Audio cards
		const audioCards = info.audio.map((a, i) => {
			const lang = a.fields.find((f) => f.key === "Language")?.value;
			const label = info.audio.length > 1 ? ` #${i + 1}` : "";
			const title = `🔊 Audio${label}`;
			return buildCard(title, a, AUDIO_KEYS, lang);
		});

		// Subtitles (Text) cards
		const textCards = info.text.map((t, i) => {
			const lang = t.fields.find((f) => f.key === "Language")?.value;
			const label = info.text.length > 1 ? ` #${i + 1}` : "";
			return buildCard(`💬 Subtitles${label}`, t, TEXT_KEYS, lang);
		});

		// ----- Create separate grids -----
		const generalVideoGrid = generalVideoCards.length ? el("div", { className: "info-grid", children: generalVideoCards }) : null;

		const audioGrid = audioCards.length ? el("div", { className: "info-grid", children: audioCards }) : null;

		const textGrid = textCards.length ? el("div", { className: "info-grid", children: textCards }) : null;

		// Chapters if present
		const chaptersCard = info.menu.length > 0 ? buildChaptersCard(info.menu[0]!) : null;

		// Raw mediainfo
		const rawDetails = el("details", {
			className: "mediainfo-raw",
			children: [el("summary", { text: "View raw MediaInfo" }), el("pre", { text: release.mediainfo })],
		});

		// Assemble main content
		const children: (HTMLElement | null)[] = [
			backLink,
			header,
			trackerStats,
			seasonNav,
			generalVideoGrid,
			audioGrid,
			textGrid,
			chaptersCard,
			filesCard,
			rawDetails,
		];
		app.replaceChildren(...(children.filter(Boolean) as HTMLElement[]));
	} catch (err) {
		const msg = err instanceof Error ? err.message : "Failed to load release";
		app.replaceChildren(
			el("div", {
				className: "empty",
				children: [
					el("div", { className: "empty-icon", text: "⚠️" }),
					el("div", { text: msg }),
					el("div", {
						attrs: { style: "margin-top: 16px;" },
						children: [
							el("a", {
								attrs: { href: `/${category}`, "data-link": "true" },
								text: `← Back to ${categoryLabel(category)}`,
							}),
						],
					}),
				],
			}),
		);
		toast(msg, "error");
	}
}

function buildCard(title: string, section: MediaInfoSection, preferredKeys: string[], langFlag?: string): HTMLElement {
	const rows: HTMLElement[] = [];
	const seen = new Set<string>();

	const getDisplayName = (rawKey: string): string => {
		const upperKey = rawKey.toUpperCase();
		for (const [orig, display] of Object.entries(DISPLAY_NAMES)) {
			if (orig.toUpperCase() === upperKey) return display;
		}
		return rawKey;
	};

	for (const key of preferredKeys) {
		const field = section.fields.find((f) => f.key.toLowerCase() === key.toLowerCase());
		if (!field || !field.value) continue;
		seen.add(field.key.toLowerCase());

		// Extract filename from full path for "Complete name"
		let displayValue = field.value;
		if (field.key.toLowerCase() === "complete name") {
			const parts = field.value.split(/[/\\]/);
			displayValue = parts.pop() || field.value;
		}

		rows.push(
			el("div", {
				className: "info-row",
				children: [
					el("span", { className: "label", text: getDisplayName(field.key) }),
					el("span", { className: "value", text: formatValue(field.key, displayValue) }),
				],
			}),
		);
	}

	if (rows.length === 0) {
		// Fall back to showing the first few fields
		for (const field of section.fields.slice(0, 6)) {
			rows.push(
				el("div", {
					className: "info-row",
					children: [
						el("span", { className: "label", text: getDisplayName(field.key) }),
						el("span", {
							className: "value",
							text: formatValue(field.key, field.value),
						}),
					],
				}),
			);
		}
	}

	const headerChildren: (string | HTMLElement)[] = [title];
	if (langFlag) {
		headerChildren.push(el("span", { className: "lang-flag", text: langFlag }));
	}

	return el("div", {
		className: "info-card",
		children: [el("h3", { children: headerChildren }), ...rows],
	});
}

function buildChaptersCard(menu: MediaInfoSection): HTMLElement {
	const rows = menu.fields.map((f) =>
		el("div", {
			className: "info-row",
			children: [
				el("span", {
					className: "label",
					attrs: { style: "font-family: var(--font-mono);" },
					text: f.key,
				}),
				el("span", {
					className: "value",
					attrs: { style: "font-family: inherit; text-align: left;" },
					text: f.value.replace(/^[a-z]{2}:/, ""),
				}),
			],
		}),
	);

	return el("div", {
		className: "info-card",
		attrs: { style: "grid-column: 1 / -1;" },
		children: [el("h3", { text: "🎬 Chapters" }), ...rows],
	});
}

function buildTrackerStats(release: ReleaseDetail): HTMLElement | null {
	const hasAny = release.seeders !== null || release.leechers !== null || release.completed !== null || release.last_scraped_at !== null;
	if (!hasAny) return null;

	const stat = (icon: string, label: string, value: number | null, variant: string): HTMLElement =>
		el("div", {
			className: `tracker-stat tracker-stat-${variant}`,
			children: [
				el("span", { className: "tracker-stat-icon", text: icon }),
				el("div", {
					className: "tracker-stat-body",
					children: [
						el("span", {
							className: "tracker-stat-value",
							text: value === null ? "—" : value.toLocaleString(),
						}),
						el("span", { className: "tracker-stat-label", text: label }),
					],
				}),
			],
		});

	const grid = el("div", {
		className: "tracker-stats",
		children: [
			stat("🡅", "Seeders", release.seeders, "seed"),
			stat("🡇", "Leechers", release.leechers, "leech"),
			stat("✓", "Downloaded", release.completed, "done"),
		],
	});

	const footerChildren: (HTMLElement | string)[] =
		release.last_scraped_at !== null ? [`Tracker stats updated ${formatDate(release.last_scraped_at)}`] : ["Tracker stats have not been scraped yet"];

	const footer = el("div", {
		className: "tracker-stats-footer",
		children: footerChildren,
	});

	return el("div", {
		className: "tracker-stats-wrapper",
		children: [grid, footer],
	});
}

function buildFilesCard(files: ReleaseFile[]): HTMLElement | null {
	if (!files || files.length === 0) return null;

	const totalSize = files.reduce((sum, f) => sum + (Number.isFinite(f.length) ? f.length : 0), 0);

	const rows = files.map((file) => {
		const fullPath = Array.isArray(file.path) ? file.path.join("/") : String(file.path ?? "");
		return el("li", {
			className: "file-row",
			children: [
				el("span", {
					className: "file-name",
					text: fullPath,
					attrs: { title: fullPath },
				}),
				el("span", { className: "file-size", text: formatBytes(file.length) }),
			],
		});
	});

	const countLabel = files.length === 1 ? "1 file" : `${files.length.toLocaleString()} files`;

	const summary = el("summary", {
		children: [
			el("span", {
				className: "files-summary-left",
				children: [el("span", { className: "files-summary-caret" }), el("span", { className: "files-summary-title", text: "📁 Files" })],
			}),
			el("span", {
				className: "files-summary-meta",
				text: `${countLabel} · ${formatBytes(totalSize)}`,
			}),
		],
	});

	const attrs: Record<string, string> = {};
	attrs.open = "";

	return el("details", {
		className: "files-card",
		attrs,
		children: [summary, el("ul", { className: "file-list", children: rows })],
	});
}
