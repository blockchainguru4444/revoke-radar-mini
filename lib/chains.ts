import { base, mainnet, optimism, arbitrum } from "viem/chains";

export type SupportedChainId = 8453 | 1 | 10 | 42161;

export const CHAINS: Record<
  SupportedChainId,
  { id: SupportedChainId; name: string; viemChain: any; blockscoutBaseUrl: string }
> = {
  8453: { id: 8453, name: "Base", viemChain: base, blockscoutBaseUrl: "https://base.blockscout.com" },
  1: { id: 1, name: "Ethereum", viemChain: mainnet, blockscoutBaseUrl: "https://eth.blockscout.com" },
  10: { id: 10, name: "Optimism", viemChain: optimism, blockscoutBaseUrl: "https://optimism.blockscout.com" },
  42161: { id: 42161, name: "Arbitrum", viemChain: arbitrum, blockscoutBaseUrl: "https://arbitrum.blockscout.com" },
};

export const DEFAULT_CHAIN_IDS: SupportedChainId[] = [8453, 1, 10, 42161];

export function getEthRpcUrl(chainId: SupportedChainId) {
  // many blockscout instances support /api/eth-rpc
  return `${CHAINS[chainId].blockscoutBaseUrl}/api/eth-rpc`;
}

export function getTokenBalancesUrl(chainId: SupportedChainId, owner: string) {
  return `${CHAINS[chainId].blockscoutBaseUrl}/api/v2/addresses/${owner}/token-balances`;
}
