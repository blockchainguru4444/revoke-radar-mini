export type RiskLevel = "green" | "orange" | "red";

export type ScanItem = {
  chainId: number;
  chainName: string;
  tokenSymbol: string;
  tokenAddress: `0x${string}`;
  spenderName: string;
  spenderAddress: `0x${string}`;
  allowanceLabel: string;
  risk: RiskLevel;
  reason: string;
};
