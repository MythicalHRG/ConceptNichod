'use client';

import React from 'react';
import katex from 'katex';

export interface Block {
  type: 'display-math' | 'markdown';
  content: string;
}

/**
 * Splits document into display-math blocks ($$...$$ and \[...\]) and markdown blocks
 * BEFORE splitting by newlines, preserving multi-line display math blocks.
 */
export function splitDisplayMathBlocks(content: string | null | undefined): Block[] {
  if (!content || typeof content !== 'string') return [];
  const blocks: Block[] = [];
  let i = 0;
  let textStart = 0;

  while (i < content.length) {
    if (content.startsWith('$$', i)) {
      const mathStart = i + 2;
      const mathEnd = content.indexOf('$$', mathStart);
      if (mathEnd !== -1) {
        if (i > textStart) {
          blocks.push({ type: 'markdown', content: content.substring(textStart, i) });
        }
        blocks.push({ type: 'display-math', content: content.substring(mathStart, mathEnd).trim() });
        i = mathEnd + 2;
        textStart = i;
        continue;
      }
    } else if (content.startsWith('\\[', i)) {
      const mathStart = i + 2;
      const mathEnd = content.indexOf('\\]', mathStart);
      if (mathEnd !== -1) {
        if (i > textStart) {
          blocks.push({ type: 'markdown', content: content.substring(textStart, i) });
        }
        blocks.push({ type: 'display-math', content: content.substring(mathStart, mathEnd).trim() });
        i = mathEnd + 2;
        textStart = i;
        continue;
      }
    }
    i++;
  }

  if (textStart < content.length) {
    blocks.push({ type: 'markdown', content: content.substring(textStart) });
  }

  return blocks;
}

export interface InlineToken {
  type: 'text' | 'inline-math' | 'bold' | 'code';
  value?: string;
  formula?: string;
  children?: InlineToken[];
}

/**
 * Tokenizes an inline line of text for math ($...$, \(...\)), code (`...`), and markdown bold (**...**)
 * without mangling math expressions containing asterisks like $f^*(x)$.
 * Follows CommonMark/Pandoc math standard: opening $ cannot be followed by whitespace, closing $ cannot be preceded by whitespace.
 */
export function tokenizeInline(text: string | null | undefined): InlineToken[] {
  if (!text || typeof text !== 'string') return [];
  const tokens: InlineToken[] = [];
  let i = 0;
  let textStart = 0;

  function flushText(end: number) {
    if (end > textStart) {
      tokens.push({ type: 'text', value: text!.substring(textStart, end) });
    }
  }

  while (i < text.length) {
    // Escaped dollar: \$ -> literal $
    if (text.startsWith('\\$', i)) {
      flushText(i);
      tokens.push({ type: 'text', value: '$' });
      i += 2;
      textStart = i;
      continue;
    }

    // Inline LaTeX \( ... \)
    if (text.startsWith('\\(', i)) {
      const mathStart = i + 2;
      const mathEnd = text.indexOf('\\)', mathStart);
      if (mathEnd !== -1) {
        flushText(i);
        tokens.push({ type: 'inline-math', formula: text.substring(mathStart, mathEnd).trim() });
        i = mathEnd + 2;
        textStart = i;
        continue;
      }
    }

    // Inline code `...`
    if (text[i] === '`') {
      const codeStart = i + 1;
      const codeEnd = text.indexOf('`', codeStart);
      if (codeEnd !== -1) {
        flushText(i);
        tokens.push({ type: 'code', value: text.substring(codeStart, codeEnd) });
        i = codeEnd + 1;
        textStart = i;
        continue;
      }
    }

    // Inline LaTeX $ ... $ (must not be $$)
    if (text[i] === '$' && !text.startsWith('$$', i)) {
      const mathStart = i + 1;
      // Opening delimiter must not be followed by whitespace
      if (mathStart < text.length && text[mathStart] !== ' ' && text[mathStart] !== '\t') {
        let mathEnd = -1;
        for (let j = mathStart; j < text.length; j++) {
          if (text[j] === '$' && text[j - 1] !== '\\') {
            // Closing delimiter must not be preceded by whitespace
            if (text[j - 1] !== ' ' && text[j - 1] !== '\t') {
              mathEnd = j;
              break;
            }
          }
        }
        if (mathEnd !== -1 && mathEnd > mathStart) {
          flushText(i);
          tokens.push({ type: 'inline-math', formula: text.substring(mathStart, mathEnd).trim() });
          i = mathEnd + 1;
          textStart = i;
          continue;
        }
      }
    }

    // Markdown Bold ** ... **
    if (text.startsWith('**', i)) {
      const boldStart = i + 2;
      const boldEnd = text.indexOf('**', boldStart);
      if (boldEnd !== -1 && boldEnd > boldStart) {
        flushText(i);
        tokens.push({
          type: 'bold',
          children: tokenizeInline(text.substring(boldStart, boldEnd)),
        });
        i = boldEnd + 2;
        textStart = i;
        continue;
      }
    }

    i++;
  }

  flushText(text.length);
  return tokens;
}

