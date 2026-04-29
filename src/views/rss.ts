import { absoluteApiBase, rssUrl, torznabUrl, type Category } from "../api.ts";
import { el, toast } from "../utils.ts";

const CATEGORIES: Array<{ value: Category | "all"; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "movies", label: "Movies" },
	{ value: "series", label: "Series" },
	{ value: "anime", label: "Anime" },
];

export function renderRss(app: HTMLElement, brand: string): void {
	const heading = el("div", {
		children: [
			el("h1", { className: "page-title", text: "RSS & Automation" }),
			el("p", {
				className: "page-sub",
				text: `Subscribe to ${brand} releases in any RSS reader, or wire up Prowlarr (and through it Sonarr / Radarr) for fully automated downloads.`,
			}),
		],
	});

	const rssCard = buildRssCard();
	const torznabCard = buildTorznabCard();
	const prowlarrSection = buildProwlarrSection();
	const paramsSection = buildParamsSection();

	app.replaceChildren(
		el("div", {
			className: "rss-page",
			children: [heading, rssCard, torznabCard, prowlarrSection, paramsSection],
		}),
	);
}

function buildRssCard(): HTMLElement {
	const urlEl = el("a", {
		className: "rss-url-input",
		attrs: { href: rssUrl(), target: "_blank", rel: "noopener" },
		text: rssUrl(),
	}) as HTMLAnchorElement;

	const copyBtn = makeCopyButton(() => urlEl.href);

	const chips: HTMLElement[] = [];
	let activeCat: Category | "all" = "all";
	for (const opt of CATEGORIES) {
		const chip = el("button", {
			className: opt.value === "all" ? "rss-cat-chip active" : "rss-cat-chip",
			attrs: { type: "button" },
			text: opt.label,
		}) as HTMLButtonElement;

		chip.addEventListener("click", () => {
			activeCat = opt.value;
			for (const c of chips) c.classList.remove("active");
			chip.classList.add("active");
			const next = activeCat === "all" ? rssUrl() : rssUrl(activeCat);
			urlEl.href = next;
			urlEl.textContent = next;
		});
		chips.push(chip);
	}

	return el("section", {
		className: "rss-url-card",
		children: [
			el("div", {
				className: "rss-url-card-header",
				children: [el("h3", { text: "📰 RSS Feed" }), el("span", { className: "rss-url-card-sub", text: "Drop into any RSS reader" })],
			}),
			el("div", {
				className: "rss-url-row",
				children: [urlEl, copyBtn],
			}),
			el("div", { className: "rss-cat-filter", children: chips }),
		],
	});
}

function buildTorznabCard(): HTMLElement {
	const urlEl = el("a", {
		className: "rss-url-input",
		attrs: { href: torznabUrl(), target: "_blank", rel: "noopener" },
		text: torznabUrl(),
	}) as HTMLAnchorElement;
	const copyBtn = makeCopyButton(() => urlEl.href);

	return el("section", {
		className: "rss-url-card",
		children: [
			el("div", {
				className: "rss-url-card-header",
				children: [el("h3", { text: "🔌 Torznab Endpoint" }), el("span", { className: "rss-url-card-sub", text: "For Prowlarr / Sonarr / Radarr" })],
			}),
			el("div", {
				className: "rss-url-row",
				children: [urlEl, copyBtn],
			}),
		],
	});
}

function buildProwlarrSection(): HTMLElement {
	const settingsList = el("dl", {
		className: "rss-step-settings",
		children: [el("dt", { text: "URL" }), el("dd", { text: absoluteApiBase() }), el("dt", { text: "API Path" }), el("dd", { text: "/api/torznab" })],
	});

	const steps = [
		step("Open Prowlarr", "Go to Indexers → Add Indexer."),
		step("Pick Generic Torznab", 'Search the indexer list for "Generic Torznab" or "Torznab" and select it.'),
		step("Configure the indexer", "Use these values:", settingsList),
		step("Test & save", 'Click Test. Prowlarr will hit the "caps" endpoint to validate. If successful, click Save.'),
		step(
			"Connect to Sonarr / Radarr",
			"If Prowlarr is already linked to your apps, the indexer will sync automatically. Otherwise add Sonarr/Radarr under Settings → Apps.",
		),
	];

	return el("section", {
		className: "rss-section",
		children: [el("h2", { text: "Adding to Prowlarr" }), el("ol", { className: "rss-steps", children: steps })],
	});
}

function step(title: string, detail: string, extra?: HTMLElement): HTMLElement {
	const content = el("div", {
		className: "rss-step-content",
		children: [el("div", { className: "rss-step-title", text: title }), el("div", { className: "rss-step-detail", text: detail }), extra ?? null].filter(
			Boolean,
		) as HTMLElement[],
	});
	return el("li", { className: "rss-step", children: [content] });
}

function buildParamsSection(): HTMLElement {
	const rows = [
		["q", "string", "Free-text search across the title", "?q=tsugumomo"],
		["cat", "string", "Filter by category (anime, movies, series)", "?cat=anime"],
		["limit", "number", "Max items to return (default 50, max 100)", "?limit=20"],
	];

	const table = el("table", {
		className: "rss-params-table",
		children: [
			el("thead", {
				children: [
					el("tr", {
						children: ["Param", "Type", "Description", "Example"].map((h) => el("th", { text: h })),
					}),
				],
			}),
			el("tbody", {
				children: rows.map(([p, t, d, ex]) =>
					el("tr", {
						children: [
							el("td", { children: [el("code", { text: p! })] }),
							el("td", { text: t! }),
							el("td", { text: d! }),
							el("td", { children: [el("code", { text: ex! })] }),
						],
					}),
				),
			}),
		],
	});

	return el("section", {
		className: "rss-section",
		children: [el("h2", { text: "Query parameters" }), table],
	});
}

function makeCopyButton(getValue: () => string): HTMLButtonElement {
	const btn = el("button", {
		className: "rss-copy-btn",
		attrs: { type: "button" },
		text: "Copy",
	}) as HTMLButtonElement;

	btn.addEventListener("click", async () => {
		const value = getValue();
		const restore = () => {
			btn.disabled = false;
			btn.textContent = "Copy";
		};
		btn.disabled = true;
		try {
			await navigator.clipboard.writeText(value);
			btn.textContent = "✓ Copied";
			toast("Copied to clipboard", "success");
			setTimeout(restore, 1500);
		} catch (err) {
			toast(err instanceof Error ? err.message : "Could not copy", "error");
			restore();
		}
	});

	return btn;
}
