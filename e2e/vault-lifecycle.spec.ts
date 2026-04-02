/**
 * Vault lifecycle E2E tests.
 *
 * Covers:
 *  1. Fresh page → "unregistered" panel shown
 *  2. Register passkey → vault unlocks → app tabs appear
 *  3. Reload after registration → "locked" panel shown → unlock → tabs appear
 *  4. VaultStatusPill in Header reflects current vault state
 *
 * Requires: Chrome (for virtual WebAuthn PRF support via CDP).
 * Wallet: VITE_USE_MOCK=true (burner wallet, auto-connected by DevModeBanner).
 * Network: no IOTA node required — vault flows use only local browser APIs.
 */

import { test, expect } from "@playwright/test";
import { installVirtualAuthenticator, clearVaultDbScript } from "./helpers/webauthn";

test.beforeEach(async ({ page }) => {
  // Wipe vault IDB before any app code runs to ensure a clean unregistered state.
  await page.addInitScript(clearVaultDbScript());
});

test("shows the unregistered panel on a fresh load", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /secure your identity keys/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /create key vault/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /restore from backup/i })).toBeVisible();
  // App tabs should NOT be visible before vault is set up.
  await expect(page.getByRole("button", { name: /my identity/i })).not.toBeVisible();
});

test("register passkey → vault unlocks → app tabs appear", async ({ page }) => {
  await page.goto("/");
  // Install authenticator after navigation — Chrome's WebAuthn virtual environment
  // is per-renderer and resets on navigation, so it must be set up post-goto.
  const { client } = await installVirtualAuthenticator(page);

  await page.getByRole("button", { name: /create key vault/i }).click();

  // After the virtual authenticator processes the create() call the vault
  // transitions to "unlocked" and renders the main app tabs.
  await expect(page.getByRole("button", { name: /my identity/i })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: /resolve did/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /key vault/i })).toBeVisible();

  await client.detach();
});

test("reload after registration → locked state → unlock → tabs appear", async ({ page }) => {
  await page.goto("/");
  const { client } = await installVirtualAuthenticator(page);

  // Register.
  await page.getByRole("button", { name: /create key vault/i }).click();
  await expect(page.getByRole("button", { name: /my identity/i })).toBeVisible({ timeout: 10_000 });

  // Reload — IDB credential record persists; the virtual authenticator also persists
  // in Chrome on the same CDP session (no need to re-install).
  await page.reload();

  // App reads the credential record and transitions to "locked".
  await expect(page.getByText(/unlock your key vault/i)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: /unlock with biometrics/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /my identity/i })).not.toBeVisible();

  // Unlock.
  await page.getByRole("button", { name: /unlock with biometrics/i }).click();
  await expect(page.getByRole("button", { name: /my identity/i })).toBeVisible({ timeout: 10_000 });

  await client.detach();
});

test("VaultStatusPill shows Unlocked after registration", async ({ page }) => {
  await page.goto("/");
  const { client } = await installVirtualAuthenticator(page);
  await page.getByRole("button", { name: /create key vault/i }).click();
  await expect(page.getByRole("button", { name: /my identity/i })).toBeVisible({ timeout: 10_000 });

  // The pill is visible when a wallet is connected (burner auto-connects in mock mode).
  // exact: true avoids matching the parent container which also contains the tooltip text.
  await expect(page.getByText("Unlocked", { exact: true })).toBeVisible();

  await client.detach();
});

test("VaultStatusPill shows Locked after reload", async ({ page }) => {
  await page.goto("/");
  const { client } = await installVirtualAuthenticator(page);
  await page.getByRole("button", { name: /create key vault/i }).click();
  await expect(page.getByRole("button", { name: /my identity/i })).toBeVisible({ timeout: 10_000 });
  await page.reload();
  // Wait for wallet auto-reconnect and vault status pill to show "Locked".
  await expect(page.getByText("Locked", { exact: true })).toBeVisible({ timeout: 10_000 });
  await client.detach();
});

test("restore-from-backup toggle shows file and password inputs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /restore from backup/i }).click();
  // Label lacks htmlFor so use a direct input locator instead of getByLabel.
  await expect(page.locator('input[type="file"]')).toBeVisible();
  await expect(page.getByPlaceholder(/password used when exporting/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /register passkey & restore/i })).toBeVisible();
  // Button should be disabled until a file and password are provided.
  await expect(page.getByRole("button", { name: /register passkey & restore/i })).toBeDisabled();
});
