import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits } from "viem";
import { base } from "viem/chains";
import { BASE_SPENDERS_FREE, BASE_SPENDERS_PRO } from "@/lib/spenders";

export const runtime = "nodejs"; // important: run on server

const publicClient = createPublicClient({
  chain: base,
  transport: http("https://mainnet.base.org"),
});

const erc20Abi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "amount", type: "uint256" }],
  },
] as const;

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

type TokenBalanceRow = any;

const UNLIMITED_THRESHOLD = 1n << 255n;

function isUnlimitedAllowance(a: bigint) {
  return a >= UNLIMITED_THRESHOLD;
}

function formatAllowance(a: bigint, decimals?: number) {
  if (a === 0n) return "0";
  if (isUnlimitedAllowance(a)) return "Unlimited";
  const d = typeof decimals === "number" ? decimals : 18;

  const val = formatUnits(a, d);
  const num = Number(val);

  if (!Number.isFinite(num)) return val;
  if (num >= 1000) return `${Math.round(num)}+`;
  if (num >= 10) return `${num.toFixed(2)}`;
  if (num >= 1) return `${num.toFixed(4)}`;
  return `${num.toFixed(6)}`;
}

function getTokenFields(row: TokenBalanceRow) {
  const tokenObj = row?.token ?? row;
  const address =
    tokenObj?.address ??
    tokenObj?.address_hash ??
    tokenObj?.contract_address ??
    tokenObj?.token_address;

  const symbol = tokenObj?.symbol ?? tokenObj?.token_symbol ?? "TOKEN";
  const decimalsRaw = tokenObj?.decimals ?? tokenObj?.token_decimals;
  const decimals =
    typeof decimalsRaw === "number" ? decimalsRaw : parseInt(decimalsRaw ?? "18", 10);

  return {
    tokenAddress: address as `0x${string}` | undefined,
    symbol: String(symbol),
    decimals: Number.isFinite(decimals) ? decimals : 18,
  };
}

async function fetchTokenBalances(owner: `0x${string}`, maxTokens: number) {
  const url = `https://base.blockscout.com/api/v2/addresses/${owner}/token-balances`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Blockscout error: ${res.status}`);
  const data = await res.json();
  const items: TokenBalanceRow[] = Array.isArray(data) ? data : (data?.items ?? []);
  return items.slice(0, maxTokens);
}

async function readAllowance(
  token: `0x${string}`,
  owner: `0x${string}`,
  spender: `0x${string}`
) {
  try {
    return (await publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "allowance",
      args: [owner, spender],
    })) as bigint;
  } catch {
    return 0n;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>
) {
  const out: R[] = [];
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const owner = body?.owner as `0x${string}` | undefined;
    const isPro = Boolean(body?.isPro);

    if (!owner || !owner.startsWith("0x")) {
      return NextResponse.json({ error: "Invalid owner" }, { status: 400 });
    }

    const spenders = isPro ? BASE_SPENDERS_PRO : BASE_SPENDERS_FREE;
    const maxTokens = isPro ? 25 : 10;

    const balances = await fetchTokenBalances(owner, maxTokens);

    const tokenList = balances
      .map(getTokenFields)
      .filter((t) => t.tokenAddress && (t.tokenAddress as string).startsWith("0x")) as Array<{
      tokenAddress: `0x${string}`;
      symbol: string;
      decimals: number;
    }>;

    const resultsNested = await mapWithConcurrency(tokenList, 4, async (token) => {
      const rows = await mapWithConcurrency(spenders, 6, async (sp) => {
        const allowance = await readAllowance(token.tokenAddress, owner, sp.address);
        if (allowance === 0n) return null;

        const unlimited = isUnlimitedAllowance(allowance);
        const risk: RiskLevel = unlimited ? "red" : "orange";
        const reason = unlimited
          ? "Unlimited approval — spender could drain funds if compromised."
          : "Active approval — revoke if you no longer use this spender.";

        return {
          tokenSymbol: token.symbol,
          tokenAddress: token.tokenAddress,
          spenderName: sp.name,
          spenderAddress: sp.address,
          allowanceLabel: formatAllowance(allowance, token.decimals),
          risk,
          reason,
        } as ScanItem;
      });

      return rows.filter(Boolean) as ScanItem[];
    });

    const flat = resultsNested.flat();
    flat.sort((a, b) => (a.risk === b.risk ? 0 : a.risk === "red" ? -1 : 1));

    return NextResponse.json({ items: flat });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message ?? e ?? "Unknown error") },
      { status: 500 }
    );
  }
}
