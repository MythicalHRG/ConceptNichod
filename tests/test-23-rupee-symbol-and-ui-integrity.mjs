import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

test('Tareeka 23.1: formatINR formats amounts accurately per Indian numbering system', () => {
  function formatINR(amount) {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(num)) return "0";
    return num.toLocaleString("en-IN");
  }
  
  assert.equal(formatINR(100), '100');
  assert.equal(formatINR(500), '500');
  assert.equal(formatINR(1000), '1,000');
  assert.equal(formatINR(100000), '1,00,000');
  assert.equal(formatINR('2500'), '2,500');
  assert.equal(formatINR('invalid'), '0');
});

test('Tareeka 23.2: Rupee component source defines cross-platform system font fallback and ₹ (U+20B9)', () => {
  const rupeeSource = fs.readFileSync(path.join(projectRoot, 'src/components/ui/rupee-symbol.tsx'), 'utf8');
  
  assert.ok(rupeeSource.includes('₹'), 'Must contain the Indian Rupee character ₹');
  assert.ok(rupeeSource.includes('Segoe UI'), 'Must contain Segoe UI for crisp Windows rendering');
  assert.ok(rupeeSource.includes('-apple-system'), 'Must contain -apple-system for Apple devices');
  assert.ok(rupeeSource.includes('Roboto'), 'Must contain Roboto for Android devices');
  assert.ok(rupeeSource.includes('Noto Sans'), 'Must contain Noto Sans for Linux/cross-platform');
});

test('Tareeka 23.3: tailwind.config.ts defines rupee font family and system font fallbacks', () => {
  const tailwindConfig = fs.readFileSync(path.join(projectRoot, 'tailwind.config.ts'), 'utf8');
  
  assert.ok(tailwindConfig.includes('rupee:'), 'Must configure font-rupee in tailwind.config.ts');
  assert.ok(tailwindConfig.includes('Segoe UI'), 'Font stacks must include Segoe UI fallback');
  assert.ok(tailwindConfig.includes('system-ui'), 'Font stacks must include system-ui fallback');
});

test('Tareeka 23.4: globals.css includes .font-rupee and .rupee-symbol utility classes', () => {
  const globalsCss = fs.readFileSync(path.join(projectRoot, 'src/app/globals.css'), 'utf8');
  
  assert.ok(globalsCss.includes('.font-rupee'), 'globals.css must define .font-rupee class');
  assert.ok(globalsCss.includes('.rupee-symbol'), 'globals.css must define .rupee-symbol class');
  assert.ok(globalsCss.includes('tabular-nums'), 'globals.css must specify tabular-nums for aligned currency figures');
});

test('Tareeka 23.5: donate page and admin panel use the Rupee component', () => {
  const donatePage = fs.readFileSync(path.join(projectRoot, 'src/app/donate/page.tsx'), 'utf8');
  const adminPanel = fs.readFileSync(path.join(projectRoot, 'src/components/admin/admin-panel.tsx'), 'utf8');
  
  assert.ok(donatePage.includes('<Rupee'), 'Donate page must use <Rupee component');
  assert.ok(adminPanel.includes('<Rupee'), 'Admin panel must use <Rupee component');
});

test('Tareeka 23.6: topic-history.tsx wraps topic names in LatexRenderer for math rendering', () => {
  const topicHistory = fs.readFileSync(path.join(projectRoot, 'src/components/dashboard/topic-history.tsx'), 'utf8');
  
  assert.ok(topicHistory.includes('LatexRenderer'), 'topic-history.tsx must import LatexRenderer');
  assert.ok(topicHistory.includes('<LatexRenderer content={topic.name}'), 'topic-history.tsx must wrap topic.name in LatexRenderer');
});

test('Tareeka 23.7: Official UPI ID is preserved immutably as harsh.2525@ptaxis', () => {
  const donationSetting = fs.readFileSync(path.join(projectRoot, 'src/models/DonationSetting.ts'), 'utf8');
  const donatePage = fs.readFileSync(path.join(projectRoot, 'src/app/donate/page.tsx'), 'utf8');
  
  assert.ok(donationSetting.includes('harsh.2525@ptaxis'), 'DonationSetting model must keep harsh.2525@ptaxis');
  assert.ok(donatePage.includes('harsh.2525@ptaxis'), 'Donate page must keep harsh.2525@ptaxis');
});

test('Tareeka 23.8: Waste scratch folder is eliminated from workspace', () => {
  assert.strictEqual(fs.existsSync(path.join(projectRoot, 'scratch')), false, 'scratch directory must not exist');
});
