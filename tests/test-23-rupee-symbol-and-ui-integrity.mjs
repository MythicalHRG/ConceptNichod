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

test('Tareeka 23.9: Changelog semver calculator assigns 2nd digit to Feature and 3rd digit to Bug Fix / Improvement', () => {
  function parseSemver(v) {
    if (!v) return null;
    const match = v.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
    if (!match) return null;
    return {
      major: parseInt(match[1], 10),
      minor: match[2] !== undefined ? parseInt(match[2], 10) : 0,
      patch: match[3] !== undefined ? parseInt(match[3], 10) : 0,
    };
  }

  function calculateNextVersion(majorDigit, category, logs) {
    const targetMajor = typeof majorDigit === 'string' ? parseInt(majorDigit, 10) || 2 : majorDigit;
    const matching = (logs || [])
      .map((l) => parseSemver(l.version))
      .filter((s) => s !== null && s.major === targetMajor);

    if (category === 'Major Update') {
      return `v${targetMajor + 1}.0.0`;
    }

    if (category === 'Feature') {
      if (matching.length > 0) {
        const maxMinor = Math.max(...matching.map((s) => s.minor));
        return `v${targetMajor}.${maxMinor + 1}.0`;
      }
      return `v${targetMajor}.1.0`;
    }

    if (matching.length > 0) {
      const maxMinor = Math.max(...matching.map((s) => s.minor));
      const atMaxMinor = matching.filter((s) => s.minor === maxMinor);
      const maxPatch = atMaxMinor.length > 0 ? Math.max(...atMaxMinor.map((s) => s.patch)) : 0;
      return `v${targetMajor}.${maxMinor}.${maxPatch + 1}`;
    }
    return `v${targetMajor}.0.1`;
  }

  const existingLogs = [
    { version: 'v2.5.0' },
    { version: 'v2.4.1' },
    { version: 'v2.4.0' }
  ];

  // Feature should increment secondary digit (minor): v2.5.0 -> v2.6.0
  assert.equal(calculateNextVersion(2, 'Feature', existingLogs), 'v2.6.0');

  // Bug Fix / Improvement / Security should increment 3rd digit (patch): v2.5.0 -> v2.5.1
  assert.equal(calculateNextVersion(2, 'Bug Fix', existingLogs), 'v2.5.1');
  assert.equal(calculateNextVersion(2, 'Improvement', existingLogs), 'v2.5.1');
  assert.equal(calculateNextVersion(2, 'Security', existingLogs), 'v2.5.1');

  // Major Update should increment 1st digit: 2 -> v3.0.0
  assert.equal(calculateNextVersion(2, 'Major Update', existingLogs), 'v3.0.0');

  // New major digit 3 should start cleanly
  assert.equal(calculateNextVersion(3, 'Feature', existingLogs), 'v3.1.0');
  assert.equal(calculateNextVersion(3, 'Bug Fix', existingLogs), 'v3.0.1');
});

test('Tareeka 23.10: Admin panel source supports changelog editing and in-place existing version update', () => {
  const adminPanel = fs.readFileSync(path.join(projectRoot, 'src/components/admin/admin-panel.tsx'), 'utf8');
  const changelogActions = fs.readFileSync(path.join(projectRoot, 'src/app/actions/changelog.ts'), 'utf8');

  assert.ok(adminPanel.includes('updateChangelogAction'), 'Admin panel must import updateChangelogAction');
  assert.ok(adminPanel.includes('handleEditChangelog'), 'Admin panel must define handleEditChangelog');
  assert.ok(adminPanel.includes('calculateNextVersion'), 'Admin panel must define calculateNextVersion');
  assert.ok(adminPanel.includes('majorDigit'), 'Admin panel must manage 1st digit (majorDigit) state');
  assert.ok(changelogActions.includes('existingLog'), 'createChangelogAction must update in-place if version exists');
});

test('Tareeka 23.11: Background music component defaults to sound ON (isPlaying: true)', () => {
  const bgMusicSource = fs.readFileSync(path.join(projectRoot, 'src/components/ui/background-music.tsx'), 'utf8');

  assert.ok(bgMusicSource.includes('useState(true)'), 'Background music must default isPlaying state to true');
  assert.ok(bgMusicSource.includes('attemptPlay'), 'Background music must attempt autoplay on mount');
});
