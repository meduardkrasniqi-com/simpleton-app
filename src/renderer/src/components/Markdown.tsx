import { createContext, memo, useContext, useMemo, type CSSProperties, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { embeddedImages, Gallery, imagePath, imageUrl, mentionedImages, Shot } from "@/components/Shot";
import { useFileLinks } from "@/lib/fileLinks";
import { languageForFence, tokenStyle, useTokens } from "@/lib/highlight";
import { cn } from "@/lib/utils";

type Node = { type: string; value?: string; url?: string; children?: Node[] };

const candidate = /(?<![\w/.:@-])(?:\.{1,2}\/|\/)?(?:(?:[\w@+\-[\]]|\.(?!\.))+\/)*[\w@+\-[\]][\w@.+\-[\]]*\.[A-Za-z0-9]+(?::\d+(?::\d+)?)?/g;

const skip = new Set(["link", "linkReference", "inlineCode", "code", "definition"]);

function fileLinks(resolve: (text: string) => string | null) {
  const split = (value: string) => {
    const parts: Node[] = [];
    let last = 0;
    for (const match of value.matchAll(candidate)) {
      const path = resolve(match[0]);
      if (!path) continue;
      if (match.index > last) parts.push({ type: "text", value: value.slice(last, match.index) });
      parts.push({ type: "link", url: `#file:${path}`, children: [{ type: "text", value: match[0] }] });
      last = match.index + match[0].length;
    }
    if (!parts.length) return null;
    if (last < value.length) parts.push({ type: "text", value: value.slice(last) });
    return parts;
  };
  const walk = (node: Node) => {
    if (!node.children) return;
    node.children = node.children.flatMap((child) => {
      if (child.type === "text" && child.value) return split(child.value) ?? [child];
      if (!skip.has(child.type)) walk(child);
      return [child];
    });
  };
  return () => (tree: Node) => walk(tree);
}

function FileLink({ path, children }: { path: string; children: ReactNode }) {
  const links = useFileLinks();
  return (
    <button type="button" onClick={() => links?.open(path)} title={path} className="cursor-pointer text-left text-ask underline decoration-ask/30 underline-offset-2 hover:decoration-ask">
      {children}
    </button>
  );
}

function Anchor({ href, children }: { href?: string; children: ReactNode }) {
  const links = useFileLinks();
  if (href?.startsWith("#file:")) return <FileLink path={decodeURIComponent(href.slice(6))}>{children}</FileLink>;
  const path = href && !/^[a-z][a-z0-9+.-]*:/i.test(href) && !href.startsWith("#") ? links?.resolve(decodeURIComponent(href)) : null;
  if (path) return <FileLink path={path}>{children}</FileLink>;
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        if (href && /^https?:/.test(href)) window.open(href);
      }}
      className="cursor-pointer text-ask underline decoration-ask/30 underline-offset-2 hover:decoration-ask"
    >
      {children}
    </a>
  );
}

function InlineCode({ children }: { children: ReactNode }) {
  const links = useFileLinks();
  const path = typeof children === "string" ? links?.resolve(children) : null;
  const code = <code className="rounded-[5px] bg-stage px-[5px] py-[1px] font-mono text-[12.5px] [overflow-wrap:anywhere]">{children}</code>;
  if (!path) return code;
  return (
    <button type="button" onClick={() => links?.open(path)} title={path} className="cursor-pointer text-left text-ask [&>code]:hover:bg-ask/[0.1]">
      {code}
    </button>
  );
}

function Highlighted({ code, language }: { code: string; language: string | null }) {
  const tokens = useTokens(code, language);
  if (!tokens) return <code>{code}</code>;
  return (
    <code>
      {tokens.map((line, i) => (
        <span key={i}>
          {line.map((token, k) => (
            <span key={k} className="tk" style={tokenStyle(token)}>
              {token.content}
            </span>
          ))}
          {i < tokens.length - 1 && "\n"}
        </span>
      ))}
    </code>
  );
}

const Grouped = createContext(false);

function Image({ src, alt }: { src?: string; alt?: string }) {
  const links = useFileLinks();
  const grouped = useContext(Grouped);
  const path = typeof src === "string" ? imagePath(src, links?.root) : null;
  if (!path) return alt ? <span className="text-mute">{alt}</span> : null;
  if (grouped) return null;
  return <Shot path={path} alt={alt} className="my-1 mr-2" />;
}

