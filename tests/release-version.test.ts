import { expect, test } from "bun:test";
import { torrentUrl } from "../src/api.ts";
import { releaseLabel, releaseVersion } from "../src/utils.ts";

test.each([
	"[RabbitCompany] Test Series (2024) - S01 v2 [Bluray-1080p][Opus 2.0][AV1]",
	"[RabbitCompany] Test Series (2024) - S01v2 [AV1].torrent",
	"[RabbitCompany] Test Movie (2024) v2 [AV1]",
	"[RabbitCompany] Test Series (2024) - S01 v2",
])("reads the release version from %s", (name) => {
	expect(releaseVersion(name)).toBe(2);
});

test.each([
	"[RabbitCompany] Test Series (2024) - S01 [AV1]",
	"[RabbitCompany] Test Series (2024) - S01 v1 [AV1]",
	"[RabbitCompany] V2 Test Series (2024) - S01 [AV1]",
	"[RabbitCompany] Test Series (2024) - S01 [Encoder v2]",
])("keeps the default version for %s", (name) => {
	expect(releaseVersion(name)).toBe(1);
});

test("labels distinguish revised seasons while keeping unversioned releases equivalent to v1", () => {
	const name = "[RabbitCompany] Test Series (2024) - S01";
	expect(releaseLabel("S01", `${name} [AV1]`)).toBe("S01");
	expect(releaseLabel("S01", `${name} v1 [AV1]`)).toBe("S01");
	expect(releaseLabel("S01", `${name} v2 [AV1]`)).toBe("S01 v2");
	expect(releaseLabel("S01", `${name} v12 [AV1]`)).toBe("S01 v12");
	expect(releaseLabel(null, "[RabbitCompany] Test Movie (2024) v2 [AV1]")).toBe("Release v2");
});

test("replacing an upload changes its download URL without changing the release ID", () => {
	const original = torrentUrl("anime", 1, 1000);
	const replacement = torrentUrl("anime", 1, 2000);
	expect(original).not.toBe(replacement);
	expect(new URL(original, "https://api.example.com").pathname).toBe("/api/torrent/anime/1");
	expect(new URL(replacement, "https://api.example.com").pathname).toBe("/api/torrent/anime/1");
	expect(new URL(replacement, "https://api.example.com").searchParams.get("v")).toBe("2000");
	expect(torrentUrl("anime", 1)).toBe("/api/torrent/anime/1");
});
