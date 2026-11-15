import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { languageForFence, tokenStyle, useTokens } from "@/lib/highlight";

function Highlighted({ code, language }: { code: string; language: string | null }) {
  const tokens = useTokens(code, language);
  if (!tokens) return <code>{code}</code>;
  return (
    <code>
      {tokens.map((line, i) => (
        <span key={i}>
          {line.map((token, k) => (
            <span key={k} style={tokenStyle(token)}>
              {token.content}
            </span>
          ))}
          {i < tokens.length - 1 && "\n"}
        </span>
      ))}
    </code>
  );
}

const components: Components = {
  p: ({ children }) => <p className="my-3 first:mt-0 last:mb-0">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  a: ({ href, children }) => (
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
  ),
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5 first:mt-0 last:mb-0 marker:text-black/30">{children}</ul>,
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
    return <code className="rounded-[5px] bg-stage px-[5px] py-[1px] font-mono text-[12.5px] [overflow-wrap:anywhere]">{children}</code>;
  },
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-line first:mt-0 last:mb-0">
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line bg-panel px-3 py-1.5 text-left font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-b border-line px-3 py-1.5 align-top [tr:last-child_&]:border-b-0">{children}</td>,
};

export const Markdown = memo(function Markdown({ text }: { text: string }) {
  return (
    <div className="selectable text-[14px] leading-[1.6]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
});
