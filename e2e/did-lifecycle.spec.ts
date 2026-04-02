/**
 * DID lifecycle E2E tests.
 *
 * Covers:
 *  1. Fund wallet via DevModeBanner faucet button
 *  2. Create DID — shows dashboard with DID string and Active badge
 *  3. DID persists after page reload (localStorage + vault unlock)
 *  4. Update DID — add a service endpoint; reflected in dashboard
 *  5. Resolve DID — Resolve tab finds the published document
 *  6. Forget DID — returns to CreateIdentity panel; clears localStorage
 *
 * REQUIRES: LOCALNET=true env variable + a running IOTA node on localhost:9000.
 * Run with: LOCALNET=true npm run test:e2e:did
 *
 * All tests are skipped automatically if LOCALNET is not set.
 */

import { test, expect } from "@playwright/test";
import { installVirtualAuthenticator, clearVaultDbScript } from "./helpers/webauthn";

const LOCALNET_REQUIRED = !process.env.LOCALNET;

test.beforeAll(() => {
  if (LOCALNET_REQUIRED) {
    // eslint-disable-next-line no-console
    console.log("Skipping DID tests — set LOCALNET=true and start a local IOTA node.");
  }
});

test.beforeEach(async ({ page }) => {
  test.skip(LOCALNET_REQUIRED, "Requires LOCALNET=true and a running local IOTA node");
  await page.addInitScript(clearVaultDbScript());
  page.on("console", (msg) => {
    if (msg.text().includes("[debug]")) console.log("BROWSER:", msg.text());
  });
});

// ── Shared fixture helpers ────────────────────────────────────────────────────

async function registerAndUnlock(page: Parameters<typeof installVirtualAuthenticator>[0]) {
  const { client } = await installVirtualAuthenticator(page);
  await page.goto("/");
  await page.getByRole("button", { name: /create key vault/i }).click();
  await expect(page.getByRole("button", { name: /my identity/i })).toBeVisible({ timeout: 10_000 });
  return { client };
}

async function switchToLocalnet(page: { getByRole: Function; selectOption: Function }) {
  // The network selector is a <select> in the Header.
  const select = (page as any).getByRole("combobox");
  await select.selectOption("localnet");
}

async function fundWallet(page: { getByRole: Function; getByText: Function }) {
  // DevModeBanner "Fund wallet" / "Request tokens" button.
  const fundBtn = (page as any).getByRole("button", { name: /fund wallet|request tokens/i });
  await fundBtn.click();
  // Wait until balance shows a POSITIVE value. The regex requires a leading non-zero
  // digit so "0.000 IOTA" (which is already visible before funding) does not match.
  await expect((page as any).getByText(/[1-9]\d*\.\d+ iota/i)).toBeVisible({ timeout: 30_000 });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test("fund wallet increases balance shown in DevModeBanner", async ({ page }) => {
  const { client } = await registerAndUnlock(page);

  await switchToLocalnet(page);
  // Balance starts at 0 (or unavailable).
  await page.waitForTimeout(500);
  await fundWallet(page);
  // After polling confirms increase, DevModeBanner shows non-zero IOTA balance.
  await expect(page.getByText(/\d+\.\d{3} iota/i)).toBeVisible();

  await client.detach();
});

test("create DID — dashboard shows DID string and Active badge", async ({ page }) => {
  const { client } = await registerAndUnlock(page);

  await switchToLocalnet(page);
  await fundWallet(page);

  await page.getByRole("button", { name: /my identity/i }).click();
  // CreateIdentity panel should be visible (no DID yet).
  await expect(page.getByRole("button", { name: /create identity/i })).toBeVisible();

  // Create the DID (no display name needed).
  await page.getByRole("button", { name: /create identity/i }).click();

  // Wait for the transaction and DID resolution (up to 30s).
  await expect(page.getByText(/did:iota:/i)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/● active/i)).toBeVisible();
  await expect(page.getByText(/view on iota explorer/i)).toBeVisible();

  await client.detach();
});

