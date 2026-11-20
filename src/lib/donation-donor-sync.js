import { createHash } from "node:crypto";

/**
 * Idempotently synchronizes one verified donation to its transaction-scoped
 * Donor row. The adapter owns the database operations; this state machine
 * owns the deterministic identity and duplicate-key recovery behavior.
 */
export async function syncDonationDonor({ tx, donorData, donorStore }) {
  if (!tx || tx._id == null || String(tx._id).trim() === "") {
    throw new Error("Donation transaction ID is required for donor synchronization.");
  }
  const transactionRef = String(tx._id);
  const existingDonor = tx.donorRecordId
    ? null
    : await donorStore.findOneByTransactionRef(transactionRef);
  const donorUuid =
    existingDonor?.uuid ||
    createHash("sha256").update(`conceptnichod:donation:${tx._id}`).digest("hex");

  let donor;
  if (tx.donorRecordId) {
    donor = await donorStore.updateById(String(tx.donorRecordId), donorData);
  } else {
    try {
      donor = await donorStore.upsertByUuid(donorUuid, donorData);
    } catch (donorError) {
      if (donorError?.code !== 11000) throw donorError;
      donor = await donorStore.updateByUuid(donorUuid, donorData);
    }
  }

  if (!donor) {
    throw new Error("Donor record could not be confirmed; retry patron synchronization.");
  }

  tx.donorRecordId = String(donor._id);
  return donor;
}
