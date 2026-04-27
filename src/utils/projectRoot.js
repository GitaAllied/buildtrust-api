import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// backend/src/utils -> backend/src -> backend
const backendRoot = resolve(__dirname, '..', '..');
const repoRoot = resolve(backendRoot, '..');

export const resolveBackendPath = (...segments) => resolve(backendRoot, ...segments);
export const resolveRepoPath = (...segments) => resolve(repoRoot, ...segments);
