import {
	getEpisodeMediainfo,
	getMediaManifest,
	getRelease,
	torrentUrl,
	type Category,
	type MediaEpisode,
	type ReleaseDetail,
	type ReleaseFile,
} from "../api.ts";
import { parseMediaInfo, formatValue, type MediaInfoSection, getField } from "../mediainfo.ts";
import { decodeRabbitSettings, looksLikeSettingsCode, type DecodedSettings } from "../rabbit-settings.ts";
import { el, formatDate, toast, categoryLabel, formatBytes } from "../utils.ts";
import { mountComments } from "./comments.ts";
import { buildScreenshotsCard } from "./media.ts";

// Fields we like to surface in each card

const SERVICE_KIND_KEYS = ["Hearing impaired", "Visually impaired", "Text descriptions", "Original", "Commentary"];

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
	...SERVICE_KIND_KEYS,
];
const AUDIO_KEYS = ["Format", "Channel(s)", "Sampling rate", "Bit rate", "Stream size", "Language", "Default", "Forced", ...SERVICE_KIND_KEYS];
const TEXT_KEYS = ["Format", "Language", "Title", "Stream size", "Default", "Forced", ...SERVICE_KIND_KEYS];
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

interface FilesCardOptions {
	mediaByStem: Map<string, MediaEpisode>;
	selected: string | null;
	onSelect: (stem: string) => void;
}

interface FilesCard {
	element: HTMLElement;
	setSelected(stem: string | null): void;
}

function fileStem(file: ReleaseFile): string {
	const base = Array.isArray(file.path) ? (file.path[file.path.length - 1] ?? "") : String(file.path ?? "");
	return base.replace(/\.[a-z0-9]{2,5}$/i, "");
}

