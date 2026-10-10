export default function handler(_req, res) {
  const rawBackendUrl = process.env.BACKEND_URL;

  if (!rawBackendUrl) {
    res.statusCode = 500;
    res.end("BACKEND_URL is not configured.");
    return;
  }

  let backendUrl;

  try {
    const parsed = new URL(rawBackendUrl);

    if (!["https:", "http:"].includes(parsed.protocol)) {
      throw new Error("Invalid URL protocol");
    }

    backendUrl = parsed.origin;
  } catch {
    res.statusCode = 500;
    res.end("BACKEND_URL is invalid.");
    return;
  }

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");

  res.end(
    `window.APTIQUIZ_CONFIG = Object.freeze({ backendUrl: ${JSON.stringify(backendUrl)} });`
  );
}
