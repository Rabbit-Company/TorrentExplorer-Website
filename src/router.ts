export type Route = {
	pattern: RegExp;
	handler: (match: RegExpMatchArray) => void | Promise<void>;
};

export class Router {
	private routes: Route[] = [];
	private fallback: (() => void | Promise<void>) | null = null;

	add(pattern: string | RegExp, handler: Route["handler"]): this {
		const regex = typeof pattern === "string" ? new RegExp("^" + pattern.replace(/:(\w+)/g, "([^/]+)").replace(/\//g, "\\/") + "\\/?$") : pattern;
		this.routes.push({ pattern: regex, handler });
		return this;
	}

	notFound(handler: () => void | Promise<void>): this {
		this.fallback = handler;
		return this;
	}

	async dispatch(path?: string): Promise<void> {
		const currentPath = path ?? window.location.pathname;
		for (const route of this.routes) {
			const match = currentPath.match(route.pattern);
			if (match) {
				await route.handler(match);
				return;
			}
		}
		if (this.fallback) await this.fallback();
	}

	start(): void {
		// Intercept clicks on data-link anchors
		document.addEventListener("click", (e) => {
			const target = e.target as HTMLElement;
			const link = target.closest("a[data-link]") as HTMLAnchorElement | null;
			if (!link) return;
			const href = link.getAttribute("href");
			if (!href || href.startsWith("http") || href.startsWith("mailto:")) return;
			e.preventDefault();
			this.navigate(href);
		});

		window.addEventListener("popstate", () => {
			void this.dispatch();
		});

		void this.dispatch();
	}

	navigate(path: string): void {
		if (window.location.pathname === path) return;
		window.history.pushState(null, "", path);
		window.scrollTo(0, 0);
		void this.dispatch();
	}
}
