import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { syncDonationDonor } from "../src/lib/donation-donor-sync.js";

test("rejection is atomic and limited to pending or legacy-unreviewed transactions", () => {
  const actions = fs.readFileSync("src/app/actions/donation.ts", "utf8");
  const reject = actions.slice(
    actions.indexOf("export async function adminRejectDonationTransaction"),
    actions.indexOf("\nexport async function adminUpdateDonationSettings")
  );
  assert.match(reject, /status: "pending"/);
  assert.match(reject, /status: \{ \$exists: false \}/);
  assert.match(reject, /status: null/);
  assert.match(reject, /findOneAndUpdate\([\s\S]*?\$or:[\s\S]*?status: "pending"/);
  assert.match(reject, /already been reviewed or is being processed/);
  assert.doesNotMatch(reject, /runValidators:\s*true/);
});

test("donor synchronization repairs a stale donorRecordId using transaction identity", async () => {
  const records = new Map();
  const existing = { _id: "donor-existing", uuid: "stable-donor", transactionRef: "tx-1", amount: 100 };
  records.set(existing.uuid, existing);
  const calls = [];
  const store = {
    async updateById(id) { calls.push(["updateById", id]); return null; },
    async findOneByTransactionRef(ref) {
      calls.push(["findOneByTransactionRef", ref]);
      return [...records.values()].find((row) => row.transactionRef === ref) || null;
    },
    async updateByUuid(uuid, data) {
      calls.push(["updateByUuid", uuid]);
      const row = records.get(uuid);
      if (!row) return null;
      Object.assign(row, data);
      return { ...row };
    },
    async upsertByUuid(uuid, data) {
      calls.push(["upsertByUuid", uuid]);
      const row = records.get(uuid) || { _id: "donor-new", uuid };
      Object.assign(row, data);
      records.set(uuid, row);
      return { ...row };
    },
  };
  const tx = { _id: "tx-1", donorRecordId: "deleted-donor-id" };
  const donor = await syncDonationDonor({
    tx,
    donorData: { amount: 250, transactionRef: "tx-1", isPublic: true },
    donorStore: store,
  });
  assert.equal(donor._id, "donor-existing");
  assert.equal(donor.amount, 250);
  assert.equal(tx.donorRecordId, "donor-existing");
  assert.deepEqual(calls.map(([name]) => name), ["updateById", "findOneByTransactionRef", "updateByUuid"]);
});

test("donor synchronization recreates a missing linked row with deterministic identity", async () => {
  const records = new Map();
  const store = {
    async updateById() { return null; },
    async findOneByTransactionRef() { return null; },
    async updateByUuid(uuid, data) {
      const row = records.get(uuid);
      if (!row) return null;
      Object.assign(row, data);
      return { ...row };
    },
    async upsertByUuid(uuid, data) {
      const row = records.get(uuid) || { _id: "donor-recreated", uuid };
      Object.assign(row, data);
      records.set(uuid, row);
      return { ...row };
    },
  };
  const tx = { _id: "tx-missing", donorRecordId: "deleted-donor-id" };
  const donor = await syncDonationDonor({
    tx,
    donorData: { amount: 500, transactionRef: "tx-missing" },
    donorStore: store,
  });
  assert.equal(donor._id, "donor-recreated");
  assert.equal(tx.donorRecordId, "donor-recreated");
  assert.equal(records.size, 1);
});
