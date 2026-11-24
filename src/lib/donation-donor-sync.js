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
  const donorUuid = (uuid) =>
    uuid || createHash("sha256").update("conceptnichod:donation:" + transactionRef).digest("hex");

  // Prefer the persisted link, but do not let a stale/deleted donor ID make
  // synchronization permanently unrecoverable. Fall back to the transaction
  // reference and finally to the deterministic UUID upsert.
  let donor = tx.donorRecordId
    ? await donorStore.updateById(String(tx.donorRecordId), donorData)
    : null;

  if (!donor) {
    const existingDonor = await donorStore.findOneByTransactionRef(transactionRef);
    const stableUuid = donorUuid(existingDonor?.uuid);
    if (existingDonor) {
      donor = await donorStore.updateByUuid(stableUuid, donorData);
    } else {
      try {
        donor = await donorStore.upsertByUuid(stableUuid, donorData);
      } catch (donorError) {
        if (donorError?.code !== 11000) throw donorError;
        donor = await donorStore.updateByUuid(stableUuid, donorData);
      }
    }
  }

  if (!donor) {
    throw new Error("Donor record could not be confirmed; retry patron synchronization.");
  }

  tx.donorRecordId = String(donor._id);
  return donor;
}