export function renderTokens(tokens: InlineToken[], parentKey: string = ''): React.ReactNode[] {
  return tokens.map((token, idx) => {
    const key = `${parentKey}-${idx}`;
    if (token.type === 'inline-math' && token.formula) {
      return <KatexInline key={key} formula={token.formula} />;
    }
    if (token.type === 'code' && token.value) {
      return (
        <code key={key} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary font-medium">
          {token.value}
        </code>
      );
    }
    if (token.type === 'bold' && token.children) {
      return (
        <strong key={key} className="font-semibold">
          {renderTokens(token.children, key)}
        </strong>
      );
    }
    return <React.Fragment key={key}>{token.value}</React.Fragment>;
  });
}

export function renderInlineLine(text: string): React.ReactNode {
  const tokens = tokenizeInline(text);
  return <>{renderTokens(tokens)}</>;
}

export function KatexInline({ formula }: { formula: string }) {
  let html = '';
  try {
    html = katex.renderToString(formula, {
      throwOnError: false,
      displayMode: false,
    });
  } catch {
    return <span>${formula}$</span>;
  }
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function KatexBlock({ formula }: { formula: string }) {
  let html = '';
  try {
    html = katex.renderToString(formula, {
      throwOnError: false,
      displayMode: true,
    });
  } catch {
    return <div className="text-center py-2">$${formula}$$</div>;
  }
  return (
    <div
      className="overflow-x-auto py-2 text-center"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function LatexRenderer({ content }: { content?: string | null }) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const blocks = splitDisplayMathBlocks(content);

  return (
    <div className="latex-content space-y-2 text-base leading-relaxed">
      {blocks.map((block, blockIdx) => {
        if (block.type === 'display-math') {
          return <KatexBlock key={`block-math-${blockIdx}`} formula={block.content} />;
        }

        const lines = block.content.split('\n');

        return (
          <React.Fragment key={`block-md-${blockIdx}`}>
            {lines.map((line, lineIdx) => {
              const trimmed = line.trim();

              if (!trimmed) {
                return <div key={lineIdx} className="h-2" />;
              }

              // # Header
              if (trimmed.startsWith('# ')) {
                return (
                  <h1 key={lineIdx} className="text-2xl font-bold mt-4 mb-2">
                    {renderInlineLine(trimmed.slice(2))}
                  </h1>
                );
              }

              // ## Header
              if (trimmed.startsWith('## ')) {
                return (
                  <h2 key={lineIdx} className="text-xl font-bold mt-6 mb-2 text-primary border-b border-border pb-1">
                    {renderInlineLine(trimmed.slice(3))}
                  </h2>
                );
              }

              // ### Header
              if (trimmed.startsWith('### ')) {
                return (
                  <h3 key={lineIdx} className="text-lg font-semibold mt-4 mb-1 text-foreground/90">
                    {renderInlineLine(trimmed.slice(4))}
                  </h3>
                );
              }

              // Bullet list (- or * followed by space, but not **)
              if (trimmed.startsWith('- ') || (trimmed.startsWith('* ') && !trimmed.startsWith('**'))) {
                return (
                  <div key={lineIdx} className="flex gap-2 ml-4">
                    <span className="text-primary mt-1 flex-shrink-0">•</span>
                    <span>{renderInlineLine(trimmed.slice(2))}</span>
                  </div>
                );
              }

              // Numbered list
              const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
              if (numMatch) {
                return (
                  <div key={lineIdx} className="flex gap-2 ml-4">
                    <span className="text-primary font-semibold flex-shrink-0">{numMatch[1]}.</span>
                    <span>{renderInlineLine(numMatch[2])}</span>
                  </div>
                );
              }

              // Regular paragraph
              return (
                <p key={lineIdx} className="mb-1">
                  {renderInlineLine(trimmed)}
                </p>
              );
            })}
          </React.Fragment>
        );
      })}
    </div>
  );
}
