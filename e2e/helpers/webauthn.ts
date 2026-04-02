import type { Page } from "@playwright/test";

/**
 * Installs a Chrome virtual WebAuthn authenticator for the current page via CDP.
 *
 * The authenticator supports the PRF extension, which is required for the IOTA
 * Identity passkey vault to derive the AES-GCM vault key.
 *
 * Must be called AFTER page.goto() — Chrome's WebAuthn virtual environment is
 * per-renderer and resets on navigation.
 *
 * Returns the CDP session so callers can detach it in afterEach / test cleanup.
 */
export async function installVirtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable", { enableUI: false });
  const { authenticatorId } = await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      // CDP property is hasPrf (camelCase with lowercase 'rf'), not hasPRF.
      hasPrf: true,
    },
  });
  return { client, authenticatorId };
}

/**
 * Returns an init script that clears the IOTA Identity vault database exactly
 * once per page session (first load only, not on reloads).
 *
 * addInitScript fires on every navigation including page.reload(), so without
 * the sessionStorage guard a reload inside a test would wipe vault state that
 * the test just registered, sending the vault back to "unregistered" instead
 * of the expected "locked" state.
 */
export function clearVaultDbScript() {
  return () => {
    if (sessionStorage.getItem("vaultCleared")) return;
    sessionStorage.setItem("vaultCleared", "1");
    const req = indexedDB.deleteDatabase("iota-identity-vault");
    req.onerror = () => {};
  };
}
