import assert from "node:assert";
import test from "node:test";

// Simulates the KaTeX token splitting logic used in LatexRenderer
function splitLatexTokens(content) {
  if (!content) return [];
  // Matches $$...$$ (display math) or $...$ (inline math)
  const mathRegex = /(\$\$[\s\S]*?\$\$|\$[^\$\n]+?\$)/g;
  const tokens = [];
  let lastIndex = 0;
  let match;

  while ((match = mathRegex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ type: "text", value: content.substring(lastIndex, match.index) });
    }
    const token = match[0];
    if (token.startsWith("$$") && token.endsWith("$$")) {
      tokens.push({ type: "display-math", value: token.slice(2, -2).trim() });
    } else if (token.startsWith("$") && token.endsWith("$")) {
      tokens.push({ type: "inline-math", value: token.slice(1, -1).trim() });
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < content.length) {
    tokens.push({ type: "text", value: content.substring(lastIndex) });
  }

  return tokens;
}

test("Tareeka 6: LaTeX parser correctly identifies inline and block math equations", () => {
  const input = "Newton's second law is given by $F = ma$, while Einstein gave $$E = mc^2$$ for mass-energy equivalence.";
  const tokens = splitLatexTokens(input);

  assert.strictEqual(tokens.length, 5);
  assert.strictEqual(tokens[0].type, "text");
  assert.strictEqual(tokens[1].type, "inline-math");
  assert.strictEqual(tokens[1].value, "F = ma");
  assert.strictEqual(tokens[2].type, "text");
  assert.strictEqual(tokens[3].type, "display-math");
  assert.strictEqual(tokens[3].value, "E = mc^2");
  assert.strictEqual(tokens[4].type, "text");
});

test("Tareeka 6: LaTeX parser handles complex fractions and roots without mangling", () => {
  const quadraticFormula = "Quadratic roots: $x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$";
  const tokens = splitLatexTokens(quadraticFormula);

  assert.strictEqual(tokens.length, 2);
  assert.strictEqual(tokens[1].type, "inline-math");
  assert.ok(tokens[1].value.includes("\\frac"));
  assert.ok(tokens[1].value.includes("\\sqrt"));
});

test("Tareeka 6: Plain text without dollar signs passes through cleanly as a single text token", () => {
  const plain = "Photosynthesis occurs in plant cells using sunlight and carbon dioxide.";
  const tokens = splitLatexTokens(plain);

  assert.strictEqual(tokens.length, 1);
  assert.strictEqual(tokens[0].type, "text");
  assert.strictEqual(tokens[0].value, plain);
});
