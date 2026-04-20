import { listReleases, type Category, type ReleaseGroup } from "../api.ts";
import { el, formatDate, debounce, toast, categoryLabel } from "../utils.ts";

const PAGE_SIZE = 24;

interface ViewState {
	page: number;
	q: string;
}

export async function renderListing(app: HTMLElement, category: Category): Promise<void> {
	const state: ViewState = { page: 1, q: "" };

	const searchInput = el("input", {
		attrs: {
			type: "search",
			placeholder: `Search ${categoryLabel(category).toLowerCase()}…`,
			autocomplete: "off",
			spellcheck: "false",
		},
	}) as HTMLInputElement;

	const counter = el("span", { className: "counter", text: "…" });
	const gridContainer = el("div", { className: "release-grid" });
	const paginationContainer = el("div", { className: "pagination" });

	const toolbar = el("div", {
		className: "toolbar",
		children: [el("div", { className: "search-box", children: [searchInput] }), counter],
	});

	app.replaceChildren(
		el("h1", { className: "page-title", text: categoryLabel(category) }),
		el("p", {
			className: "page-sub",
			text: "Each release contains the .torrent file and full MediaInfo.",
		}),
		toolbar,
		gridContainer,
		paginationContainer,
	);

	const load = async () => {
		gridContainer.replaceChildren(el("div", { className: "loading-screen", text: "Loading…" }));
		paginationContainer.replaceChildren();
		try {
			const { groups, pagination } = await listReleases(category, {
				page: state.page,
				limit: PAGE_SIZE,
				q: state.q || undefined,
			});

			counter.textContent = pagination.total === 1 ? "1 title" : `${pagination.total} titles`;

			if (groups.length === 0) {
				gridContainer.replaceChildren(emptyState(state.q));
				return;
			}

			gridContainer.replaceChildren(...groups.map((g) => groupCard(g)));
			paginationContainer.replaceChildren(
				...buildPagination(state.page, pagination.pages, (page) => {
					state.page = page;
					void load();
				}),
			);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "Failed to load";
			gridContainer.replaceChildren(el("div", { className: "empty", text: `⚠️ ${msg}` }));
			toast(msg, "error");
		}
	};

	const runSearch = debounce(() => {
		state.page = 1;
		state.q = searchInput.value.trim();
		void load();
	}, 250);
	searchInput.addEventListener("input", runSearch);

	await load();
}

/** Render a group; single-release groups fall back to the classic linkable card. */
function groupCard(group: ReleaseGroup): HTMLElement {
	if (group.releases.length === 1) {
		return singleReleaseCard(group);
	}

	const titleLine = [group.title];
	if (group.year) titleLine.push(`(${group.year})`);

	const seasonCount = group.releases.filter((r) => r.season).length;

	const metaChildren: (HTMLElement | string)[] = [];
	if (seasonCount > 0) {
		metaChildren.push(seasonCount === 1 ? "1 season" : `${seasonCount} seasons`);
		metaChildren.push(el("span", { className: "dot", text: "·" }));
	}
	metaChildren.push(formatDate(group.latest_uploaded_at));

	const seasonList = el("div", {
		className: "season-list",
		children: group.releases.map((r) =>
			el("a", {
				className: "season-chip",
				attrs: {
					href: `/${r.category}/${r.id}`,
					"data-link": "true",
					title: r.torrent_name,
				},
				text: r.season ?? "Release",
			}),
		),
	});

	return el("div", {
		className: "release-card release-group",
		children: [
			el("h3", { className: "rc-title", text: titleLine.join(" ") }),
			el("div", { className: "rc-meta", children: metaChildren }),
			seasonList,
			el("div", {
				className: "rc-tags",
				children: group.tags.slice(0, 5).map((tag, idx) =>
					el("span", {
						className: idx === 0 ? "tag accent" : "tag",
						text: tag,
					}),
				),
			}),
		],
	});
}

/** Classic single-item card used for movies and single-season shows. */
function singleReleaseCard(group: ReleaseGroup): HTMLElement {
	const item = group.releases[0]!;
	const titleLine = [item.title];
	if (item.year) titleLine.push(`(${item.year})`);
	//if (item.season) titleLine.push(`- ${item.season}`);

	const metaChildren: (HTMLElement | string)[] = [];
	if (item.season) metaChildren.push(item.season, el("span", { className: "dot", text: "·" }));
	metaChildren.push(formatDate(item.uploaded_at));

	return el("a", {
		className: "release-card",
		attrs: { href: `/${item.category}/${item.id}`, "data-link": "true" },
		children: [
			el("h3", { className: "rc-title", text: titleLine.join(" ") }),
			el("div", { className: "rc-meta", children: metaChildren }),
			el("div", {
				className: "rc-tags",
				children: item.tags.slice(0, 5).map((tag, idx) =>
					el("span", {
						className: idx === 0 ? "tag accent" : "tag",
						text: tag,
					}),
				),
			}),
		],
	});
}

function emptyState(query: string): HTMLElement {
	return el("div", {
		className: "empty",
		children: [
			el("div", { className: "empty-icon", text: query ? "🔍" : "📭" }),
			el("div", {
				text: query ? `No releases matching "${query}"` : "No releases here yet. Check back soon.",
			}),
		],
	});
}

function buildPagination(currentPage: number, totalPages: number, onNav: (page: number) => void): HTMLElement[] {
	if (totalPages <= 1) return [];

	const prev = el("button", { text: "← Prev" }) as HTMLButtonElement;
	prev.disabled = currentPage <= 1;
	prev.addEventListener("click", () => onNav(currentPage - 1));

	const next = el("button", { text: "Next →" }) as HTMLButtonElement;
	next.disabled = currentPage >= totalPages;
	next.addEventListener("click", () => onNav(currentPage + 1));

	const info = el("span", {
		className: "page-info",
		text: `Page ${currentPage} of ${totalPages}`,
	});

	return [prev, info, next];
}
