import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { cn } from '@/lib/utils';

const remarkPlugins = [remarkGfm, remarkMath];
const rehypePlugins = [rehypeKatex];

// Typography for rendered Markdown, expressed as Tailwind variants on the
// container so no stylesheet is needed.
const proseClasses = cn(
  'break-words',
  '[&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
  '[&_:is(p,li,blockquote)]:[font-family:inherit]',
  '[&_p]:my-3',
  '[&_h1]:mb-3 [&_h1]:mt-6 [&_h1]:font-sans [&_h1]:text-xl [&_h1]:font-semibold',
  '[&_h2]:mb-2 [&_h2]:mt-5 [&_h2]:font-sans [&_h2]:text-lg [&_h2]:font-semibold',
  '[&_h3]:mb-2 [&_h3]:mt-4 [&_h3]:font-sans [&_h3]:text-base [&_h3]:font-semibold',
  '[&_h4]:mb-2 [&_h4]:mt-4 [&_h4]:font-sans [&_h4]:font-semibold',
  '[&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6',
  '[&_li]:my-1 [&_li>p]:my-1',
  '[&_a]:text-brand [&_a]:underline [&_a]:underline-offset-2',
  '[&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-4 [&_blockquote]:text-muted-foreground',
  '[&_hr]:my-6 [&_hr]:border-border',
  '[&_:not(pre)>code]:rounded [&_:not(pre)>code]:bg-muted [&_:not(pre)>code]:px-1.5 [&_:not(pre)>code]:py-0.5 [&_:not(pre)>code]:font-mono [&_:not(pre)>code]:text-[0.85em]',
  '[&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-border [&_pre]:bg-muted [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[13px] [&_pre]:leading-relaxed'
);

const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer noopener" />,
  table: ({ node: _node, ...props }) => (
    <div className="my-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse font-sans text-sm" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => (
    <th className="border-b border-border bg-muted px-3 py-2 text-left font-medium" {...props} />
  ),
  td: ({ node: _node, ...props }) => (
    <td className="border-b border-border px-3 py-1.5 align-top" {...props} />
  ),
  img: ({ node: _node, alt, src, ...props }) => (
    <a href={src ?? '#'} target="_blank" rel="noreferrer noopener" className="my-2 inline-block">
      <img
        {...props}
        src={src}
        alt={alt ?? ''}
        loading="lazy"
        className="max-w-full rounded-lg border border-border"
      />
    </a>
  ),
};

export const Markdown = memo(function Markdown({
  content,
  className,
}: {
  content: string;
  className?: string;
}) {
  return (
    <div className={cn(proseClasses, className)}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
