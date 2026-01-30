export type RiskLevel = "green" | "orange" | "red";

export type ScanItem = {
  tokenSymbol: string;
  tokenAddress: `0x${string}`;
  spenderName: string;
  spenderAddress: `0x${string}`;
  allowanceLabel: string;
  risk: RiskLevel;
  reason: string;
};

export async function scanApprovals(params: { owner: `0x${string}`; isPro: boolean }) {
  const res = await fetch("/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `Scan failed (${res.status})`);
  return (data?.items ?? []) as ScanItem[];
}
