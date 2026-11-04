'use client';

import React from 'react';

// Dynamically import KaTeX to avoid SSR issues
let katexLoaded = false;
let katex: any = null;

async function ensureKatex() {
  if (!katexLoaded) {
    katex = (await import('katex')).default;
    // Load KaTeX CSS
    if (typeof window !== 'undefined') {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
      document.head.appendChild(link);
    }
    katexLoaded = true;
  }
  return katex;
}

function renderLatexInline(text: string): React.ReactNode[] {
  // Split on $...$ for inline and $$...$$ for block
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    // Check for block math $$...$$
    const blockStart = remaining.indexOf('$$');
    // Check for inline math $...$
    const inlineStart = remaining.indexOf('$');

    if (blockStart === -1 && inlineStart === -1) {
      parts.push(remaining);
      break;
    }

    // Decide which comes first
    if (blockStart !== -1 && (inlineStart === -1 || blockStart <= inlineStart)) {
      // Handle block $$...$$
      const beforeBlock = remaining.slice(0, blockStart);
      if (beforeBlock) parts.push(beforeBlock);
      const afterOpen = remaining.slice(blockStart + 2);
      const closeIdx = afterOpen.indexOf('$$');
      if (closeIdx === -1) {
        // No closing $$, treat as text
        parts.push(remaining.slice(blockStart));
        break;
      }
      const formula = afterOpen.slice(0, closeIdx);
      parts.push(
        <KatexBlock key={`block-${keyIdx++}`} formula={formula} />
      );
      remaining = afterOpen.slice(closeIdx + 2);
    } else {
      // Handle inline $...$
      const beforeInline = remaining.slice(0, inlineStart);
      if (beforeInline) parts.push(beforeInline);
      const afterOpen = remaining.slice(inlineStart + 1);
      const closeIdx = afterOpen.indexOf('$');
      if (closeIdx === -1) {
        // No closing $, treat as text
        parts.push(remaining.slice(inlineStart));
        break;
      }
      const formula = afterOpen.slice(0, closeIdx);
      parts.push(
        <KatexInline key={`inline-${keyIdx++}`} formula={formula} />
      );
      remaining = afterOpen.slice(closeIdx + 1);
    }
  }

  return parts;
}

function KatexInline({ formula }: { formula: string }) {
  const [html, setHtml] = React.useState('');
  React.useEffect(() => {
    ensureKatex().then(k => {
      try {
        setHtml(k.renderToString(formula, { throwOnError: false }));
      } catch {
        setHtml(`$${formula}$`);
      }
    });
  }, [formula]);
  if (!html) return <span>${formula}$</span>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function KatexBlock({ formula }: { formula: string }) {
  const [html, setHtml] = React.useState('');
  React.useEffect(() => {
    ensureKatex().then(k => {
      try {
        setHtml(k.renderToString(formula, { throwOnError: false, displayMode: true }));
      } catch {
        setHtml(`$$${formula}$$`);
      }
    });
  }, [formula]);
  if (!html) return <div className="text-center py-2">$${formula}$$</div>;
  return <div className="overflow-x-auto py-2 text-center" dangerouslySetInnerHTML={{ __html: html }} />;
}

/**
 * Renders markdown-like text with LaTeX math support.
 * Supports:
 * - ## headers
 * - **bold** text
 * - - bullet points
 * - $...$ inline math
 * - $$...$$ block math
 */
export function LatexRenderer({ content }: { content: string }) {
  const lines = content.split('\n');

  return (
    <div className="latex-content space-y-2 text-base leading-relaxed">
      {lines.map((line, lineIdx) => {
        const trimmed = line.trim();

        // Skip empty lines (but add spacing)
        if (!trimmed) return <div key={lineIdx} className="h-2" />;

        // ## Header
        if (trimmed.startsWith('## ')) {
          const text = trimmed.slice(3);
          return (
            <h2 key={lineIdx} className="text-xl font-bold mt-6 mb-2 text-primary border-b border-border pb-1">
              {renderLatexInline(text)}
            </h2>
          );
        }

        // # Header
        if (trimmed.startsWith('# ')) {
          const text = trimmed.slice(2);
          return (
            <h1 key={lineIdx} className="text-2xl font-bold mt-4 mb-2">
              {renderLatexInline(text)}
            </h1>
          );
        }

        // ### Header
        if (trimmed.startsWith('### ')) {
          const text = trimmed.slice(4);
          return (
            <h3 key={lineIdx} className="text-lg font-semibold mt-4 mb-1 text-foreground/90">
              {renderLatexInline(text)}
            </h3>
          );
        }

        // Bullet point
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          const text = trimmed.slice(2);
          return (
            <div key={lineIdx} className="flex gap-2 ml-4">
              <span className="text-primary mt-1 flex-shrink-0">•</span>
              <span>{renderLineWithBold(text)}</span>
            </div>
          );
        }

        // Numbered list
        const numberedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
        if (numberedMatch) {
          return (
            <div key={lineIdx} className="flex gap-2 ml-4">
              <span className="text-primary font-semibold flex-shrink-0">{numberedMatch[1]}.</span>
              <span>{renderLineWithBold(numberedMatch[2])}</span>
            </div>
          );
        }

        // Regular paragraph with inline LaTeX + bold
        return (
          <p key={lineIdx} className="mb-1">
            {renderLineWithBold(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function renderLineWithBold(text: string): React.ReactNode {
  // First handle bold **...**
  const boldParts = text.split(/(\*\*[^*]+\*\*)/g);
  const nodes: React.ReactNode[] = [];

  boldParts.forEach((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      const inner = part.slice(2, -2);
      nodes.push(<strong key={i} className="font-semibold">{renderLatexInline(inner)}</strong>);
    } else {
      const latexNodes = renderLatexInline(part);
      latexNodes.forEach((n, j) => nodes.push(<React.Fragment key={`${i}-${j}`}>{n}</React.Fragment>));
    }
  });

  return <>{nodes}</>;
}
