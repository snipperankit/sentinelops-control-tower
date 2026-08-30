// ESM resolve hook: converts raw Windows absolute paths (C:\...) to file:// URLs
import { pathToFileURL } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
  if (/^[a-zA-Z]:[/\\]/.test(specifier)) {
    return nextResolve(pathToFileURL(specifier).href, context);
  }
  return nextResolve(specifier, context);
}
