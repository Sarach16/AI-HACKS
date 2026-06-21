const WIKI_API = "https://en.wikipedia.org/w/api.php";

/**
 * Finds nearby Wikipedia articles using the geosearch API, then fetches a
 * plain-text summary extract for each. Returns places sorted by distance.
 */
export async function findNearbyPlaces({ lat, lng, radiusMeters = 500, limit = 10 }) {
  const geoParams = new URLSearchParams({
    action: "query",
    list: "geosearch",
    gscoord: `${lat}|${lng}`,
    gsradius: String(Math.min(radiusMeters, 10000)), // API max is 10000m
    gslimit: String(limit),
    format: "json",
    origin: "*", // required for CORS on the public Wikipedia API
  });

  const geoRes = await fetch(`${WIKI_API}?${geoParams}`);
  if (!geoRes.ok) throw new Error(`Wikipedia geosearch failed: ${geoRes.status}`);
  const geoData = await geoRes.json();

  const results = geoData?.query?.geosearch ?? [];
  if (results.length === 0) return [];

  // Batch-fetch extracts (summaries) for all found pages in one call.
  const pageIds = results.map((r) => r.pageid).join("|");
  const extractParams = new URLSearchParams({
    action: "query",
    prop: "extracts",
    exintro: "true",
    explaintext: "true",
    exsentences: "6",
    pageids: pageIds,
    format: "json",
    origin: "*",
  });

  const extractRes = await fetch(`${WIKI_API}?${extractParams}`);
  if (!extractRes.ok) throw new Error(`Wikipedia extracts failed: ${extractRes.status}`);
  const extractData = await extractRes.json();
  const pages = extractData?.query?.pages ?? {};

  return results
    .map((r) => ({
      pageId: r.pageid,
      title: r.title,
      lat: r.lat,
      lng: r.lon,
      distanceMeters: r.dist, // Wikipedia already computes this
      extract: pages[r.pageid]?.extract?.trim() || "",
    }))
    .filter((p) => p.extract.length > 0) // skip stub pages with no summary
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}