const components: Components = {
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0 empty:hidden">{children}</p>,
  img: ({ src, alt }) => <Image src={typeof src === "string" ? src : undefined} alt={alt} />,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => <Anchor href={href}>{children}</Anchor>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5 first:mt-0 last:mb-0 marker:text-ink/30">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5 first:mt-0 last:mb-0 marker:text-mute">{children}</ol>,
  li: ({ children }) => <li className="pl-1 [&>ol]:my-1 [&>p]:my-1 [&>ul]:my-1">{children}</li>,
  h1: ({ children }) => <h3 className="mb-2 mt-5 text-[15px] font-semibold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mb-2 mt-5 text-[15px] font-semibold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mb-1.5 mt-4 text-[14px] font-semibold first:mt-0">{children}</h4>,
  h4: ({ children }) => <h4 className="mb-1.5 mt-4 text-[14px] font-semibold first:mt-0">{children}</h4>,
  blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-line pl-3 text-soft">{children}</blockquote>,
  hr: () => <hr className="my-5 border-line" />,
  pre: ({ children }) => (
    <pre className="my-3 overflow-x-auto rounded-lg border border-line bg-panel px-3.5 py-3 font-mono text-[12.5px] leading-[1.55] first:mt-0 last:mb-0 [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[12.5px]">{children}</pre>
  ),
  code: ({ className, children }) => {
    const fence = /language-([\w+#.-]+)/.exec(className ?? "");
    if (fence) return <Highlighted code={String(children).replace(/\n$/, "")} language={languageForFence(fence[1])} />;
    return <InlineCode>{children}</InlineCode>;
  },
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-line first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line bg-panel px-3 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-line px-3 py-1.5 align-top [tr:last-child_&]:border-b-0">{children}</td>,
};

function DocImage({ src, alt, width, height }: { src?: string; alt?: string; width?: string | number; height?: string | number }) {
  const links = useFileLinks();
  if (!src) return null;
  const path = imagePath(src, links?.root);
  const url = path ? imageUrl(path) : /^https:/i.test(src) ? src : null;
  if (!url) return alt ? <span className="text-mute">{alt}</span> : null;
  return <img src={url} alt={alt ?? ""} width={width} height={height} className="inline-block h-auto max-w-full align-middle" />;
}

const aligned = (align: unknown): CSSProperties | undefined => (align === "left" || align === "center" || align === "right" ? { textAlign: align } : undefined);

const pagePlugins = [rehypeRaw, rehypeSanitize];

const documentComponents: Components = {
  ...components,
  img: ({ src, alt, width, height }) => <DocImage src={typeof src === "string" ? src : undefined} alt={alt} width={width} height={height} />,
  h1: ({ children, node }) => (
    <h1 style={aligned(node?.properties.align)} className="mb-4 mt-8 border-b border-line pb-2 text-[26px] font-semibold leading-tight first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children, node }) => (
    <h2 style={aligned(node?.properties.align)} className="mb-3 mt-8 border-b border-line pb-1.5 text-[20px] font-semibold leading-snug first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => <h3 className="mb-2 mt-6 text-[16.5px] font-semibold first:mt-0">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-2 mt-5 text-[14.5px] font-semibold first:mt-0">{children}</h4>,
  h5: ({ children }) => <h5 className="mb-2 mt-5 text-[13.5px] font-semibold first:mt-0">{children}</h5>,
  h6: ({ children }) => <h6 className="mb-2 mt-5 text-[13.5px] font-semibold text-soft first:mt-0">{children}</h6>,
  p: ({ children, node }) => (
    <p style={aligned(node?.properties.align)} className="my-4 first:mt-0 last:mb-0 empty:hidden">
      {children}
    </p>
  ),
  div: ({ children, node }) => <div style={aligned(node?.properties.align)}>{children}</div>,
};

export const Markdown = memo(function Markdown({ text, page }: { text: string; page?: boolean }) {
  const links = useFileLinks();
  const plugins = useMemo(() => (links ? [remarkGfm, fileLinks(links.resolve)] : [remarkGfm]), [links]);
  const extra = useMemo(() => (page ? [] : mentionedImages(text, links?.root)), [text, links?.root, page]);
  const pictures = useMemo(() => (page ? [] : [...embeddedImages(text, links?.root), ...extra.map((path) => ({ path }))]), [text, links?.root, extra, page]);
  const grouped = pictures.length > 1;
  return (
    <div className={cn("selectable", page ? "text-[14.5px] leading-[1.7]" : "text-[14px] leading-[1.6]")}>
      <Grouped.Provider value={grouped}>
        <ReactMarkdown remarkPlugins={plugins} rehypePlugins={page ? pagePlugins : undefined} components={page ? documentComponents : components}>
          {text}
        </ReactMarkdown>
      </Grouped.Provider>
      {grouped && <Gallery items={pictures} />}
      {!grouped && extra.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {extra.map((path) => (
            <Shot key={path} path={path} quiet />
          ))}
        </div>
      )}
    </div>
  );
});
