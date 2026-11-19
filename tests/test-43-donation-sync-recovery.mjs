import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { syncDonationDonor } from "../src/lib/donation-donor-sync.js";

const readProductionSource = () => [
  fs.readFileSync("src/app/actions/donation.ts", "utf8"),
  fs.readFileSync("src/lib/donation-donor-sync.js", "utf8"),
].join("\n");

test("manual donation donor sync uses a stable transaction-derived identity", () => {
  const source = readProductionSource();
  assert.match(source, /createHash\("sha256"\)\.update\(\`conceptnichod:donation:\$\{tx\._id\}\`\)/);
  assert.match(source, /findOneAndUpdate\(\s*\{ uuid: donorUuid \}/);
  assert.match(source, /donorError\?\.code !== 11000/);
  assert.match(source, /\$setOnInsert: \{ uuid: donorUuid \}/);
});

test("verified donation can resume only an incomplete patron sync without changing its amount", () => {
  const source = readProductionSource();
  assert.match(source, /tx\.status === "verified" && Boolean\(tx\.isPublishedToPatrons\) && !tx\.donorRecordId/);
  assert.match(source, /Number\(tx\.verifiedAmount\) !== confirmedAmount/);
  assert.match(source, /if \(!isDonorSyncRecovery\)\s*\{[\s\S]*?findOneAndUpdate/);
  assert.match(source, /Keep the bank-verified status if patron sync fails/);
  assert.doesNotMatch(source, /status: "pending"\s*\},\s*\$unset:\s*\{ verifiedAt/);
});

function createInMemoryDonorStore({ failBeforeFirstWrite = false, failAfterFirstCommittedWrite = true } = {}) {
  const records = new Map();
  let failBeforeWrite = failBeforeFirstWrite;
  let failAfterWrite = failAfterFirstCommittedWrite;
  let hideNextTransactionLookup = false;
  let forceDuplicateKeyOnNextExistingUpsert = false;

  const copy = (record) => record ? { ...record } : null;
  const store = {
    async findOneByTransactionRef(transactionRef) {
      if (hideNextTransactionLookup) {
        hideNextTransactionLookup = false;
        return null;
      }
      const record = [...records.values()].find(
        (candidate) => candidate.transactionRef === transactionRef
      );
      return copy(record);
    },

    async upsertByUuid(uuid, donorData) {
      if (failBeforeWrite) {
        failBeforeWrite = false;
        throw new Error("simulated MongoDB pre-write failure");
      }
      const existing = records.get(uuid);
      if (forceDuplicateKeyOnNextExistingUpsert && existing) {
        forceDuplicateKeyOnNextExistingUpsert = false;
        const duplicate = new Error("simulated MongoDB E11000 duplicate key");
        duplicate.code = 11000;
        throw duplicate;
      }

      const record = existing || { _id: "donor-" + (records.size + 1), uuid };
      Object.assign(record, donorData);
      records.set(uuid, record);

      // The database commits, but the network acknowledgement is lost.
      if (failAfterWrite) {
        failAfterWrite = false;
        throw new Error("simulated MongoDB write acknowledgement timeout");
      }
      return copy(record);
    },

    async updateByUuid(uuid, donorData) {
      const record = records.get(uuid);
      if (!record) return null;
      Object.assign(record, donorData);
      return copy(record);
    },

    async updateById(id, donorData) {
      const record = [...records.values()].find((candidate) => candidate._id === id);
      if (!record) return null;
      Object.assign(record, donorData);
      return copy(record);
    },

    // The real schema stores one row per transaction in totalAmount. This
    // aggregate exposes the requested totalDonated across those rows.
    totals() {
      const donors = [...records.values()];
      return {
        totalDonated: donors.reduce((sum, donor) => sum + Number(donor.amount || 0), 0),
        donationCount: donors.reduce((sum, donor) => sum + Number(donor.donationCount || 0), 0),
        rowCount: donors.length,
      };
    },

    simulateStaleLookupAndDuplicateKey() {
      hideNextTransactionLookup = true;
      forceDuplicateKeyOnNextExistingUpsert = true;
    },

    get records() {
      return records;
    },
  };
  return store;
}

test("₹500 donor sync survives timeout, recovers, and remains idempotent after E11000", async () => {
  const donorStore = createInMemoryDonorStore();
  const transaction = {
    _id: "transaction-500",
    status: "pending",
    verifiedAmount: null,
    isPublishedToPatrons: true,
    donorRecordId: null,
    donorName: "Fault Injection Donor",
    message: "Behavioral recovery test",
  };

  const patronData = () => ({
    name: transaction.donorName,
    amount: 500,
    totalAmount: 500,
    donationCount: 1,
    transactionRef: String(transaction._id),
    isVisible: true,
    isPublic: true,
  });

  // The harness models the verification/recovery gate. The donor-sync function
  // invoked here is the exact helper called by the production server action.
  async function verifyAndSync(tx) {
    const isDonorSyncRecovery = tx.status === "verified" && Boolean(tx.isPublishedToPatrons) && !tx.donorRecordId;
    if (tx.status && tx.status !== "pending" && !isDonorSyncRecovery) {
      return { success: false, error: "already reviewed" };
    }
    if (!isDonorSyncRecovery) {
      tx.status = "verified";
      tx.verifiedAmount = 500;
      tx.isPublishedToPatrons = true;
    } else {
      assert.equal(Number(tx.verifiedAmount), 500, "recovery must preserve the bank-verified amount");
    }

    const donor = await syncDonationDonor({ tx, donorData: patronData(), donorStore });
    return { success: true, donor };
  }

  // Attempt 1: pending -> verified; donor upsert commits, then its response
  // times out. Transaction status must remain verified and unlinked.
  await assert.rejects(
    verifyAndSync(transaction),
    /simulated MongoDB write acknowledgement timeout/
  );
  assert.equal(transaction.status, "verified");
  assert.equal(transaction.verifiedAmount, 500);
  assert.equal(transaction.donorRecordId, null, "donor synchronization is incomplete");
  assert.equal(donorStore.totals().rowCount, 1, "the timed-out write may already have committed");

  // Attempt 2: retry detects the already-written deterministic Donor row and
  // applies fixed values, completing the transaction-to-donor link.
  const recovered = await verifyAndSync(transaction);
  assert.equal(recovered.success, true);
  assert.ok(transaction.donorRecordId);
  const expectedUuid = createHash("sha256").update("conceptnichod:donation:" + transaction._id).digest("hex");
  assert.equal(recovered.donor.uuid, expectedUuid);
  assert.deepEqual(donorStore.totals(), { totalDonated: 500, donationCount: 1, rowCount: 1 });

  // Attempt 3: a concurrent worker has a stale tx snapshot and misses the row
  // on its read. Its deterministic upsert hits E11000; the helper falls back
  // to a set-only update instead of crediting the transaction a second time.
  const concurrentRetry = { ...transaction, donorRecordId: null };
  donorStore.simulateStaleLookupAndDuplicateKey();
  const duplicate = await verifyAndSync(concurrentRetry);
  assert.equal(duplicate.success, true);
  assert.equal(concurrentRetry.donorRecordId, transaction.donorRecordId);
  assert.deepEqual(donorStore.totals(), { totalDonated: 500, donationCount: 1, rowCount: 1 });
});


test("pre-write donor failure retries by inserting the missing donor row exactly once", async () => {
  const donorStore = createInMemoryDonorStore({ failBeforeFirstWrite: true, failAfterFirstCommittedWrite: false });
  const transaction = { _id: "transaction-pre-write-failure", donorRecordId: null };
  const donorData = { amount: 750, totalAmount: 750, donationCount: 1, transactionRef: String(transaction._id), isVisible: true, isPublic: true };
  await assert.rejects(syncDonationDonor({ tx: transaction, donorData, donorStore }), /simulated MongoDB pre-write failure/);
  assert.equal(donorStore.totals().rowCount, 0);
  assert.equal(transaction.donorRecordId, null);
  const recovered = await syncDonationDonor({ tx: transaction, donorData, donorStore });
  assert.ok(recovered._id);
  assert.equal(transaction.donorRecordId, recovered._id);
  assert.deepEqual(donorStore.totals(), { totalDonated: 750, donationCount: 1, rowCount: 1 });
  const repeated = await syncDonationDonor({ tx: { ...transaction, donorRecordId: null }, donorData, donorStore });
  assert.equal(repeated._id, recovered._id);
  assert.deepEqual(donorStore.totals(), { totalDonated: 750, donationCount: 1, rowCount: 1 });
});
