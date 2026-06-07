export type Category = "movies" | "series" | "anime";

export interface ReleaseListItem {
	id: number;
	category: Category;
	title: string;
	year: number | null;
	season: string | null;
	torrent_name: string;
	tags: string[];
	uploaded_at: number;
}

export interface ReleaseFile {
	path: string[];
	length: number;
}

export interface ReleaseDetail extends ReleaseListItem {
	mediainfo: string;
	magnet: string | null;
	seeders: number | null;
	leechers: number | null;
	completed: number | null;
	last_scraped_at: number | null;
	files: ReleaseFile[];
	group: Array<{ id: number; season: string | null }>;
}

export interface Pagination {
	page: number;
	limit: number;
	total: number;
	pages: number;
}

export interface ReleaseGroup {
	title: string;
	year: number | null;
	latest_uploaded_at: number;
	tags: string[];
	releases: ReleaseListItem[];
}

export interface ListResponse {
	groups: ReleaseGroup[];
	pagination: Pagination;
}

export interface InfoResponse {
	releaseGroup: string;
	stats: Record<Category, number>;
	donation: {
		xmr?: string;
	};
	requests?: {
		enabled: boolean;
		rateLimitWindowMinutes: number;
	};
}

export type RequestKind = "anime" | "series" | "movies";

export interface RequestResult {
	id: number;
	kind: RequestKind;
	counter: number;
	created: number;
	last_updated: number;
}

export class RateLimitError extends Error {
	readonly retryAfter: number;

	constructor(message: string, retryAfter: number) {
		super(message);
		this.name = "RateLimitError";
		this.retryAfter = retryAfter;
	}
}

let apiUrl = "";

export async function initApi(): Promise<void> {
	try {
		const res = await fetch("/config.json", { cache: "no-cache" });
		const cfg = (await res.json()) as { apiUrl?: string };
		apiUrl = cfg.apiUrl?.replace(/\/+$/, "") ?? "";
	} catch {
		console.error("Failed to load /config.json - falling back to same origin");
		apiUrl = "";
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(`${apiUrl}${path}`, init);
	if (!res.ok) {
		let message = `Request failed: ${res.status}`;
		try {
			const body = (await res.json()) as { error?: string };
			if (body.error) message = body.error;
		} catch {}
		throw new Error(message);
	}
	return res.json() as Promise<T>;
}

export function getInfo(): Promise<InfoResponse> {
	return request<InfoResponse>("/api/info");
}

export function listReleases(category: Category, params: { page?: number; limit?: number; q?: string } = {}): Promise<ListResponse> {
	const search = new URLSearchParams();
	if (params.page) search.set("page", String(params.page));
	if (params.limit) search.set("limit", String(params.limit));
	if (params.q) search.set("q", params.q);
	const qs = search.toString();
	return request<ListResponse>(`/api/${category}${qs ? `?${qs}` : ""}`);
}

export function getRelease(category: Category, id: number): Promise<ReleaseDetail> {
	return request<ReleaseDetail>(`/api/${category}/${id}`);
}

export async function submitRequest(kind: RequestKind, id: number): Promise<RequestResult> {
	const res = await fetch(`${apiUrl}/api/requests`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ kind, id }),
	});

	if (res.status === 429) {
		let message = "You can only make a request once per hour. Please try again later.";
		let retryAfter = 3600;
		try {
			const body = (await res.json()) as { error?: string; retryAfter?: number };
			if (body.error) message = body.error;
			if (typeof body.retryAfter === "number" && body.retryAfter > 0) retryAfter = body.retryAfter;
		} catch {}
		throw new RateLimitError(message, retryAfter);
	}

	if (!res.ok) {
		let message = `Request failed: ${res.status}`;
		try {
			const body = (await res.json()) as { error?: string };
			if (body.error) message = body.error;
		} catch {}
		throw new Error(message);
	}

	return res.json() as Promise<RequestResult>;
}

export function torrentUrl(category: Category, id: number): string {
	return `${apiUrl}/api/torrent/${category}/${id}`;
}

export function absoluteApiBase(): string {
	return apiUrl || window.location.origin;
}

export function rssUrl(category?: Category): string {
	const base = absoluteApiBase();
	return category ? `${base}/api/rss?cat=${category}` : `${base}/api/rss`;
}

export function torznabUrl(): string {
	return `${absoluteApiBase()}/api/torznab`;
}
