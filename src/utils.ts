export function el<K extends keyof HTMLElementTagNameMap>(
	tag: K,
	options: {
		className?: string;
		text?: string;
		attrs?: Record<string, string>;
		children?: (HTMLElement | string | null | undefined)[];
	} = {},
): HTMLElementTagNameMap[K] {
	const node = document.createElement(tag);
	if (options.className) node.className = options.className;
	if (options.text !== undefined) node.textContent = options.text;
	if (options.attrs) {
		for (const [key, value] of Object.entries(options.attrs)) {
			node.setAttribute(key, value);
		}
	}
	if (options.children) {
		for (const child of options.children) {
			if (child == null) continue;
			if (typeof child === "string") node.appendChild(document.createTextNode(child));
			else node.appendChild(child);
		}
	}
	return node;
}

export function formatDate(timestamp: number): string {
	const date = new Date(timestamp);
	const now = Date.now();
	const diffMs = now - timestamp;

	const diffMinutes = Math.floor(diffMs / (1000 * 60));
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays < 1) {
		if (diffMinutes < 1) return "just now";
		if (diffMinutes < 60) return `${diffMinutes}m ago`;
		return `${diffHours}h ago`;
	}

	if (diffDays < 7) return `${diffDays}d ago`;

	return date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function debounce<T extends (...args: any[]) => any>(fn: T, ms: number): T {
	let timer: ReturnType<typeof setTimeout> | null = null;
	return ((...args: Parameters<T>) => {
		if (timer) clearTimeout(timer);
		timer = setTimeout(() => fn(...args), ms);
	}) as T;
}

export type ToastKind = "info" | "success" | "warning" | "error";

export function toast(message: string, kind: ToastKind = "info", duration = 3200): void {
	const container = document.getElementById("toast-container");
	if (!container) return;
	const t = el("div", { className: `toast ${kind}`, text: message });
	container.appendChild(t);
	setTimeout(() => {
		t.style.transition = "opacity .2s, transform .2s";
		t.style.opacity = "0";
		t.style.transform = "translateX(20px)";
		setTimeout(() => t.remove(), 220);
	}, duration);
}

export function capitalize(s: string): string {
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export function categoryLabel(category: string): string {
	if (category === "movies") return "Movies";
	if (category === "series") return "Series";
	if (category === "anime") return "Anime";
	return capitalize(category);
}

export function navigateTo(path: string): void {
	if (window.location.pathname === path) return;
	window.history.pushState(null, "", path);
	window.scrollTo(0, 0);
	window.dispatchEvent(new PopStateEvent("popstate"));
}
