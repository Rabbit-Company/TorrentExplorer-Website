import { initApi, getInfo, type Category } from "./api.ts";
import { Router } from "./router.ts";
import { renderHome } from "./views/home.ts";
import { renderListing } from "./views/listing.ts";
import { renderDetail } from "./views/detail.ts";
import { toast } from "./utils.ts";
import { setupDonation } from "./donation.ts";

const CATEGORIES = new Set<Category>(["movies", "series", "anime"]);

async function boot() {
	const app = document.getElementById("app");
	if (!app) throw new Error("Missing #app element");

	await initApi();

	// Fetch brand name once, stamp it everywhere `data-brand` appears
	let brand = "Releases";
	try {
		const info = await getInfo();
		brand = info.releaseGroup;
		setupDonation(info.donation?.xmr);
	} catch (err) {
		console.error(err);
		toast("Could not reach the API", "error", 5000);
	}
	document.title = `${brand} · Releases`;
	for (const node of document.querySelectorAll<HTMLElement>("[data-brand]")) {
		node.textContent = brand;
	}
	for (const node of document.querySelectorAll<HTMLElement>("[data-current-year]")) {
		node.textContent = new Date().getFullYear().toString();
	}

	const router = new Router();

	router.add("/", () => {
		updateActiveNav(null);
		return renderHome(app, brand);
	});

	router.add("/:category", (match) => {
		const category = match[1] as Category;
		if (!CATEGORIES.has(category)) return router404(app);
		updateActiveNav(category);
		return renderListing(app, category);
	});

	router.add("/:category/:id", (match) => {
		const category = match[1] as Category;
		const id = parseInt(match[2] ?? "", 10);
		if (!CATEGORIES.has(category) || !Number.isFinite(id)) return router404(app);
		updateActiveNav(category);
		return renderDetail(app, category, id);
	});

	router.notFound(() => router404(app));

	router.start();
}

function updateActiveNav(category: Category | null) {
	for (const link of document.querySelectorAll<HTMLElement>("[data-nav]")) {
		link.classList.toggle("active", link.dataset.nav === category);
	}
}

function router404(app: HTMLElement) {
	app.innerHTML = "";
	const wrapper = document.createElement("div");
	wrapper.className = "empty";
	wrapper.innerHTML = `
		<div class="empty-icon">404</div>
		<div>This page does not exist.</div>
		<div style="margin-top:16px;"><a href="/" data-link>← Go home</a></div>
	`;
	app.appendChild(wrapper);
}

boot().catch((err) => {
	console.error(err);
	const app = document.getElementById("app");
	if (app) {
		app.innerHTML = `<div class="empty"><div class="empty-icon">⚠️</div><div>${String(err.message ?? err)}</div></div>`;
	}
});
