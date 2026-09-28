import assert from "node:assert/strict";

export async function assertBuiltAppServed(baseUrl) {
  const response = await fetch(`${baseUrl}/`);
  const text = await response.text();
  assert(response.status === 200, `daemon app request returned ${response.status}`);
  assert(text.includes("Cognopticon"), "daemon should serve the built Cognopticon app from dist/");
  const assetPaths = [...text.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1]).filter((path) => path.startsWith("/assets/"));
  assert(assetPaths.length >= 2, "built app should reference compiled JS and CSS assets");
  for (const assetPath of assetPaths) {
    const assetResponse = await fetch(`${baseUrl}${assetPath}`);
    const assetText = await assetResponse.text();
    assert(assetResponse.status === 200, `daemon asset ${assetPath} returned ${assetResponse.status}`);
    assert(assetText.length > 0, `daemon asset ${assetPath} should not be empty`);
  }
}
