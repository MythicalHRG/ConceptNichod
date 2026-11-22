'use client';

import React from 'react';
import katex from 'katex';

export interface Block {
  type: 'display-math' | 'markdown';
  content: string;
}

/**
 * Repairs LaTeX commands corrupted when LLM JSON responses contained unescaped
 * backslashes (\t -> TAB, \n -> newline, \f -> formfeed, \r -> CR, \b -> backspace),
 * as well as hallucinated macro names like \textemptyset / \textbraceleft / \textbar.
 * Safely fixes both newly generated and already-stored MongoDB content.
 */
export function repairCorruptedLatex(input: string): string {
  if (!input || typeof input !== 'string') return '';
  let s = input;

  // 1. Reconstruct control characters produced by unescaped JSON sequences before LaTeX commands
  s = s
    .replace(/\t(?=(?:ext[a-zA-Z]*|imes|heta|o\b|au\b|an\b|riangle))/g, '\\t')
    .replace(/\r?\n(?=(?:eq\b|abla\b|otin\b|u\b))/g, ' \\n')
    .replace(/\f(?=(?:rac\b|orall\b))/g, '\\f')
    .replace(/\r(?=(?:ight|ho\b))/g, '\\r')
    .replace(/\x08(?=(?:eta\b|ar\b|egin\b|inom\b|ig))/g, '\\b');

  // 2. Also repair space-corrupted `ext{...}` fragments (e.g. `$ ext{ extemptyset}$`)
  s = s
    .replace(/(^|[\s$({=,])ext(?=(?:\{|emptyset|braceleft|braceright|bar|phi|varphi|infty|subset|subseteq|cup|cap|in\b|notin))/g, '$1\\text');

  // 3. Map non-standard / hallucinated `\text...` commands to standard KaTeX commands
  s = s
    .replace(/\\text\{\s*\\?text?emptyset\s*\}/g, '\\emptyset')
    .replace(/\\text\{\s*\\?text?braceleft\s*\}/g, '\\{')
    .replace(/\\text\{\s*\\?text?braceright\s*\}/g, '\\}')
    .replace(/\\text\{\s*\\?text?bar\s*\}/g, '\\mid')
    .replace(/\\text\{\s*\\?text?phi\s*\}/g, '\\phi')
    .replace(/\\textemptyset\b/g, '\\emptyset')
    .replace(/\\textbraceleft\b/g, '\\{')
    .replace(/\\textbraceright\b/g, '\\}')
    .replace(/\\textbar\b/g, '\\mid')
    .replace(/\\textphi\b/g, '\\phi');

  // 4. Clean stray leading whitespace right after an opening `$` when followed by a TeX command
  s = s.replace(/\$\s+(\\(?:text|emptyset|\{|frac|sqrt|mid|phi|neq|leq|geq|cup|cap|in|notin|subset|alpha|beta|gamma|theta|pi|sigma|omega|sum|int|vec|hat|bar|mathbf|mathbb|mathrm))/g, '$$$1');

  return s;
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

const BARE_TEX_SYMBOLS = [
  '\\emptyset', '\\varnothing', '\\cup', '\\cap', '\\in', '\\notin',
  '\\subset', '\\subseteq', '\\supset', '\\supseteq', '\\setminus',
  '\\forall', '\\exists', '\\infty', '\\pm', '\\times', '\\div',
  '\\leq', '\\geq', '\\neq', '\\approx', '\\equiv', '\\to', '\\implies', '\\iff',
  '\\alpha', '\\beta', '\\gamma', '\\delta', '\\theta', '\\lambda', '\\mu', '\\pi', '\\sigma', '\\phi', '\\omega',
  '\\partial', '\\nabla', '\\int', '\\sum', '\\prod'
];

const BARE_TEX_PREFIXES = [
  '\\frac{', '\\sqrt{', '\\text{', '\\mathbf{', '\\mathbb{', '\\mathcal{', '\\vec{', '\\hat{', '\\bar{'
];

function findMatchingBrace(str: string, openPos: number): number {
  let depth = 0;
  for (let i = openPos; i < str.length; i++) {
    if (str[i] === '{' && (i === 0 || str[i - 1] !== '\\')) depth++;
    else if (str[i] === '}' && (i === 0 || str[i - 1] !== '\\')) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function findMatchingEscapedBrace(str: string, openPos: number): number {
  let depth = 0;
  for (let i = openPos; i < str.length - 1; i++) {
    if (str[i] === '\\' && str[i + 1] === '{') {
      depth++;
      i++;
    } else if (str[i] === '\\' && str[i + 1] === '}') {
      depth--;
      i++;
      if (depth === 0) return i; // index of '}'
    }
  }
  return -1;
}

/**
 * Rejects accidental cross-sentence `$ ... $` matches caused by an unmatched `$`
 * so plain English sentences are never swallowed into one unbreakable KaTeX span.
 */
function looksLikeCorruptedProseMath(candidate: string): boolean {
  if (candidate.length > 260) return true;
  // Strip legitimate \text{...} blocks before checking for long runs of English words
  const withoutText = candidate.replace(/\\text\{[^}]*\}/g, '');
  if (/(?:[A-Za-z]{3,}\s+){5,}[A-Za-z]{3,}/.test(withoutText)) {
    return true;
  }
  return false;
}

/**
 * Tokenizes an inline line of text for math ($...$, \(...\)), code (`...`), and markdown bold (**...**)
 * without mangling math expressions containing asterisks like $f^*(x)$.
 * Follows CommonMark/Pandoc math standard: opening $ cannot be followed by whitespace, closing $ cannot be preceded by whitespace.
 * Also intelligently recognizes bare LaTeX commands (\emptyset, \{x \mid ...\}, \frac{...}{...}) and unclosed math expressions.
 */
export function tokenizeInline(text: string | null | undefined): InlineToken[] {
  if (!text || typeof text !== 'string') return [];
  if (text.length > 5000) return [{ type: 'text', value: text }];
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
        const candidate = text.substring(mathStart, mathEnd).trim();
        if (candidate && !looksLikeCorruptedProseMath(candidate)) {
          flushText(i);
          tokens.push({ type: 'inline-math', formula: candidate });
          i = mathEnd + 2;
          textStart = i;
          continue;
        }
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
          const candidate = text.substring(mathStart, mathEnd).trim();
          if (candidate && !looksLikeCorruptedProseMath(candidate)) {
            flushText(i);
            tokens.push({ type: 'inline-math', formula: candidate });
            i = mathEnd + 1;
            textStart = i;
            continue;
          }
        }

        // Check if unclosed $ starts with set builder \{...\}
        if (text.startsWith('$\\{', i)) {
          const closeBrace = findMatchingEscapedBrace(text, i + 1);
          if (closeBrace !== -1) {
            flushText(i);
            tokens.push({ type: 'inline-math', formula: text.substring(mathStart, closeBrace + 1).trim() });
            i = closeBrace + 1;
            if (i < text.length && text[i] === '$') i++;
            textStart = i;
            continue;
          }
        }
      }
    }

    // Bare TeX set notation: \{ ... \}
    if (text.startsWith('\\{', i)) {
      const closeBrace = findMatchingEscapedBrace(text, i);
      if (closeBrace !== -1) {
        flushText(i);
        tokens.push({ type: 'inline-math', formula: text.substring(i, closeBrace + 1).trim() });
        i = closeBrace + 1;
        textStart = i;
        continue;
      }
    }

    // Bare TeX prefix functions: \frac{...}{...}, \sqrt{...}, etc.
    let matchedPrefix: string | null = null;
    for (const prefix of BARE_TEX_PREFIXES) {
      if (text.startsWith(prefix, i)) {
        matchedPrefix = prefix;
        break;
      }
    }
    if (matchedPrefix) {
      const firstBraceEnd = findMatchingBrace(text, i + matchedPrefix.length - 1);
      if (firstBraceEnd !== -1) {
        let formulaEnd = firstBraceEnd;
        if (firstBraceEnd + 1 < text.length && text[firstBraceEnd + 1] === '{') {
          const secondBraceEnd = findMatchingBrace(text, firstBraceEnd + 1);
          if (secondBraceEnd !== -1) formulaEnd = secondBraceEnd;
        }
        flushText(i);
        tokens.push({ type: 'inline-math', formula: text.substring(i, formulaEnd + 1).trim() });
        i = formulaEnd + 1;
        textStart = i;
        continue;
      }
    }

    // Bare TeX isolated symbols: \emptyset, \cup, \cap, etc.
    let matchedSymbol: string | null = null;
    for (const sym of BARE_TEX_SYMBOLS) {
      if (text.startsWith(sym, i)) {
        const after = i + sym.length;
        if (after >= text.length || !/[a-zA-Z]/.test(text[after])) {
          matchedSymbol = sym;
          break;
        }
      }
    }
    if (matchedSymbol) {
      flushText(i);
      tokens.push({ type: 'inline-math', formula: matchedSymbol });
      i += matchedSymbol.length;
      textStart = i;
      continue;
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
        <code key={key} className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary font-medium break-words">
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
  if (typeof formula !== 'string' || formula.length > 5000) return <span className="break-words">{String(formula || '').slice(0, 5000)}</span>;
  const cleanedFormula = repairCorruptedLatex(formula);
  try {
    html = katex.renderToString(cleanedFormula, {
      throwOnError: false,
      displayMode: false,
      trust: false,
      maxExpand: 1000,
      maxSize: 20,
    });
  } catch {
    return <span className="break-words">${cleanedFormula}$</span>;
  }
  return (
    <span
      className="inline-block max-w-full overflow-x-auto align-bottom [&_.katex]:text-[0.95em]"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function KatexBlock({ formula }: { formula: string }) {
  let html = '';
  if (typeof formula !== 'string' || formula.length > 5000) return <div className="text-center py-2 break-words">{String(formula || '').slice(0, 5000)}</div>;
  const cleanedFormula = repairCorruptedLatex(formula);
  try {
    html = katex.renderToString(cleanedFormula, {
      throwOnError: false,
      displayMode: true,
      trust: false,
      maxExpand: 1000,
      maxSize: 20,
    });
  } catch {
    return <div className="text-center py-2 break-words">$${cleanedFormula}$$</div>;
  }
  return (
    <div
      className="max-w-full overflow-x-auto py-2 text-center"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

export function LatexRenderer({ content }: { content?: string | null }) {
  if (!content || typeof content !== 'string') {
    return null;
  }

  const boundedContent = content.length > 50000 ? content.slice(0, 50000) + '\n\n[Content truncated for safe rendering]' : content;
  const repairedContent = repairCorruptedLatex(boundedContent);
  const blocks = splitDisplayMathBlocks(repairedContent);

  return (
    <div className="latex-content min-w-0 max-w-full overflow-x-hidden break-words space-y-2 text-base leading-relaxed">
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
                  <h1 key={lineIdx} className="text-2xl font-bold mt-4 mb-2 break-words">
                    {renderInlineLine(trimmed.slice(2))}
                  </h1>
                );
              }

              // ## Header
              if (trimmed.startsWith('## ')) {
                return (
                  <h2 key={lineIdx} className="text-xl font-bold mt-6 mb-2 text-primary border-b border-border pb-1 break-words">
                    {renderInlineLine(trimmed.slice(3))}
                  </h2>
                );
              }

              // ### Header
              if (trimmed.startsWith('### ')) {
                return (
                  <h3 key={lineIdx} className="text-lg font-semibold mt-4 mb-1 text-foreground/90 break-words">
                    {renderInlineLine(trimmed.slice(4))}
                  </h3>
                );
              }

              // Bullet list (- or * followed by space, but not **)
              if (trimmed.startsWith('- ') || (trimmed.startsWith('* ') && !trimmed.startsWith('**'))) {
                return (
                  <div key={lineIdx} className="flex gap-2 ml-4 min-w-0">
                    <span className="text-primary mt-1 flex-shrink-0">•</span>
                    <span className="min-w-0 flex-1 break-words">{renderInlineLine(trimmed.slice(2))}</span>
                  </div>
                );
              }

              // Numbered list
              const numMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
              if (numMatch) {
                return (
                  <div key={lineIdx} className="flex gap-2 ml-4 min-w-0">
                    <span className="text-primary font-semibold flex-shrink-0">{numMatch[1]}.</span>
                    <span className="min-w-0 flex-1 break-words">{renderInlineLine(numMatch[2])}</span>
                  </div>
                );
              }

              // Regular paragraph
              return (
                <p key={lineIdx} className="mb-1 break-words min-w-0">
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