test("DID persists after page reload", async ({ page }) => {
  const { client } = await registerAndUnlock(page);
  await switchToLocalnet(page);
  await fundWallet(page);

  await page.getByRole("button", { name: /my identity/i }).click();
  await page.getByRole("button", { name: /create identity/i }).click();
  await expect(page.getByText(/did:iota:/i)).toBeVisible({ timeout: 30_000 });

  // Capture the DID string.
  const didText = await page.getByText(/did:iota:[^\s]+/i).first().textContent();
  expect(didText).toBeTruthy();

  // Reload — vault will be locked; unlock it.
  await page.reload();
  await expect(page.getByText(/unlock your key vault/i)).toBeVisible({ timeout: 5_000 });

  // Re-install virtual authenticator after reload (same CDP session, still valid).
  await page.getByRole("button", { name: /unlock with biometrics/i }).click();
  await expect(page.getByRole("button", { name: /my identity/i })).toBeVisible({ timeout: 10_000 });

  // DID dashboard should reload and show the same DID (may appear in multiple places).
  await expect(page.getByText(new RegExp(didText!.slice(0, 20))).first()).toBeVisible({ timeout: 10_000 });

  await client.detach();
});

test("add service endpoint to DID", async ({ page }) => {
  const { client } = await registerAndUnlock(page);
  await switchToLocalnet(page);
  await fundWallet(page);

  await page.getByRole("button", { name: /my identity/i }).click();
  await page.getByRole("button", { name: /create identity/i }).click();
  await expect(page.getByText(/● active/i)).toBeVisible({ timeout: 30_000 });

  // Open the update panel.
  await page.getByRole("button", { name: /update identity/i }).click();

  // Add a service endpoint (placeholder is the default fragment value "#linked-domain").
  await page.getByPlaceholder(/#linked-domain/i).fill("#linked-domain");
  await page.getByPlaceholder(/https:\/\//i).fill("https://example.com");
  // Two "Add Service" elements exist: the mode tab and the submit button; click the submit button (last).
  await page.getByRole("button", { name: /^add service$/i }).last().click();

  // After the transaction, the service should appear in the dashboard.
  await expect(page.getByText("https://example.com")).toBeVisible({ timeout: 30_000 });

  await client.detach();
});

test("resolve DID tab finds a published document", async ({ page }) => {
  test.setTimeout(90_000); // register+fund+create+retry resolve can exceed the 30s default
  const { client } = await registerAndUnlock(page);
  await switchToLocalnet(page);
  await fundWallet(page);

  // Create a DID to resolve.
  await page.getByRole("button", { name: /my identity/i }).click();
  await page.getByRole("button", { name: /create identity/i }).click();
  await expect(page.getByText(/did:iota:/i)).toBeVisible({ timeout: 30_000 });

  const didText = (await page.getByText(/did:iota:[^\s]+/i).first().textContent())!.trim();

  // Switch to the Resolve tab and look it up.
  await page.getByRole("button", { name: /resolve did/i }).click();
  await page.getByPlaceholder(/did:iota:/i).fill(didText);

  // Retry the resolve in case the localnet node is transiently inconsistent
  // right after object creation (IdentityDashboard handles this with retryAsync;
  // we replicate that here by re-clicking the Resolve button until it succeeds).
  await expect(async () => {
    await page.getByRole("button", { name: /^resolve$/i }).click();
    await expect(page.getByText(/● active/i)).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 30_000, intervals: [2_000] });

  await client.detach();
});

test("forget DID clears dashboard and returns to Create panel", async ({ page }) => {
  const { client } = await registerAndUnlock(page);
  await switchToLocalnet(page);
  await fundWallet(page);

  await page.getByRole("button", { name: /my identity/i }).click();
  await page.getByRole("button", { name: /create identity/i }).click();
  await expect(page.getByText(/did:iota:/i)).toBeVisible({ timeout: 30_000 });

  await page.getByRole("button", { name: /forget/i }).click();
  await expect(page.getByRole("button", { name: /create identity/i })).toBeVisible();

  // Reload — DID should still be gone (localStorage was cleared).
  await page.reload();
  await page.getByRole("button", { name: /unlock with biometrics/i }).click();
  await expect(page.getByRole("button", { name: /my identity/i })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /my identity/i }).click();
  await expect(page.getByRole("button", { name: /create identity/i })).toBeVisible();

  await client.detach();
});
