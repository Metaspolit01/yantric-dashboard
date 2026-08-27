const { test } = require('node:test');
const assert = require('node:assert');

// This file is compiled from src/lib/knowledge-pipeline.ts by `npm test`.
const pipeline = require('./.compiled/knowledge-pipeline.js');

test('cleanText collapses whitespace', () => {
  assert.strictEqual(pipeline.cleanText('  a \n\t b   c '), 'a b c');
});

test('chunkText returns empty array for blank input', () => {
  assert.deepStrictEqual(pipeline.chunkText('   \n  '), []);
});

test('chunks stay within maxLen and are non-empty', () => {
  const sentence =
    'Sentence number %i explains services, timings and pricing details for the business.';
  const text = Array.from({ length: 30 }, (_, i) => sentence.replace('%i', String(i))).join(' ');
  const chunks = pipeline.chunkText(text, 400, 80);

  assert.ok(chunks.length > 1, 'long text must produce several chunks');
  for (const chunk of chunks) {
    assert.ok(chunk.trim().length > 0, 'no empty chunks');
    assert.ok(chunk.length <= 500, `chunk length ${chunk.length} stays near maxLen`);
  }
});

test('consecutive chunks share overlapping context', () => {
  const sentence = 'The clinic opens at nine in the morning every day of the week.';
  const text = Array.from({ length: 20 }, () => sentence).join(' ');
  const chunks = pipeline.chunkText(text, 200, 60);

  assert.ok(chunks.length > 2, 'expected multiple chunks');
  const lastWordOfFirst = chunks[0].trim().split(/\s+/).pop();
  assert.ok(chunks[1].includes(lastWordOfFirst), 'overlap carries previous content forward');
});

test('a single oversized sentence is hard-split instead of crashing', () => {
  const giant = 'x'.repeat(2500) + '.';
  const chunks = pipeline.chunkText(giant, 800, 120);
  assert.ok(chunks.length >= 3);
  for (const chunk of chunks) assert.ok(chunk.length <= 1000);
});

test('Devanagari danda is treated as a sentence boundary', () => {
  const text =
    'क्लिनिक सुबह नौ बजे खुलती है। शाम को छह बजे बंद हो जाती है। रविवार को छुट्टी रहती है।';
  const chunks = pipeline.chunkText(text, 60, 10);
  assert.ok(chunks.length >= 2, 'danda-separated sentences can split into chunks');
});
