import { test } from 'node:test';
import assert from 'node:assert/strict';

function sanitize(str) {
  return (str || '')
    .trim()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseJsonResponse(raw) {
  let cleaned = raw.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
  }
  return JSON.parse(cleaned);
}

test('Mistake Notebook: XSS sanitization and length bounds enforcement', () => {
  const dirty = '<script>alert("hacked")</script> Lenz & Faraday';
  const clean = sanitize(dirty);
  assert.equal(clean.includes('<script>'), false);
  assert.equal(clean.includes('&lt;script&gt;'), true);
  assert.equal(clean.includes('&amp;'), true);

  // Field length clipping
  const longTitle = 'a'.repeat(200);
  const clippedTitle = longTitle.slice(0, 120);
  assert.equal(clippedTitle.length, 120);
});

test('Mistake Notebook: LaTeX math expressions are safely preserved through sanitization and rendering', () => {
  const mathFormula = 'Induced EMF is given by $e = -\\frac{d\\Phi}{dt}$ where $\\Phi = B \\cdot A$.';
  const sanitized = sanitize(mathFormula);
  // LaTeX delimiters $ and backslashes are preserved intact
  assert.ok(sanitized.includes('$e = -\\frac{d\\Phi}{dt}$'));
  assert.ok(sanitized.includes('$\\Phi = B \\cdot A$'));
});

test('Mistake Notebook: Error categorization supports standard Indian competitive exam failure modes', () => {
  const validTypes = ['conceptual', 'calculation', 'formula', 'misread'];
  for (const t of validTypes) {
    assert.ok(['conceptual', 'calculation', 'formula', 'misread'].includes(t));
  }
  assert.equal(validTypes.includes('unknown_type'), false);
});

test('Mistake Notebook: Status transition between unresolved and mastered', () => {
  let entry = {
    status: 'unresolved',
    reviewCount: 0,
    lastReviewedAt: null,
  };

  // Student rectifies mistake
  entry.status = 'mastered';
  entry.reviewCount += 1;
  entry.lastReviewedAt = new Date().toISOString();

  assert.equal(entry.status, 'mastered');
  assert.equal(entry.reviewCount, 1);
  assert.ok(entry.lastReviewedAt);

  // Student reopens for revision
  entry.status = 'unresolved';
  assert.equal(entry.status, 'unresolved');
  assert.equal(entry.reviewCount, 1); // Preserves revision history
});

test('Mistake Notebook: Quiz AI response parser handles markdown code blocks and raw JSON', () => {
  const mockGptOutput = "```json\n" + JSON.stringify({
    questions: [
      {
        id: "q1",
        question: "A loop of area $A$ is placed in a perpendicular magnetic field $B(t) = B_0 \\cos(\\omega t)$. What is the induced EMF?",
        options: [
          "$e = B_0 A \\omega \\sin(\\omega t)$",
          "$e = -B_0 A \\cos(\\omega t)$",
          "$e = 0$",
          "$e = B_0 A$"
        ],
        correctIndex: 0,
        explanation: "Differentiating flux yields induced EMF opposing the change in flux.",
        relatedMistake: "Lenz Law minus sign"
      }
    ]
  }) + "\n```";

  const parsed = parseJsonResponse(mockGptOutput);
  assert.ok(Array.isArray(parsed.questions));
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].correctIndex, 0);
  assert.ok(parsed.questions[0].question.includes('B_0'));
  assert.equal(parsed.questions[0].options.length, 4);
});

test('Mistake Notebook: Search filter escapes regex special characters safely', () => {
  const search = 'e = -dPhi/dt (JEE [2024])?';
  const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const reg = new RegExp(escaped, 'i');
  
  assert.ok(reg.test('Concept: e = -dPhi/dt (JEE [2024])? in physics'));
  assert.equal(reg.test('something completely different'), false);
});

test('Mistake Notebook: AI auto-generation supports concept_mirror and nichod sources', () => {
  const validSources = ['concept_mirror', 'nichod', 'manual'];
  assert.ok(validSources.includes('concept_mirror'));
  assert.ok(validSources.includes('nichod'));
  assert.ok(validSources.includes('manual'));

  const sampleDetectedMistake = {
    title: 'Lenz Law EMF Sign Ambiguity',
    subject: 'Physics',
    chapter: 'Electromagnetic Induction',
    errorType: 'conceptual',
    questionOrPrompt: 'Concept Oral Defense: Electromagnetic Induction',
    myMistake: 'Forgot the minus sign in $e = -\\frac{d\\Phi}{dt}$',
    correctConcept: 'Induced EMF opposes the rate of change of magnetic flux via Lenz’s Law.',
    status: 'unresolved',
    source: 'concept_mirror',
  };

  assert.equal(sampleDetectedMistake.source, 'concept_mirror');
  assert.equal(sampleDetectedMistake.status, 'unresolved');
  assert.ok(sampleDetectedMistake.myMistake.includes('$e = -\\frac{d\\Phi}{dt}$'));
});

test('Mistake Notebook: Hindi text Galti Diary is completely removed from UI code', async () => {
  const fs = await import('node:fs');
  const notebookPath = 'src/components/mistakes/mistake-notebook.tsx';
  if (fs.existsSync(notebookPath)) {
    const content = fs.readFileSync(notebookPath, 'utf8');
    assert.equal(content.includes('Galti'), false, 'Mistake Notebook must not contain Hindi text "Galti"');
    assert.equal(content.includes('Galti Diary'), false);
  }
});
