export type LineMark = "add" | "mod";

export type Decorations = {
  marks: (LineMark | undefined)[];
  removals: Set<number>;
  added: number;
  removed: number;
};

const maxEdits = 2000;

function myers(a: string[], b: string[]) {
  const n = a.length;
  const m = b.length;
  const trace: Int32Array[] = [];
  let prev = new Int32Array(1);
  for (let d = 0; d <= n + m; d++) {
    if (d > maxEdits) return null;
    const cur = new Int32Array(2 * d + 1);
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (d === 0) x = 0;
      else if (k === -d || (k !== d && prev[k - 1 + d - 1] < prev[k + 1 + d - 1])) x = prev[k + 1 + d - 1];
      else x = prev[k - 1 + d - 1] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      cur[k + d] = x;
      if (x >= n && y >= m) {
        trace.push(cur);
        return backtrack(trace, n, m);
      }
    }
    trace.push(cur);
    prev = cur;
  }
  return null;
}

function backtrack(trace: Int32Array[], n: number, m: number) {
  const ops: number[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const v = trace[d - 1];
    const k = x - y;
    const down = k === -d || (k !== d && v[k - 1 + d - 1] < v[k + 1 + d - 1]);
    const prevK = down ? k + 1 : k - 1;
    const prevX = v[prevK + d - 1];
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      ops.push(0);
      x--;
      y--;
    }
    if (down) {
      ops.push(1);
      y--;
    } else {
      ops.push(-1);
      x--;
    }
  }
  while (x > 0 && y > 0) {
    ops.push(0);
    x--;
    y--;
  }
  return ops.reverse();
}

export function decorate(base: string[], next: string[]): Decorations {
  const marks: (LineMark | undefined)[] = new Array(next.length);
  const removals = new Set<number>();
  let start = 0;
  while (start < base.length && start < next.length && base[start] === next[start]) start++;
  let endBase = base.length;
  let endNext = next.length;
  while (endBase > start && endNext > start && base[endBase - 1] === next[endNext - 1]) {
    endBase--;
    endNext--;
  }
  const a = base.slice(start, endBase);
  const b = next.slice(start, endNext);
  const ops = myers(a, b) ?? [...a.map(() => -1), ...b.map(() => 1)];
  let added = 0;
  let removed = 0;
  let j = start;
  let i = 0;
  while (i < ops.length) {
    if (ops[i] === 0) {
      j++;
      i++;
      continue;
    }
    let dels = 0;
    let ins = 0;
    const from = j;
    while (i < ops.length && ops[i] !== 0) {
      if (ops[i] === 1) {
        ins++;
        j++;
      } else dels++;
      i++;
    }
    added += ins;
    removed += dels;
    if (ins === 0) removals.add(from);
    for (let line = from; line < from + ins; line++) marks[line] = dels > 0 ? "mod" : "add";
  }
  return { marks, removals, added, removed };
}
