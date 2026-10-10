import { extname } from 'node:path';

const assetExtensions = new Set(['.css', '.html', '.js', '.json', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2']);

export const isStaticAssetPath = (pathname) => assetExtensions.has(extname(pathname).toLowerCase());
