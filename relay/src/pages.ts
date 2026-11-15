export type PageState = "offline" | "stopped" | "starting" | "unreachable" | "timeout" | "missing";

type Page = { status: number; title: string; text: string; dot: string; refresh?: number; retry?: boolean; spinner?: boolean };

const SITE = "https://www.simpleton.io";

const pages: Record<PageState, Page> = {
  offline: { status: 502, title: "This preview is offline", text: "Its owner isn't sharing it right now.", dot: "#a3a3a3", refresh: 15 },
  stopped: { status: 503, title: "This preview is paused", text: "The app isn't running right now.", dot: "#f59e0b", refresh: 10 },
  starting: { status: 503, title: "Starting the app", text: "This page reloads when it's ready.", dot: "#0a0a0a", refresh: 3, spinner: true },
  unreachable: { status: 502, title: "The app isn't responding", text: "It may have crashed or still be starting.", dot: "#dc2626", retry: true },
  timeout: { status: 504, title: "The app took too long", text: "It may still be compiling.", dot: "#dc2626", retry: true },
  missing: { status: 404, title: "Nothing here", text: "This link doesn't exist or was turned off.", dot: "#a3a3a3" },
};

export const isPageState = (value: string | null): value is PageState => !!value && value in pages;

const mark = (size: number, id: string) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><defs><linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="24" x2="24" y2="0"><stop offset="0" stop-color="#ff8a3d"/><stop offset=".5" stop-color="#f0508a"/><stop offset="1" stop-color="#6b7bff"/></linearGradient></defs><rect width="24" height="24" rx="7" fill="url(#${id})"/><path d="M8 7v10M16 10.5c0 3.5-8 2.5-8 6.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="8" cy="6.5" r="2.1" fill="#fff"/><circle cx="8" cy="17.5" r="2.1" fill="#fff"/><circle cx="16" cy="8.5" r="2.4" fill="#fff"/></svg>`;

const style = `
*{box-sizing:border-box;margin:0}
html,body{min-height:100%}
body{font-family:Geist,ui-sans-serif,system-ui,-apple-system,sans-serif;color:#0a0a0a;-webkit-font-smoothing:antialiased;background:radial-gradient(60% 70% at 8% 12%,#ffd9b0 0%,transparent 60%),radial-gradient(55% 65% at 92% 8%,#c9d6ff 0%,transparent 60%),radial-gradient(60% 70% at 85% 95%,#ffc9d6 0%,transparent 60%),radial-gradient(55% 60% at 12% 92%,#c8eedb 0%,transparent 60%),#f6f3ef;background-attachment:fixed}
main{min-height:100vh;min-height:100dvh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px 16px}
.card{width:100%;max-width:440px;padding:44px 32px 40px;text-align:center;border-radius:28px;background:rgba(255,255,255,.84);border:1px solid rgba(10,10,10,.06);box-shadow:0 1px 2px rgba(10,10,10,.04),0 30px 70px -30px rgba(10,10,10,.22);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px)}
.state{height:24px;display:grid;place-items:center;margin-bottom:22px}
.dot{width:10px;height:10px;border-radius:50%;background:var(--dot);box-shadow:0 0 0 7px color-mix(in srgb,var(--dot) 16%,transparent)}
.spin{width:22px;height:22px;border-radius:50%;border:2.5px solid rgba(10,10,10,.1);border-top-color:#0a0a0a;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
h1{font-size:30px;line-height:1.08;letter-spacing:-.04em;font-weight:600;text-wrap:balance}
p{margin-top:10px;font-size:16px;line-height:1.5;color:#525252;text-wrap:balance}
button{margin-top:26px;height:40px;padding:0 20px;border-radius:999px;border:1px solid #e5e5e5;background:#fff;color:inherit;font:inherit;font-size:14px;font-weight:500;cursor:pointer}
button:hover{background:#fafafa}
.promo{width:100%;max-width:440px;display:flex;align-items:center;gap:12px;padding:10px 10px 10px 12px;border-radius:20px;color:inherit;text-decoration:none;background:rgba(255,255,255,.6);border:1px solid rgba(10,10,10,.06);-webkit-backdrop-filter:blur(20px);backdrop-filter:blur(20px);transition:background .15s}
.promo:hover{background:rgba(255,255,255,.85)}
.promo svg{flex:none}
.tag{flex:1;min-width:0;font-size:14px;line-height:1.3;font-weight:600;letter-spacing:-.015em}
.glow{background:linear-gradient(95deg,#ff8a3d 0%,#f0508a 45%,#6b7bff 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
.cta{flex:none;height:34px;padding:0 14px;display:inline-flex;align-items:center;border-radius:999px;background:#0a0a0a;color:#fff;font-size:13px;font-weight:500}
.promo:hover .cta{background:#262626}
@media (max-width:400px){.tag span{display:block}}
@media (prefers-reduced-motion:reduce){.spin{animation-duration:2.4s}}
`;

function html(page: Page) {
  const icon = `data:image/svg+xml,${encodeURIComponent(mark(24, "f"))}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
${page.refresh ? `<meta http-equiv="refresh" content="${page.refresh}">` : ""}
<title>${page.title}</title>
<link rel="icon" href="${icon}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap">
<style>${style}</style>
</head>
<body>
<main>
<section class="card" style="--dot:${page.dot}">
<div class="state">${page.spinner ? `<span class="spin" role="status" aria-label="Loading"></span>` : `<span class="dot"></span>`}</div>
<h1>${page.title}</h1>
<p>${page.text}</p>
${page.retry ? `<button type="button" onclick="location.reload()">Try again</button>` : ""}
</section>
<a class="promo" href="${SITE}">
${mark(34, "m")}
<span class="tag"><span>Agents build it.</span> <span class="glow">You send the link.</span></span>
<span class="cta">Get Simpleton</span>
</a>
</main>
</body>
</html>`;
}

export function page(state: PageState, request: Request) {
  const current = pages[state];
  const wantsHtml = (request.headers.get("Accept") ?? "").includes("text/html");
  const headers = new Headers({ "Cache-Control": "no-store", "X-Robots-Tag": "noindex" });
  if (current.refresh) headers.set("Retry-After", String(current.refresh));
  headers.set("Content-Type", wantsHtml ? "text/html; charset=utf-8" : "text/plain; charset=utf-8");
  const body = request.method === "HEAD" ? null : wantsHtml ? html(current) : `${current.title}. ${current.text}`;
  return new Response(body, { status: current.status, headers });
}
