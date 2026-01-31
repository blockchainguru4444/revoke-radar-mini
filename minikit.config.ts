const ROOT_URL =
  process.env.NEXT_PUBLIC_URL ||
  (process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`) ||
  "http://localhost:3000";

/**
 * MiniApp configuration object. Must follow the mini app manifest specification.
 *
 * @see {@link https://docs.base.org/mini-apps/features/manifest}
 */
export const minikitConfig = {
  accountAssociation: {
    header: "eyJmaWQiOjIyMzYxMCwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDgzZTBjY0UzMjc3NjU3MDA2Q0UxYjQ5ZjQwNjIwZjZFMkJEOTY4MEEifQ",
    payload: "eyJkb21haW4iOiJyZXZva2UtcmFkYXItbWluaS52ZXJjZWwuYXBwIn0",
    signature: "MHhkYzgxZGE1MzZiM2VjZjA5OGY1YThhYWY0MjZjOTg5MzE5OWM2NWQxYTgwZTE1ZmZiYTdhYmY3MThmYmM1MDA3NThkMjJjODMwNWZlZDQyNGRiZGY0NmVjYTRkMjNlMGM2MWUwODYwMmMyNDU1YjdkZjJiODAyNWRkYjRkMDA0OTFj",
  },
  baseBuilder: {
    ownerAddress: "",
  },
  miniapp: {
    version: "1",
    name: "revoke-radar-mini",
    subtitle: "",
    description: "",
    screenshotUrls: [],
    iconUrl: `${ROOT_URL}/icon.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#000000",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "utility",
    tags: ["example"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "",
    ogTitle: "",
    ogDescription: "",
    ogImageUrl: `${ROOT_URL}/hero.png`,
  },
} as const;
