import test from 'node:test';
import assert from 'node:assert/strict';
import { isStaticAssetPath } from '../src/services/staticRouting.js';

test('nested host edit and preview routes fall through to the SPA while missing assets remain assets', () => {
  assert.equal(isStaticAssetPath('/host/quiz/quiz-id/edit'), false);
  assert.equal(isStaticAssetPath('/host/quiz/quiz-id/preview'), false);
  assert.equal(isStaticAssetPath('/src/main.js'), true);
  assert.equal(isStaticAssetPath('/missing.css'), true);
});
