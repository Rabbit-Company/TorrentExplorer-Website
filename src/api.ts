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

export interface ReleaseDetail extends ReleaseListItem {
	mediainfo: string;
}

export interface Pagination {
	page: number;
	limit: number;
	total: number;
	pages: number;
}

export interface ListResponse {
	items: ReleaseListItem[];
	pagination: Pagination;
}

export interface InfoResponse {
	releaseGroup: string;
	stats: Record<Category, number>;
	donation: {
		xmr?: string;
	};
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

export function torrentUrl(category: Category, id: number): string {
	return `${apiUrl}/api/torrent/${category}/${id}`;
}
