// lib/spenders.ts
export type Spender = {
  name: string;
  address: `0x${string}`;
  tier?: "core" | "known";
};

// FREE: klein, aber trefferstark
export const BASE_SPENDERS_FREE: Spender[] = [
  { name: "Aerodrome Router", address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43", tier: "core" },
  { name: "1inch Router v6", address: "0x54b5eb235c3935c39f834e58fd439b826f2a1dfb", tier: "core" },
  { name: "Uniswap Universal Router", address: "0xEf1c6E67703c7BD7107eed8303Fbe6EC2554BF6B", tier: "core" },
  { name: "Uniswap V3 SwapRouter", address: "0xE592427A0AEce92De3Edee1F18E0157C05861564", tier: "core" },
  { name: "Permit2", address: "0x000000000022D473030F116dDEE9F6B43aC78BA3", tier: "known" },
];

// PRO: größer (mehr Treffer)
export const BASE_SPENDERS_PRO: Spender[] = [
  ...BASE_SPENDERS_FREE,
  { name: "Uniswap V3 NonfungiblePositionManager", address: "0xC36442b4a4522E871399CD717aBDD847Ab11FE88", tier: "known" },
];
