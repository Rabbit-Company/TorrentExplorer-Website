import { screenshotUrl, type Category, type MediaEpisode } from "../api.ts";
import { el } from "../utils.ts";

/**
 * Screenshots grid (3 per row) + fullscreen lightbox.
 *
 * buildScreenshotsCard() returns a card for the given episode, or null when
 * the episode has no screenshots. The card can simply be replaced when the
 * user switches episodes in the file explorer.
 */

export function buildScreenshotsCard(category: Category, id: number, episode: MediaEpisode | null): HTMLElement | null {
	if (!episode || episode.screenshots.length === 0) return null;

	const urls = episode.screenshots.map((file) => screenshotUrl(category, id, file));

	const thumbs = urls.map((url, i) =>
		el("button", {
			className: "screens-thumb",
			attrs: { type: "button", "aria-label": `Open screenshot ${i + 1} of ${urls.length}` },
			children: [
				el("img", {
					attrs: { src: url, alt: `Screenshot ${i + 1}`, loading: "lazy", decoding: "async" },
				}),
			],
		}),
	);
	thumbs.forEach((btn, i) => btn.addEventListener("click", () => openLightbox(urls, i)));

	return el("div", {
		className: "info-card screens-card",
		children: [el("h3", { text: "📸 Screenshots" }), el("div", { className: "screens-grid", children: thumbs })],
	});
}

/** Fullscreen viewer. ← / → navigate, Space = next, Esc / backdrop = close. */
export function openLightbox(urls: string[], startIndex: number): void {
	if (urls.length === 0) return;
	let index = Math.min(Math.max(startIndex, 0), urls.length - 1);

	const img = el("img", { className: "lb-img", attrs: { alt: "Screenshot", decoding: "async" } }) as HTMLImageElement;
	const counter = el("div", { className: "lb-counter" });
	const prevBtn = navButton("‹", "Previous screenshot", "lb-prev");
	const nextBtn = navButton("›", "Next screenshot", "lb-next");
	const closeBtn = navButton("✕", "Close", "lb-close");

	const overlay = el("div", {
		className: "lightbox",
		attrs: { role: "dialog", "aria-modal": "true", "aria-label": "Screenshot viewer", tabindex: "-1" },
		children: [el("div", { className: "lb-stage", children: [img] }), prevBtn, nextBtn, closeBtn, counter],
	});

	function show(i: number): void {
		index = (i + urls.length) % urls.length;
		img.src = urls[index]!;
		counter.textContent = `${index + 1} / ${urls.length}`;
		prevBtn.style.visibility = urls.length > 1 ? "visible" : "hidden";
		nextBtn.style.visibility = urls.length > 1 ? "visible" : "hidden";
		// Preload neighbours so arrow navigation feels instant.
		for (const j of [index + 1, index - 1]) {
			if (urls.length > 1) new Image().src = urls[(j + urls.length) % urls.length]!;
		}
	}

	function close(): void {
		document.removeEventListener("keydown", onKey);
		document.body.style.overflow = prevOverflow;
		overlay.remove();
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