export async function renderDetail(app: HTMLElement, category: Category, id: number): Promise<void> {
	app.replaceChildren(el("div", { className: "loading-screen", text: "Loading…" }));

	try {
		const release = await getRelease(category, id);

		const manifest = await getMediaManifest(category, id); // [] for old releases
		const mediaByStem = new Map(manifest.map((e) => [e.name, e]));

		// Slots that get swapped when the user picks another episode
		const screensSlot = el("div", { className: "screens-slot" });
		const mediainfoSlot = el("div", { className: "mediainfo-slot" });
		const filesSlot = el("div", { className: "files-slot" });

		const info = parseMediaInfo(release.mediainfo);
		const completeName = getField(info.general, "Complete name") ?? "";
		const dbStem = completeName.replace(/\.[a-z0-9]{2,5}$/i, "");
		let selected: string | null = mediaByStem.has(dbStem) ? dbStem : (manifest.find((e) => e.mediainfo)?.name ?? null);

		const mediainfoCache = new Map<string, string>();
		if (selected) mediainfoCache.set(selected, release.mediainfo);

		let filesCard: FilesCard | null = null;

		async function selectEpisode(stem: string): Promise<void> {
			const ep = mediaByStem.get(stem);
			if (!ep || stem === selected) return;
			try {
				let text = mediainfoCache.get(stem);
				if (text === undefined && ep.mediainfo) {
					text = await getEpisodeMediainfo(category, id, stem);
					mediainfoCache.set(stem, text);
				}
				selected = stem;
				if (text !== undefined) renderMediaInfoSections(mediainfoSlot, text);
				renderScreens();
				filesCard?.setSelected(selected);
			} catch {
				toast("Could not load mediainfo for this episode");
			}
		}

		function renderScreens(): void {
			const card = selected ? buildScreenshotsCard(category, id, mediaByStem.get(selected) ?? null) : null;
			screensSlot.replaceChildren(...(card ? [card] : []));
		}

		filesCard = buildFilesCard(release.files, { mediaByStem, selected, onSelect: selectEpisode });
		if (filesCard) filesSlot.appendChild(filesCard.element);

		renderMediaInfoSections(mediainfoSlot, release.mediainfo);
		renderScreens();

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

		// Assemble main content
		const children: (HTMLElement | null)[] = [backLink, header, trackerStats, seasonNav, filesSlot, screensSlot, mediainfoSlot];
		app.replaceChildren(...(children.filter(Boolean) as HTMLElement[]));

		await mountComments(app, release.category, release.id);
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

/** Group a raw CLI string into "flag value" chips, e.g.
 *  "--film-grain 4 --tune 2" → ["--film-grain 4", "--tune 2"]. */
function splitFlags(raw: string): string[] {
	const chips: string[] = [];
	for (const tok of raw.split(/\s+/).filter(Boolean)) {
		const prev = chips[chips.length - 1];
		if (tok.startsWith("-")) {
			chips.push(tok);
		} else if (prev && prev.startsWith("-") && !prev.includes(" ")) {
			chips[chips.length - 1] = `${prev} ${tok}`;
		} else {
			chips.push(tok);
		}
	}
	return chips.length ? chips : [raw];
}

function buildSettingsCard(decoded: DecodedSettings): HTMLElement {
	const rows: HTMLElement[] = [];

	const row = (label: string, value: string): HTMLElement =>
		el("div", {
			className: "info-row",
			children: [el("span", { className: "label", text: label }), el("span", { className: "value", text: value })],
		});

	const flagRow = (label: string, value: string): HTMLElement =>
		el("div", {
			className: "info-row settings-flag-row",
			children: [
				el("span", { className: "label", text: label }),
				el("span", {
					className: "value settings-flags",
					children: splitFlags(value).map((flag) => el("code", { className: "settings-flag", text: flag })),
				}),
			],
		});

	if (decoded.newerFormat) rows.push(row("Format", `RE${decoded.version} (shown best-effort)`));

	if (decoded.items.length === 0) {
		rows.push(row("Settings", "All defaults"));
	} else {
		for (const item of decoded.items) rows.push(item.mono ? flagRow(item.label, item.value) : row(item.label, item.value));
	}

	return el("div", {
		className: "info-card",
		children: [el("h3", { text: "⚙️ Rabbit Encoder Settings" }), ...rows],
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

function buildFilesCard(files: ReleaseFile[], opts: FilesCardOptions): FilesCard | null {
	if (!files || files.length === 0) return null;

	const totalSize = files.reduce((sum, f) => sum + (Number.isFinite(f.length) ? f.length : 0), 0);

	const rowByStem = new Map<string, HTMLElement>();

	const rows = files.map((file) => {
		const fullPath = Array.isArray(file.path) ? file.path.join("/") : String(file.path ?? "");
		const stem = fileStem(file);
		const ep = opts.mediaByStem.get(stem);

		const children: HTMLElement[] = [el("span", { className: "file-name", text: fullPath, attrs: { title: fullPath } })];

		const badges: HTMLElement[] = [];
		if (ep?.screenshots.length) {
			//badges.push(el("span", { className: "file-badge", attrs: { title: `${ep.screenshots.length} screenshots` }, text: `📷 ${ep.screenshots.length}` }));
		}
		if (badges.length) children.push(el("span", { className: "file-badges", children: badges }));
		children.push(el("span", { className: "file-size", text: formatBytes(file.length) }));

		const row = el("li", {
			className: `file-row${ep ? " has-media" : ""}`,
			children,
		});

		if (ep) {
			rowByStem.set(stem, row);
			row.setAttribute("role", "button");
			row.setAttribute("tabindex", "0");
			row.setAttribute("title", "Show mediainfo and screenshots for this episode");
			row.addEventListener("click", () => opts.onSelect(stem));
			row.addEventListener("keydown", (e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					opts.onSelect(stem);
				}
			});
		}

		return row;
	});

	const setSelected = (sel: string | null): void => {
		for (const [stem, row] of rowByStem) {
			const active = stem === sel;
			row.classList.toggle("active", active);
			row.setAttribute("aria-pressed", String(active));
		}
	};

	setSelected(opts.selected);

	const countLabel = files.length === 1 ? "1 file" : `${files.length.toLocaleString()} files`;

	const summary = el("summary", {
		children: [
			el("span", {
				className: "files-summary-left",
				children: [el("span", { className: "files-summary-caret" }), el("span", { className: "files-summary-title", text: "📁 Files" })],
			}),
			el("span", { className: "files-summary-meta", text: `${countLabel} · ${formatBytes(totalSize)}` }),
		],
	});

	const element = el("details", {
		className: "files-card",
		attrs: { open: "" },
		children: [summary, el("ul", { className: "file-list", children: rows })],
	});

	return { element, setSelected };
}

function renderMediaInfoSections(slot: HTMLElement, mediainfoText: string): void {
	const info = parseMediaInfo(mediainfoText);

	// General + Rabbit Encoder settings
	const generalVideoCards: HTMLElement[] = [];

	if (info.general) {
		const settingsField = info.general.fields.find((f) => f.key.toUpperCase() === "RABBIT_ENCODER/SETTINGS");
		const decoded = settingsField && looksLikeSettingsCode(settingsField.value) ? decodeRabbitSettings(settingsField.value) : null;

		// When the settings code decodes, hide the raw code row from the
		// General card and show the dedicated settings card instead.
		const generalKeys = decoded ? GENERAL_KEYS.filter((k) => k.toUpperCase() !== "RABBIT_ENCODER/SETTINGS") : GENERAL_KEYS;
		generalVideoCards.push(buildCard("📄 General", info.general, generalKeys));

		if (decoded) generalVideoCards.push(buildSettingsCard(decoded));
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

	// Create separate grids
	const generalVideoGrid = generalVideoCards.length ? el("div", { className: "info-grid", children: generalVideoCards }) : null;

	const audioGrid = audioCards.length ? el("div", { className: "info-grid", children: audioCards }) : null;

	const textGrid = textCards.length ? el("div", { className: "info-grid", children: textCards }) : null;

	// Chapters if present
	const chaptersCard = info.menu.length > 0 ? buildChaptersCard(info.menu[0]!) : null;

	// Raw mediainfo
	const rawDetails = el("details", {
		className: "mediainfo-raw",
		children: [el("summary", { text: "View raw MediaInfo" }), el("pre", { text: mediainfoText })],
	});

	const sections: (HTMLElement | null)[] = [generalVideoGrid, audioGrid, textGrid, chaptersCard, rawDetails];
	slot.replaceChildren(...(sections.filter(Boolean) as HTMLElement[]));
}
