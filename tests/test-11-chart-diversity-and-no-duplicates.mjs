import test from 'node:test';
import assert from 'node:assert/strict';

// Logic representing the chart diversity engine from FinalAnalysisDisplay
function enforceChartDiversity(rawList, baseScore = 75) {
  const availableTypes = ["bar", "pie", "histo", "polynomial", "radar"];
  const seenTypes = new Set();
  const diverseCharts = [];

  const defaultSuite = [
    { type: "bar", title: "Cognitive Competencies" },
    { type: "pie", title: "Knowledge Composition" },
    { type: "histo", title: "Response Depth Frequency" },
    { type: "polynomial", title: "Adaptive Mastery Progression Curve" },
    { type: "radar", title: "Delivery & Articulation Matrix" },
  ];

  for (const c of rawList) {
    if (c && c.type && !seenTypes.has(c.type) && availableTypes.includes(c.type)) {
      seenTypes.add(c.type);
      diverseCharts.push(c);
    }
  }

  for (const d of defaultSuite) {
    if (!seenTypes.has(d.type)) {
      seenTypes.add(d.type);
      diverseCharts.push(d);
    }
  }

  return diverseCharts;
}

test('Tareeka 11: Interface strictly rejects duplicate charts and ensures diverse models', () => {
  // Scenario: AI returns two bar charts and two pie charts
  const duplicateInput = [
    { type: 'bar', title: 'Bar 1' },
    { type: 'bar', title: 'Bar 2 (Duplicate)' },
    { type: 'pie', title: 'Pie 1' },
    { type: 'pie', title: 'Pie 2 (Duplicate)' },
  ];

  const result = enforceChartDiversity(duplicateInput);

  // Every single chart must have a unique type
  const types = result.map(c => c.type);
  const uniqueTypes = new Set(types);

  assert.equal(types.length, uniqueTypes.size, 'No duplicate chart types allowed in single interface');
  assert.ok(types.includes('bar'), 'Contains bar chart');
  assert.ok(types.includes('pie'), 'Contains pie chart');
  assert.ok(types.includes('histo'), 'Contains histogram');
  assert.ok(types.includes('polynomial'), 'Contains polynomial score curve');
  assert.ok(types.includes('radar'), 'Contains radar chart');
});

test('Tareeka 11: Pie chart label suppression prevents text collisions on zero slices', () => {
  function filterPieLabels(slice) {
    const { percent, value } = slice;
    if (!percent || percent < 0.05 || value <= 0) return null;
    return `${slice.name}: ${(percent * 100).toFixed(0)}%`;
  }

  assert.equal(filterPieLabels({ name: 'Fact', value: 0, percent: 0 }), null, 'Zero slice suppressed');
  assert.equal(filterPieLabels({ name: 'Insight', value: 1, percent: 0.01 }), null, '<5% slice suppressed');
  assert.equal(filterPieLabels({ name: 'Core', value: 50, percent: 0.50 }), 'Core: 50%', 'Valid slice displays label');
});
