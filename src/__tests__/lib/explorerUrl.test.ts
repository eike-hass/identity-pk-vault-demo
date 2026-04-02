import { describe, it, expect } from "vitest";
import { explorerObjectUrl } from "../../lib/explorerUrl";

const OBJ = "0xe4edef97da1257e83cbeb49159cfdd2da6ac971ac447f233f8439cf29376ebfe";

describe("explorerObjectUrl", () => {
  it("uses explorer.iota.org for testnet", () => {
    const url = explorerObjectUrl(OBJ, "testnet");
    expect(url).toBe(`https://explorer.iota.org/object/${OBJ}?network=testnet`);
  });

  it("uses explorer.iota.org for devnet", () => {
    const url = explorerObjectUrl(OBJ, "devnet");
    expect(url).toBe(`https://explorer.iota.org/object/${OBJ}?network=devnet`);
  });

  it("maps the mainnet alias 6364aad5 → network=mainnet", () => {
    const url = explorerObjectUrl(OBJ, "6364aad5");
    expect(url).toBe(`https://explorer.iota.org/object/${OBJ}?network=mainnet`);
  });

  it("uses localhost:3000 for localnet", () => {
    const url = explorerObjectUrl(OBJ, "localnet");
    expect(url).toBe(`http://localhost:3000/object/${OBJ}`);
  });

  it("passes unknown network values through unchanged", () => {
    const url = explorerObjectUrl(OBJ, "customnet");
    expect(url).toBe(`https://explorer.iota.org/object/${OBJ}?network=customnet`);
  });

  it("localnet URL contains no query parameters", () => {
    const url = explorerObjectUrl(OBJ, "localnet");
    expect(url).not.toContain("?");
  });
});
