import { screenshotUrl, type Category, type MediaEpisode } from "../api.ts";
import { el } from "../utils.ts";

/**
 * Screenshots grid (3 per row) + fullscreen lightbox.
 *
 * buildScreenshotsCard() returns a card for the given episode, or null when
 * the episode has no screenshots. The card can simply be replaced when the
 * user switches episodes in the file explorer.
 */

const imageCache = new Map<string, HTMLImageElement>();

function getSharedImage(url: string): HTMLImageElement {
	let img = imageCache.get(url);
	if (!img) {
		img = el("img", { attrs: { decoding: "async" } }) as HTMLImageElement;
		img.src = url; // set exactly once, ever
		imageCache.set(url, img);
	}
	return img;
}

export function buildScreenshotsCard(category: Category, id: number, episode: MediaEpisode | null): HTMLElement | null {
	if (!episode || episode.screenshots.length === 0) return null;

	const urls = episode.screenshots.map((file) => screenshotUrl(category, id, file));

	const thumbs = urls.map((url, i) => {
		const img = getSharedImage(url);
		img.alt = `Screenshot ${i + 1}`;
		const btn = el("button", {
			className: "screens-thumb",
			attrs: { type: "button", "aria-label": `Open screenshot ${i + 1} of ${urls.length}` },
			children: [img],
		});
		btn.addEventListener("click", () => openLightbox(urls, i));
		return btn;
	});

	return el("div", {
		className: "info-card screens-card",
		children: [el("h3", { text: "📸 Screenshots" }), el("div", { className: "screens-grid", children: thumbs })],
	});
}

/** Fullscreen viewer. ← / → navigate, Space = next, Esc / backdrop = close. */
export function openLightbox(urls: string[], startIndex: number): void {
	if (urls.length === 0) return;
	let index = Math.min(Math.max(startIndex, 0), urls.length - 1);

	// Borrow the very elements the thumbnails already loaded. Record where each
	// one lives so it can be returned to its thumbnail when the viewer closes.
	const imgs = urls.map(getSharedImage);
	const origins = imgs.map((im) => im.parentElement);

	imgs.forEach((im) => im.classList.add("lb-img"));

	const counter = el("div", { className: "lb-counter" });
	const prevBtn = navButton("‹", "Previous screenshot", "lb-prev");
	const nextBtn = navButton("›", "Next screenshot", "lb-next");
	const closeBtn = navButton("✕", "Close", "lb-close");

	const stage = el("div", { className: "lb-stage", children: imgs });

	const overlay = el("div", {
		className: "lightbox",
		attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Screenshot viewer", tabindex: "-1" },
		children: [stage, prevBtn, nextBtn, closeBtn, counter],
	});

	function show(i: number): void {
		index = (i + urls.length) % urls.length;
		// Only toggle visibility (no src changes, no new requests)
		imgs.forEach((im, k) => {
			im.style.display = k === index ? "" : "none";
		});
		counter.textContent = `${index + 1} / ${urls.length}`;
		prevBtn.style.visibility = urls.length > 1 ? "visible" : "hidden";
		nextBtn.style.visibility = urls.length > 1 ? "visible" : "hidden";
	}

	function close(): void {
		document.removeEventListener("keydown", onKey);
		document.body.style.overflow = prevOverflow;
		overlay.remove();
		// Hand each image back to its thumbnail exactly as it was.
		imgs.forEach((im, k) => {
			im.classList.remove("lb-img");
			im.style.display = "";
			origins[k]?.appendChild(im);
		});
		opener?.focus?.();
	}

	function onKey(e: KeyboardEvent): void {
		switch (e.key) {
			case "Escape":
				e.preventDefault();
				close();
				break;
			case "ArrowLeft":
				e.preventDefault();
				show(index - 1);
				break;
			case "ArrowRight":
			case " ": // Space advances to the next screenshot
				e.preventDefault();
				show(index + 1);
				break;
		}
	}

	prevBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		show(index - 1);
	});
	nextBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		show(index + 1);
	});
	closeBtn.addEventListener("click", (e) => {
		e.stopPropagation();
		close();
	});
	overlay.addEventListener("click", (e) => {
		// Click anywhere outside the image closes the viewer.
		if (e.target === overlay || (e.target as HTMLElement).classList.contains("lb-stage")) close();
	});

	// Basic swipe support for touch devices.
	let touchX: number | null = null;
	overlay.addEventListener("touchstart", (e) => {
		touchX = e.touches[0]?.clientX ?? null;
	});
	overlay.addEventListener("touchend", (e) => {
		if (touchX === null) return;
		const dx = (e.changedTouches[0]?.clientX ?? touchX) - touchX;
		touchX = null;
		if (Math.abs(dx) > 40) show(dx < 0 ? index + 1 : index - 1);
	});

	const opener = document.activeElement as HTMLElement | null;
	const prevOverflow = document.body.style.overflow;
	document.body.style.overflow = "hidden";
	document.addEventListener("keydown", onKey);
	document.body.appendChild(overlay);
	show(index);
	overlay.focus();
}

function navButton(label: string, ariaLabel: string, className: string): HTMLElement {
	return el("button", {
		className: `lb-btn ${className}`,
		attrs: { type: "button", "aria-label": ariaLabel },
		text: label,
	});
}
