/**
 * Backup and restore E2E tests.
 *
 * Covers:
 *  1. Export backup — generates valid JSON file with correct structure
 *  2. Import wrong password — shows "Decryption failed" error
 *  3. Import correct password — shows key count; idempotent (0 new keys when vault already has them)
 *  4. Register & restore — clear IDB to simulate new device; upload backup; register new passkey;
 *     vault unlocks with all keys in place
 *
 * Requires: Chrome (virtual WebAuthn PRF via CDP).
 * No IOTA node required.
 */

import { test, expect } from "@playwright/test";
import * as path from "path";
import * as fs from "fs/promises";
import * as os from "os";
import { installVirtualAuthenticator, clearVaultDbScript } from "./helpers/webauthn";

const BACKUP_PASSWORD = "test-backup-password-123";

// Shared fixture: navigates to the app, installs a virtual authenticator, and
// registers a fresh vault. Authenticator must be installed AFTER goto() because
// Chrome's WebAuthn virtual environment resets on navigation.
async function registerVault(page: Parameters<typeof installVirtualAuthenticator>[0]) {
  await page.goto("/");
  const { client } = await installVirtualAuthenticator(page);
  await page.getByRole("button", { name: /create key vault/i }).click();
  await expect(page.getByRole("button", { name: /my identity/i })).toBeVisible({ timeout: 10_000 });
  return { client };
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(clearVaultDbScript());
});

test("export produces a downloadable JSON backup file", async ({ page }) => {
  const { client } = await registerVault(page);

  // Navigate to the Key Vault tab.
  await page.getByRole("button", { name: /key vault/i }).click();

  // Fill in matching passwords (labels lack htmlFor, use placeholders instead).
  await page.getByPlaceholder("Min. 8 characters").fill(BACKUP_PASSWORD);
  await page.getByPlaceholder("Repeat password").fill(BACKUP_PASSWORD);

  // Trigger download and capture the file.
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /download backup/i }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toMatch(/^iota-vault-backup-.+\.json$/);

  // Verify the file is valid JSON with the expected structure.
  const filePath = await download.path();
  const content = await fs.readFile(filePath!, "utf-8");
  const parsed = JSON.parse(content);
  expect(parsed.version).toBe(1);
  expect(parsed.kdf.algorithm).toBe("PBKDF2");
  expect(parsed.kdf.iterations).toBe(600_000);
  expect(typeof parsed.iv).toBe("string");
  expect(typeof parsed.payload).toBe("string");

  await expect(page.getByText(/downloaded/i)).toBeVisible();
  await client.detach();
});

test("import with wrong password shows Decryption failed error", async ({ page }) => {
  const { client } = await registerVault(page);
  await page.getByRole("button", { name: /key vault/i }).click();

  // Export a real backup first.
  // Export password (labels lack htmlFor, use placeholders).
  await page.getByPlaceholder("Min. 8 characters").fill(BACKUP_PASSWORD);
  await page.getByPlaceholder("Repeat password").fill(BACKUP_PASSWORD);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /download backup/i }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();

  // Upload backup with a wrong password.
  await page.locator('input[type="file"]').setInputFiles(backupPath!);
  await page.getByPlaceholder(/password used when exporting/i).fill("wrong-password-xyz");

  await page.getByRole("button", { name: /restore from backup/i }).click();
  await expect(page.getByText(/decryption failed/i)).toBeVisible({ timeout: 10_000 });

  await client.detach();
});

test("import correct password shows success with 0 new keys (idempotent)", async ({ page }) => {
  const { client } = await registerVault(page);
  await page.getByRole("button", { name: /key vault/i }).click();

  // Export.
  // Export password (labels lack htmlFor, use placeholders).
  await page.getByPlaceholder("Min. 8 characters").fill(BACKUP_PASSWORD);
  await page.getByPlaceholder("Repeat password").fill(BACKUP_PASSWORD);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /download backup/i }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();

  // Import to the SAME vault — all keys already exist, so 0 are added.
  await page.locator('input[type="file"]').setInputFiles(backupPath!);
  
  await page.getByPlaceholder(/password used when exporting/i).fill(BACKUP_PASSWORD);
  await page.getByRole("button", { name: /restore from backup/i }).click();

  await expect(page.getByText(/0 new keys imported/i)).toBeVisible({ timeout: 10_000 });

  await client.detach();
});

test("register & restore — new device flow", async ({ page }) => {
  // ── Step 1: Register vault on "old device" and export a backup ──────────────
  const { client } = await registerVault(page);
  await page.getByRole("button", { name: /key vault/i }).click();

  // Export password (labels lack htmlFor, use placeholders).
  await page.getByPlaceholder("Min. 8 characters").fill(BACKUP_PASSWORD);
  await page.getByPlaceholder("Repeat password").fill(BACKUP_PASSWORD);
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /download backup/i }).click();
  const download = await downloadPromise;
  const backupPath = await download.path();

  // Save to a stable temp path (the Playwright download path may be cleaned up).
  const savedBackup = path.join(os.tmpdir(), `iota-vault-test-${Date.now()}.json`);
  await fs.writeFile(savedBackup, await fs.readFile(backupPath!));

  // ── Step 2: Simulate "new device" — clear IDB and reload ───────────────────
  // The virtual authenticator persists through reload on the same CDP session
  // (no need to detach and reinstall). Clearing IDB removes the vault credential
  // record so the app sees an "unregistered" state after reload.
  //
  // Fire the delete without awaiting completion — the React app holds an open
  // IDB connection that blocks deletion. page.reload() tears down that connection
  // and the pending delete completes before the new page re-opens the database.
  await page.evaluate(() => { indexedDB.deleteDatabase("iota-identity-vault"); });
  await page.reload();

  // ── Step 3: Restore from backup ─────────────────────────────────────────────
  await expect(page.getByRole("button", { name: /create key vault/i })).toBeVisible();
  await page.getByRole("button", { name: /restore from backup/i }).click();

  await page.locator('input[type="file"]').setInputFiles(savedBackup);
  await page.getByPlaceholder(/password used when exporting/i).fill(BACKUP_PASSWORD);

  await page.getByRole("button", { name: /register passkey & restore/i }).click();

  // Vault should unlock and show app tabs.
  await expect(page.getByRole("button", { name: /my identity/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Unlocked", { exact: true })).toBeVisible();

  await client.detach();
  await fs.unlink(savedBackup).catch(() => {});
});
