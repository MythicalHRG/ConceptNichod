import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// ---------------------------------------------------------------------------
// Suite 39: Admin UPI Configuration Simplification
// ---------------------------------------------------------------------------

test('39.1 Admin Panel retains ONLY official UPI ID configuration in donations tab', () => {
  const adminPanelPath = path.resolve('src/components/admin/admin-panel.tsx');
  const content = fs.readFileSync(adminPanelPath, 'utf8');

  // Verify Official UPI Configuration card is present
  assert.ok(content.includes('Official UPI Configuration') || content.includes('UPI Configuration'), 'Must contain UPI Configuration');
  assert.ok(content.includes('Official UPI ID / VPA'), 'Must contain Official UPI ID / VPA label');
  assert.ok(content.includes('donationSettings.upiId'), 'Must bind donationSettings.upiId');
  assert.ok(content.includes('handleSaveDonationSettings'), 'Must have handleSaveDonationSettings');

  // Verify QR code URL, instructions, thank you note, and manual donor cards are removed
  assert.ok(!content.includes('UPI QR Code Image URL'), 'Must not contain UPI QR Code Image URL');
  assert.ok(!content.includes('qrCodeUrl'), 'Must not contain qrCodeUrl');
  assert.ok(!content.includes('Custom Instructions for Donors'), 'Must not contain Custom Instructions for Donors');
  assert.ok(!content.includes('customInstructions'), 'Must not contain customInstructions');
  assert.ok(!content.includes('thankYouNote'), 'Must not contain thankYouNote');
  assert.ok(!content.includes('Add Donor Card'), 'Must not contain manual Add Donor Card form');
  assert.ok(!content.includes('Hall of Patrons Cards'), 'Must not contain Hall of Patrons Cards in admin panel');

  // Verify Rupee component is retained in admin panel
  assert.ok(content.includes('<Rupee'), 'Admin panel must retain <Rupee component');
});

test('39.2 updateDonationSettingsAction supports payload with upiId alone', () => {
  const donationActionPath = path.resolve('src/app/actions/donation.ts');
  const content = fs.readFileSync(donationActionPath, 'utf8');

  assert.ok(content.includes('qrCodeUrl?: string'), 'qrCodeUrl must be optional');
  assert.ok(content.includes('customInstructions?: string'), 'customInstructions must be optional');
  assert.ok(content.includes('thankYouNote?: string'), 'thankYouNote must be optional');
});
