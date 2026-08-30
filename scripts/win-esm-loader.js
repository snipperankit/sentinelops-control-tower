// Registration entry point: called via --import to register the ESM resolve hook
import { register } from 'node:module';

const hooksUrl = new URL('./win-esm-resolve-hook.js', import.meta.url);
register(hooksUrl);
