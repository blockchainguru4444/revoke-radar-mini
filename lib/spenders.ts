export type Spender = {
  name: string;
  address: `0x${string}`;
  category: "dex" | "permit" | "other";
};

// Minimal but useful spenders for Base (MVP)
export const BASE_SPENDERS_FREE: Spender[] = [
  {
    name: "Uniswap Universal Router",
    address: "0x198EF79F1F515F02dFE9e3115eD9fC07183f02fC",
    category: "dex",
  },
  {
    name: "Aerodrome Router",
    address: "0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43",
    category: "dex",
  },
];

export const BASE_SPENDERS_PRO: Spender[] = [
  ...BASE_SPENDERS_FREE,
  {
    name: "Uniswap SwapRouter02",
    address: "0x2626664c2603336E57B271c5C0b26F421741e481",
    category: "dex",
  },
  {
    name: "Uniswap V2 Router",
    address: "0x4752ba5dbc23f44d87826276bf6fd6b1c372ad24",
    category: "dex",
  },
  {
    name: "Permit2",
    address: "0x000000000022D473030F116dDEE9F6B43aC78BA3",
    category: "permit",
  },
];
