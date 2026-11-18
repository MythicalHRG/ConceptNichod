export interface DonationDonorRecord {
  _id: unknown;
  uuid: string;
}

export interface DonationDonorTransaction {
  _id: unknown;
  donorRecordId?: string | null;
}

export interface DonationDonorStore<TRecord extends DonationDonorRecord> {
  findOneByTransactionRef(transactionRef: string): Promise<TRecord | null>;
  upsertByUuid(uuid: string, donorData: Record<string, unknown>): Promise<TRecord | null>;
  updateByUuid(uuid: string, donorData: Record<string, unknown>): Promise<TRecord | null>;
  updateById(id: string, donorData: Record<string, unknown>): Promise<TRecord | null>;
}

export declare function syncDonationDonor<TRecord extends DonationDonorRecord>(args: {
  tx: DonationDonorTransaction;
  donorData: Record<string, unknown>;
  donorStore: DonationDonorStore<TRecord>;
}): Promise<TRecord>;
