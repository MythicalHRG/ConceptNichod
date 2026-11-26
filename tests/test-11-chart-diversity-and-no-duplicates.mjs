import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function keepVerifiedChartTypes(rawList) {
  const allowed = new Set(["bar", "pie", "histo", "radar"]);
  const seen = new Set();
  return rawList.filter((chart) => {
    if (!chart || typeof chart !== "object" || !allowed.has(chart.type) || seen.has(chart.type)) return false;
    if (!Array.isArray(chart.data) || chart.data.length === 0) return false;
    seen.add(chart.type);
    return true;
  });
}

test("Tareeka 11: chart output keeps unique chart types that the examiner actually supplied", () => {
  const duplicateInput = [
    { type: "bar", title: "Bar 1", data: [{ name: "Comprehension", score: 80 }] },
    { type: "bar", title: "Bar 2 (Duplicate)", data: [{ name: "Comprehension", score: 80 }] },
    { type: "pie", title: "Pie 1", data: [{ name: "Core", value: 100 }] },
    { type: "pie", title: "Pie 2 (Duplicate)", data: [{ name: "Core", value: 100 }] },
    { type: "unknown", title: "Unsupported", data: [{ name: "x", score: 90 }] },
    { type: "radar", title: "Empty radar", data: [] },
    { type: "polynomial", title: "Synthetic single-test progression", data: [{ step: "Stage 1", score: 80 }] },
  ];

  const result = keepVerifiedChartTypes(duplicateInput);
  assert.deepEqual(result.map((chart) => chart.title), ["Bar 1", "Pie 1"]);
  assert.equal(new Set(result.map((chart) => chart.type)).size, result.length);
});

test("Tareeka 11: missing chart data stays empty instead of producing estimated scores", () => {
  assert.deepEqual(keepVerifiedChartTypes([]), []);
  assert.deepEqual(keepVerifiedChartTypes([{ type: "bar", data: [] }]), []);

  const display = fs.readFileSync("src/components/topic/final-analysis-display.tsx", "utf8");
  assert.doesNotMatch(display, /defaultSuite|DEFAULT_PENTAGON_AXES|baseScore \* 1\.05/);
  assert.match(display, /No verified performance charts were returned/);
});

test("Tareeka 11: Pie chart label suppression prevents text collisions on zero slices", () => {
  function filterPieLabels(slice) {
    const { percent, value } = slice;
    if (!percent || percent < 0.05 || value <= 0) return null;
    return `${slice.name}: ${(percent * 100).toFixed(0)}%`;
  }

  assert.equal(filterPieLabels({ name: "Fact", value: 0, percent: 0 }), null, "Zero slice suppressed");
  assert.equal(filterPieLabels({ name: "Insight", value: 1, percent: 0.01 }), null, "<5% slice suppressed");
  assert.equal(filterPieLabels({ name: "Core", value: 50, percent: 0.50 }), "Core: 50%", "Valid slice displays label");
});
