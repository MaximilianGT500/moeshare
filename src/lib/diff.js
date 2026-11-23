'use strict';

const MAX_EDITS = 1500;
const CONTEXT = 3;

function splitLines(text) {
  const normalized = String(text || '').replace(/\r\n?/g, '\n');
  if (!normalized) return [];
  const lines = normalized.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function shortestEdit(a, b) {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace = [];
  for (let d = 0; d <= max; d++) {
    if (d > MAX_EDITS) return null;
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[offset + k - 1] < v[offset + k + 1]) ? v[offset + k + 1] : v[offset + k - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return { trace, offset };
    }
  }
  return { trace, offset };
}

function backtrack(a, b, { trace }) {
  const ops = [];
  let x = a.length;
  let y = b.length;
  for (let d = trace.length - 1; d >= 0; d--) {
    const v = trace[d];
    const at = (k) => v[k + d + 1];
    const k = x - y;
    const previous = k === -d || (k !== d && at(k - 1) < at(k + 1)) ? k + 1 : k - 1;
    const startX = Math.max(0, at(previous));
    const startY = startX - previous;
    while (x > startX && y > startY) {
      ops.push({ type: 'same', a: x - 1, b: y - 1 });
      x -= 1;
      y -= 1;
    }
    if (d > 0) {
      if (x === startX) ops.push({ type: 'add', b: y - 1 });
      else ops.push({ type: 'del', a: x - 1 });
    }
    x = startX;
    y = startY;
  }
  return ops.reverse();
}

function lineDiff(before, after, { context = CONTEXT } = {}) {
  const a = splitLines(before);
  const b = splitLines(after);
  const path = shortestEdit(a, b);
  if (!path) return { tooLarge: true, added: null, removed: null, hunks: [] };
  const ops = backtrack(a, b, path);
  const added = ops.filter((op) => op.type === 'add').length;
  const removed = ops.filter((op) => op.type === 'del').length;
  const changed = ops.map((op, index) => (op.type === 'same' ? -1 : index)).filter((index) => index >= 0);
  const hunks = [];
  let current = null;
  for (const index of changed) {
    const start = Math.max(0, index - context);
    const end = Math.min(ops.length - 1, index + context);
    if (current && start <= current.end + 1) current.end = end;
    else {
      current = { start, end };
      hunks.push(current);
    }
  }
  return {
    tooLarge: false,
    added,
    removed,
    hunks: hunks.map(({ start, end }) => {
      const slice = ops.slice(start, end + 1);
      const first = slice[0];
      return {
        beforeStart: (first.a ?? slice.find((op) => op.a !== undefined)?.a ?? 0) + 1,
        afterStart: (first.b ?? slice.find((op) => op.b !== undefined)?.b ?? 0) + 1,
        lines: slice.map((op) =>
          op.type === 'same'
            ? { type: 'same', text: a[op.a], before: op.a + 1, after: op.b + 1 }
            : op.type === 'del'
              ? { type: 'del', text: a[op.a], before: op.a + 1 }
              : { type: 'add', text: b[op.b], after: op.b + 1 }
        ),
      };
    }),
  };
}

module.exports = { lineDiff, splitLines };
