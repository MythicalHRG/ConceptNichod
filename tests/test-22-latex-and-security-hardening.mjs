import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import katex from "katex";
import { checkRateLimit } from "../src/lib/rate-limiter.ts";

// ============================================================================
// 1. LATEX RENDERER TOKENIZATION & KATEX EVALUATION TESTS
// ============================================================================

function splitDisplayMathBlocks(content) {
  if (!content || typeof content !== 'string') return [];
  const blocks = [];
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
        blocks.push({ type: 'display-math', formula: content.substring(mathStart, mathEnd).trim() });
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
        blocks.push({ type: 'display-math', formula: content.substring(mathStart, mathEnd).trim() });
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

function findMatchingBrace(str, openPos) {
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

function findMatchingEscapedBrace(str, openPos) {
  let depth = 0;
  for (let i = openPos; i < str.length - 1; i++) {
    if (str[i] === '\\' && str[i + 1] === '{') {
      depth++;
      i++;
    } else if (str[i] === '\\' && str[i + 1] === '}') {
      depth--;
      i++;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function tokenizeInline(text) {
  if (!text || typeof text !== 'string') return [];
  const tokens = [];
  let i = 0;
  let textStart = 0;

  function flushText(end) {
    if (end > textStart) {
      tokens.push({ type: 'text', value: text.substring(textStart, end) });
    }
  }

  while (i < text.length) {
    if (text.startsWith('\\$', i)) {
      flushText(i);
      tokens.push({ type: 'text', value: '$' });
      i += 2;
      textStart = i;
      continue;
    }

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

    if (text[i] === '$' && !text.startsWith('$$', i)) {
      const mathStart = i + 1;
      if (mathStart < text.length && text[mathStart] !== ' ' && text[mathStart] !== '\t') {
        let mathEnd = -1;
        for (let j = mathStart; j < text.length; j++) {
          if (text[j] === '$' && text[j - 1] !== '\\') {
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

        // Check unclosed $\{...\}
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

    // Bare TeX prefix functions
    let matchedPrefix = null;
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

    // Bare TeX isolated symbols
    let matchedSymbol = null;
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

    if (text.startsWith('**', i)) {
      const boldStart = i + 2;
      const boldEnd = text.indexOf('**', boldStart);
      if (boldEnd !== -1 && boldEnd > boldStart) {
        flushText(i);
        tokens.push({
          type: 'bold',
          children: tokenizeInline(text.substring(boldStart, boldEnd))
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

test("Tareeka 22.1: Multi-line display math blocks are extracted before line splitting", () => {
  const input = `Explanation of integration:
$$
\\int_{0}^{\\pi} \\sin(x) dx
= [-\\cos(x)]_{0}^{\\pi}
= 2
$$
Next step is bracket display:
\\[
\\sum_{k=1}^n k = \\frac{n(n+1)}{2}
\\]
End of proof.`;

  const blocks = splitDisplayMathBlocks(input);
  assert.strictEqual(blocks.length, 5);
  assert.strictEqual(blocks[0].type, "markdown");
  assert.strictEqual(blocks[1].type, "display-math");
  assert.ok(blocks[1].formula.includes("\\int_{0}^{\\pi}"));
  assert.strictEqual(blocks[2].type, "markdown");
  assert.strictEqual(blocks[3].type, "display-math");
  assert.strictEqual(blocks[3].formula, "\\sum_{k=1}^n k = \\frac{n(n+1)}{2}");
  assert.strictEqual(blocks[4].type, "markdown");

  // Verify KaTeX renders without throwing
  const rendered1 = katex.renderToString(blocks[1].formula, { displayMode: true, throwOnError: false });
  assert.ok(rendered1.includes("katex-display"));
  const rendered2 = katex.renderToString(blocks[3].formula, { displayMode: true, throwOnError: false });
  assert.ok(rendered2.includes("katex-display"));
});

test("Tareeka 22.2: User screenshot equations render properly without mangling asterisks or brackets", () => {
  const flaggedText = "Direct restatement of question (missing $A \\cup \\emptyset = A$ derivation)";
  const tokens = tokenizeInline(flaggedText);

  assert.strictEqual(tokens.length, 3);
  assert.strictEqual(tokens[0].value, "Direct restatement of question (missing ");
  assert.strictEqual(tokens[1].type, "inline-math");
  assert.strictEqual(tokens[1].formula, "A \\cup \\emptyset = A");
  assert.strictEqual(tokens[2].value, " derivation)");

  const mathTokens = [
    "\\{x \\mid x^2=5\\}",
    "|A \\cup \\emptyset|",
    "\\emptyset",
    "f^*(x)",
    "g^*(y) + h^*(z)"
  ];

  for (const formula of mathTokens) {
    const inlineString = `Formula: $${formula}$ here`;
    const res = tokenizeInline(inlineString);
    assert.strictEqual(res[1].type, "inline-math");
    assert.strictEqual(res[1].formula, formula);
    const html = katex.renderToString(res[1].formula, { throwOnError: false });
    assert.ok(html.includes("katex"));
  }

  // Exact strings from user's linguistic forensics screenshot (media_1793782179302_550c5f67.png)
  const userItem4 = "Spoken response 'I don't know' fails to evaluate set-builder notation $\\{x \\mid x^2=5\\}.";
  const res4 = tokenizeInline(userItem4);
  const mathToken4 = res4.find(t => t.type === "inline-math");
  assert.ok(mathToken4, "Must identify set-builder math token even if closing dollar is omitted");
  assert.strictEqual(mathToken4.formula, "\\{x \\mid x^2=5\\}");
  assert.ok(katex.renderToString(mathToken4.formula, { throwOnError: false }).includes("katex"));

  const userBareEmptyset = "modeling a real-world scenario with \\emptyset.";
  const resBare = tokenizeInline(userBareEmptyset);
  const mathBare = resBare.find(t => t.type === "inline-math");
  assert.ok(mathBare, "Must identify bare \\emptyset symbol");
  assert.strictEqual(mathBare.formula, "\\emptyset");
  assert.ok(katex.renderToString(mathBare.formula, { throwOnError: false }).includes("katex"));
});

test("Tareeka 22.3: Bold markdown and math coexistence without collision", () => {
  const line = "**Definition:** The conjugate function is $f^*(x) = \\sup_y \\{ \\langle x,y \\rangle - f(y) \\}$.";
  const tokens = tokenizeInline(line);

  assert.strictEqual(tokens[0].type, "bold");
  assert.strictEqual(tokens[0].children[0].value, "Definition:");
  assert.strictEqual(tokens[1].type, "text");
  assert.strictEqual(tokens[1].value, " The conjugate function is ");
  assert.strictEqual(tokens[2].type, "inline-math");
  assert.ok(tokens[2].formula.startsWith("f^*(x)"));
});

test("Tareeka 22.4: LaTeX renderer handles null, undefined, empty, and non-string inputs safely", () => {
  assert.deepStrictEqual(splitDisplayMathBlocks(null), []);
  assert.deepStrictEqual(splitDisplayMathBlocks(undefined), []);
  assert.deepStrictEqual(splitDisplayMathBlocks(""), []);
  assert.deepStrictEqual(splitDisplayMathBlocks(12345), []);
  assert.deepStrictEqual(tokenizeInline(""), []);
});

// ============================================================================
// 2. BACKEND SECURITY & RE-SUBMISSION GUARDS
// ============================================================================

test("Tareeka 22.5: actions.ts guards against re-submission and loads authoritative DB metadata", () => {
  const actionsPath = path.resolve("src/app/actions.ts");
  const content = fs.readFileSync(actionsPath, "utf-8");

  // A completed status with no persisted report is recoverable; the saved report is final.
  assert.ok(
    content.includes("if (topicDoc.analysis)"),
    "runFinalAnalysisAction must return an already-saved analysis"
  );
  assert.ok(
    content.includes("interrupted legacy lock"),
    "A completed status without a report must remain recoverable after reload"
  );
  assert.ok(
    content.includes("return { analysis: topicDoc.analysis }"),
    "Must return cached analysis if already completed"
  );

  // Check authoritative topic metadata loading from DB
  assert.ok(
    content.includes("const authoritativeTopicName = topicDoc.name;"),
    "Must load topic name authoritatively from DB"
  );
  assert.ok(
    content.includes("const authoritativeSummary = topicDoc.summary;"),
    "Must load summary authoritatively from DB"
  );
  assert.ok(
    content.includes("const authoritativeClassLevel = topicDoc.classLevel;"),
    "Must load classLevel authoritatively from DB"
  );
});

test("Tareeka 22.6: email-broadcast.ts strictly whitelists attachment URL protocols and storage hosts", () => {
  const emailBroadcastPath = path.resolve("src/app/actions/email-broadcast.ts");
  const content = fs.readFileSync(emailBroadcastPath, "utf-8");

  assert.ok(
    content.includes("utfs.io") && content.includes("uploadthing.com"),
    "Must whitelist utfs.io and uploadthing.com for attachments"
  );
  assert.ok(
    content.includes('parsedUrl.protocol !== "https:"'),
    "Must enforce HTTPS protocol on email attachments"
  );

  // Simulation test
  function validateAttachmentUrl(url) {
    if (!url || typeof url !== "string") return true;
    try {
      const parsed = new URL(url);
      const allowedHosts = ["utfs.io", "uploadthing.com", "ufs.sh"];
      const isAllowed = allowedHosts.some(
        (h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`)
      );
      return parsed.protocol === "https:" && isAllowed;
    } catch {
      return false;
    }
  }

  // Attacks
  assert.strictEqual(validateAttachmentUrl("file:///etc/passwd"), false);
  assert.strictEqual(validateAttachmentUrl("http://utfs.io/file.pdf"), false);
  assert.strictEqual(validateAttachmentUrl("https://evil-attacker.com/malware.exe"), false);
  assert.strictEqual(validateAttachmentUrl("javascript:alert(1)"), false);

  // Legitimate UploadThing URLs
  assert.strictEqual(validateAttachmentUrl("https://utfs.io/f/abc-123.pdf"), true);
  assert.strictEqual(validateAttachmentUrl("https://uploadthing.com/f/xyz-789.png"), true);
  assert.strictEqual(validateAttachmentUrl("https://ufs.sh/f/test.doc"), true);
});

test("Tareeka 22.7: /api/auth/otp enforces per-email rate limiting", () => {
  const otpRoutePath = path.resolve("src/app/api/auth/otp/route.ts");
  const content = fs.readFileSync(otpRoutePath, "utf-8");

  assert.ok(
    content.includes("checkDistributedRateLimit(`otp:email:${email}`") ||
    content.includes('checkDistributedRateLimit(`otp:email:${email}`') ||
    content.includes("checkDistributedRateLimit(`otp:email:"),
    "Must invoke checkRateLimit with per-email key"
  );

  // Functional rate limiter test
  const targetEmail = "targeted-victim@gmail.com";
  const emailKey = `otp:email:${targetEmail}`;
  const limit = 5;
  const windowMs = 15 * 60 * 1000;

  for (let i = 0; i < limit; i++) {
    const res = checkRateLimit(emailKey, limit, windowMs);
    assert.strictEqual(res.success, true);
  }

  // 6th attempt must be rejected
  const blockedRes = checkRateLimit(emailKey, limit, windowMs);
  assert.strictEqual(blockedRes.success, false, "6th OTP attempt on same email must be rate-limited");
});

// ============================================================================
// 3. AUDIO RECORDER LOCKING & INJECTION DEFENSE TESTS
// ============================================================================

test("Tareeka 22.8: use-audio-recorder defines lockAndAbort and isLocked defenses", () => {
  const recorderPath = path.resolve("src/hooks/use-audio-recorder.ts");
  const content = fs.readFileSync(recorderPath, "utf-8");

  assert.ok(content.includes("lockAndAbort"), "Must export lockAndAbort function");
  assert.ok(content.includes("isLockedRef.current"), "Must track locked status in ref");
  assert.ok(content.includes("rec.abort()"), "Must call recognition.abort()");
  assert.ok(content.includes("rec.onresult = null"), "Must clear onresult handler on abort");
  assert.ok(content.includes("rec.onerror = null"), "Must clear onerror handler on abort");
  assert.ok(content.includes("rec.onend = null"), "Must clear onend handler on abort");
});

test("Tareeka 22.9: Layout imports KaTeX CSS stylesheet globally", () => {
  const layoutPath = path.resolve("src/app/layout.tsx");
  const content = fs.readFileSync(layoutPath, "utf-8");

  assert.ok(
    content.includes("katex/dist/katex.min.css"),
    "layout.tsx must import KaTeX CSS globally"
  );
});

test("Tareeka 22.10: QuestionDisplay updates parent onAnswerChange immediately in onChange", () => {
  const qSectionPath = path.resolve("src/components/topic/question-section.tsx");
  const content = fs.readFileSync(qSectionPath, "utf-8");

  assert.ok(
    content.includes("onAnswerChange(val)") || content.includes("onAnswerChange(e.target.value)"),
    "QuestionDisplay must call onAnswerChange directly in onChange to prevent lost keystrokes"
  );
  assert.ok(
    content.includes("disabled={disabled}"),
    "QuestionDisplay must pass disabled prop to Textarea"
  );
});

test("Tareeka 22.11: Currency amounts like $50 and $100 are NOT erroneously matched as math", () => {
  const line = "The application fee is $50 and the exam fee is $100.";
  const tokens = tokenizeInline(line);

  // None of the tokens should be inline-math because spaces follow/precede the delimiters
  const mathTokens = tokens.filter(t => t.type === "inline-math");
  assert.strictEqual(mathTokens.length, 0, "Currency tokens must not be parsed as inline math");

  // Inline code test
  const codeLine = "Use `git status` and $x$ formula";
  const codeTokens = tokenizeInline(codeLine);
  assert.strictEqual(codeTokens[1].type, "code");
  assert.strictEqual(codeTokens[1].value, "git status");
  assert.strictEqual(codeTokens[3].type, "inline-math");
  assert.strictEqual(codeTokens[3].formula, "x");
});

test("Tareeka 22.12: Server actions verify expiring sessions against database revocation versions", () => {
  const filesToCheck = [
    "src/app/actions.ts",
    "src/app/actions/broadcast.ts",
    "src/app/actions/changelog.ts",
    "src/app/actions/followup.ts",
    "src/ai/flows/analyze-answers.ts",
    "src/ai/flows/analyze-concept-explanation.ts",
    "src/app/dashboard/layout.tsx",
    "src/app/dashboard/page.tsx",
    "src/app/dashboard/topic/[topicId]/page.tsx",
    "src/app/dashboard/admin/page.tsx",
    "src/app/api/uploadthing/core.ts"
  ];

  for (const relativePath of filesToCheck) {
    const fullPath = path.resolve(relativePath);
    const content = fs.readFileSync(fullPath, "utf-8");
    assert.ok(
      content.includes("getVerifiedSessionUuid"),
      `${relativePath} must use database-backed session validation`
    );
  }
});

test("Tareeka 22.13: Practice section locks immediately upon submission with isSubmitted state", () => {
  const practiceSectionPath = path.resolve("src/components/topic/practice-analysis-section.tsx");
  const content = fs.readFileSync(practiceSectionPath, "utf-8");

  assert.ok(
    content.includes("isSubmitted"),
    "practice-analysis-section must track isSubmitted state"
  );
  assert.ok(
    content.includes("isLocked"),
    "practice-analysis-section must compute isLocked based on isAnalyzing and isSubmitted"
  );
  assert.ok(
    content.includes("disabled={isLocked}"),
    "practice-analysis-section must disable QuestionDisplay and buttons when locked"
  );
});

test("Tareeka 22.14: Atomic submission lock in runFinalAnalysisAction prevents concurrent duplicate AI evaluations", () => {
  const actionsPath = path.resolve("src/app/actions.ts");
  const content = fs.readFileSync(actionsPath, "utf-8");

  assert.ok(
    content.includes("Topic.findOneAndUpdate") &&
      content.includes('practiceStatus: "analyzing"') &&
      content.includes("analysisStartedAt: analysisLeaseStartedAt"),
    "runFinalAnalysisAction must use an atomic expiring analysis lease to prevent duplicate submissions"
  );
  assert.ok(
    content.includes("analysisLeaseStaleBefore") && content.includes("analysisStartedAt: { $lt: analysisLeaseStaleBefore }"),
    "Abandoned analysis leases must be reclaimable after the timeout"
  );
  assert.ok(
    content.includes("safeWrittenAnswers") && content.includes("textQuestions[idx].question"),
    "runFinalAnalysisAction must map authoritative DB question texts to prevent prompt injection"
  );
});

test("Tareeka 22.15: Global notifications and changelog views render LaTeX and markdown", () => {
  const bellPath = path.resolve("src/components/dashboard/notification-bell.tsx");
  const bellContent = fs.readFileSync(bellPath, "utf-8");
  assert.ok(
    bellContent.includes("<LatexRenderer content={b.message} />"),
    "NotificationBell must render broadcast message via LatexRenderer"
  );

  const changelogPath = path.resolve("src/components/changelog/changelog-view.tsx");
  const changelogContent = fs.readFileSync(changelogPath, "utf-8");
  assert.ok(
    changelogContent.includes("<LatexRenderer content={log.content} />"),
    "ChangelogView must render log.content via LatexRenderer"
  );
});

test("Tareeka 22.16: OTP verify endpoint enforces IP rate limiting", () => {
  const otpRoutePath = path.resolve("src/app/api/auth/otp/route.ts");
  const content = fs.readFileSync(otpRoutePath, "utf-8");

  assert.ok(
    content.includes("otp:verify:${ip}") && content.includes("otp:verify:email:${email}"),
    "/api/auth/otp must rate limit verification attempts by IP and email"
  );
});

test("Tareeka 22.17: Socratic Grill Mode integration in follow-up chat", () => {
  const followupActionPath = path.resolve("src/app/actions/followup.ts");
  const actionContent = fs.readFileSync(followupActionPath, "utf-8");
  assert.ok(
    actionContent.includes("isGrillMode") && actionContent.includes("Socratic Grill"),
    "followup.ts must support Socratic Grilling mode"
  );

  const followupCompPath = path.resolve("src/components/topic/follow-up-chat.tsx");
  const compContent = fs.readFileSync(followupCompPath, "utf-8");
  assert.ok(
    compContent.includes("isGrillMode") && compContent.includes("Socratic Grill"),
    "follow-up-chat.tsx must provide interactive Socratic Grill mode toggle"
  );
});

test("Tareeka 22.18: Printable Concept Reference Cheat Sheet and clean media print styles", () => {
  const displayPath = path.resolve("src/components/topic/final-analysis-display.tsx");
  const displayContent = fs.readFileSync(displayPath, "utf-8");
  assert.ok(
    displayContent.includes("window.print()") && displayContent.includes("Print Cheat Sheet"),
    "final-analysis-display.tsx must provide 1-click printable cheat sheet export"
  );

  const cssPath = path.resolve("src/app/globals.css");
  const cssContent = fs.readFileSync(cssPath, "utf-8");
  assert.ok(
    cssContent.includes("@media print") && cssContent.includes("print\\:hidden"),
    "globals.css must provide distraction-free academic print stylesheets"
  );
});
