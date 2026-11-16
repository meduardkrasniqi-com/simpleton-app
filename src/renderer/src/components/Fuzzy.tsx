export function match(query: string, path: string) {
  const lower = path.toLowerCase();
  const nameStart = lower.lastIndexOf("/") + 1;
  const positions: number[] = [];
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of query) {
    const at = lower.indexOf(char, from);
    if (at === -1) return null;
    positions.push(at);
    if (at === previous + 1) score += 8;
    if (at >= nameStart) score += 4;
    if (at === nameStart || "/-_. ".includes(lower[at - 1] ?? "/")) score += 6;
    score -= Math.min(at - from, 10) * 0.5;
    previous = at;
    from = at + 1;
  }
  const name = lower.slice(nameStart);
  if (name === query) score += 100;
  else if (name.startsWith(query)) score += 40;
  score -= path.length * 0.05;
  return { score, positions };
}

export function Highlight({ text, offset, positions }: { text: string; offset: number; positions: Set<number> }) {
  return (
    <>
      {[...text].map((char, i) =>
        positions.has(i + offset) ? (
          <span key={i} className="font-semibold text-ink">
            {char}
          </span>
        ) : (
          char
        ),
      )}
    </>
  );
}
