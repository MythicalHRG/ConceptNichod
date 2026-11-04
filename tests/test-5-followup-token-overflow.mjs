import assert from "node:assert";
import test from "node:test";

const MAX_HISTORY_MESSAGES = 10;
const MAX_SUMMARY_CHARS = 4000;
const MAX_MESSAGE_CHARS = 1500;

// Simulating payload compiler from src/app/actions/followup.ts
function prepareFollowUpPayload(input) {
  const { topicName, topicSummary, classLevel, subject, conversationHistory = [] } = input;

  const safeTopic = (topicName || 'General Topic').slice(0, 150);
  const safeClass = (classLevel || 'Standard').slice(0, 50);
  const safeSubject = (subject || 'General Studies').slice(0, 50);
  const safeSummary = (topicSummary || '').slice(0, MAX_SUMMARY_CHARS);

  // Sliding window: keep only the latest N messages
  const recentHistory = conversationHistory.slice(-MAX_HISTORY_MESSAGES).map((m) => ({
    role: m.role,
    content: (m.content || '').slice(0, MAX_MESSAGE_CHARS),
  }));

  const systemMessage = `You are a friendly, expert teacher helping a ${safeClass} student understand "${safeTopic}" from ${safeSubject}.
Summary:
${safeSummary}`;

  return [
    { role: 'system', content: systemMessage },
    ...recentHistory,
  ];
}

test("Tareeka 5: Follow-up chat truncates 40 conversational turns into a safe sliding window of 10", () => {
  // Simulate an enthusiastic student asking 40 follow-up questions
  const longHistory = [];
  for (let i = 1; i <= 40; i++) {
    longHistory.push({
      role: i % 2 === 1 ? 'user' : 'assistant',
      content: `Turn #${i}: Can you explain step ${i} of the derivation in more detail?`,
    });
  }

  const messages = prepareFollowUpPayload({
    topicName: "Electromagnetic Induction & Faraday's Law",
    topicSummary: "When magnetic flux linked with a circuit changes, an EMF is induced.",
    classLevel: "Class 12",
    subject: "Physics",
    conversationHistory: longHistory,
  });

  // System message + at most MAX_HISTORY_MESSAGES
  assert.strictEqual(messages.length, MAX_HISTORY_MESSAGES + 1);

  // Ensure the latest message (turn 40) is preserved
  assert.strictEqual(
    messages[messages.length - 1].content,
    "Turn #40: Can you explain step 40 of the derivation in more detail?"
  );

  // Ensure the oldest retained turn is turn 31 (latest 10 turns: 31 to 40)
  assert.strictEqual(
    messages[1].content,
    "Turn #31: Can you explain step 31 of the derivation in more detail?"
  );
});

test("Tareeka 5: Extra-long summaries and messages are bounded to prevent token exhaustion", () => {
  const massiveSummary = "A".repeat(20000); // 20k characters
  const massiveMessage = "B".repeat(5000);  // 5k characters

  const messages = prepareFollowUpPayload({
    topicName: "Quantum Mechanics",
    topicSummary: massiveSummary,
    classLevel: "Undergraduate",
    subject: "Physics",
    conversationHistory: [{ role: 'user', content: massiveMessage }],
  });

  const systemContent = messages[0].content;
  const userContent = messages[1].content;

  assert.ok(systemContent.length < MAX_SUMMARY_CHARS + 300);
  assert.strictEqual(userContent.length, MAX_MESSAGE_CHARS);
});
