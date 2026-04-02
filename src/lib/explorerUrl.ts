/**
 * Returns an IOTA Explorer URL for a given on-chain object ID and network name.
 * The network name comes from IotaDID.network() / IdentityClient.network().
 * Mainnet DIDs omit the network segment so network() returns the alias "6364aad5".
 */
export function explorerObjectUrl(objectId: string, network: string): string {
  if (network === "localnet") {
    return `http://localhost:3000/object/${objectId}`;
  }
  const netParam = network === "6364aad5" ? "mainnet" : network;
  return `https://explorer.iota.org/object/${objectId}?network=${netParam}`;
}
