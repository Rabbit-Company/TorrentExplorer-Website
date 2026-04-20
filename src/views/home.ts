import { getInfo } from "../api.ts";
import { el } from "../utils.ts";

export async function renderHome(app: HTMLElement, brand: string): Promise<void> {
	const hero = el("section", {
		className: "hero",
		children: [
			el("h1", {
				children: [el("span", { className: "accent", text: brand })],
			}),
			el("p", {
				children: ["Browse and download releases encoded in AV1 with Opus audio.", el("br"), "Click a category below to get started."],
			}),
		],
	});

	let stats: Record<string, number> = { movies: 0, series: 0, anime: 0 };
	try {
		const info = await getInfo();
		stats = info.stats;
	} catch (err) {
		console.error(err);
	}

	const grid = el("div", {
		className: "category-grid",
		children: [
			categoryCard("movies", "🎬", "Movies", stats.movies ?? 0),
			categoryCard("series", "📺", "Series", stats.series ?? 0),
			categoryCard("anime", "🌸", "Anime", stats.anime ?? 0),
		],
	});

	app.replaceChildren(hero, grid);
}

function categoryCard(slug: string, icon: string, name: string, count: number): HTMLElement {
	return el("a", {
		className: "category-card",
		attrs: { href: `/${slug}`, "data-link": "true" },
		children: [
			el("div", { className: "cat-icon", text: icon }),
			el("div", { className: "cat-name", text: name }),
			el("div", {
				className: "cat-count",
				text: count === 1 ? "1 release" : `${count} releases`,
			}),
		],
	});
}
