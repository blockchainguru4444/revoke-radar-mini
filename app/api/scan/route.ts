// app/api/scan/route.ts
import { NextResponse } from "next/server";
import { createPublicClient, http, formatUnits, type Address } from "viem";
import { base } from "viem/chains";
import { BASE_SPENDERS_FREE, BASE_SPENDERS_PRO, type Spender } from "@/lib/spenders";

export const runtime = "nodejs";

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

type ScanRequestBody = {
  owner: `0x${string}`;
  isPro?: boolean;
};

type BlockscoutToken = {
  address?: string;
  address_hash?: string;
  contract_address?: string;
  token_address?: string;
  symbol?: string;
  token_symbol?: string;
  decimals?: number | string;
  token_decimals?: number | string;
};

type BlockscoutBalanceRow = {
  token?: BlockscoutToken;
} & BlockscoutToken;

type BlockscoutResponse = {
  items?: BlockscoutBalanceRow[];
};

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

const UNLIMITED_THRESHOLD = 1n << 255n;

function isUnlimitedAllowance(a: bigint) {
  return a >= UNLIMITED_THRESHOLD;
}

function safeParseDecimals(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return 18;
}

function formatAllowance(a: bigint, decimals: number) {
  if (a === 0n) return "0";
  if (isUnlimitedAllowance(a)) return "Unlimited";
  const val = formatUnits(a, decimals);
  const num = Number(val);

  if (!Number.isFinite(num)) return val;
  if (num >= 1000) return `${Math.round(num)}+`;
  if (num >= 10) return num.toFixed(2);
  if (num >= 1) return num.toFixed(4);
  return num.toFixed(6);
}

function getTokenFields(row: BlockscoutBalanceRow): {
  tokenAddress?: `0x${string}`;
  symbol: string;
  decimals: number;
} {
  const tokenObj = row.token ?? row;

  const addr =
    tokenObj.address ??
    tokenObj.address_hash ??
    tokenObj.contract_address ??
    tokenObj.token_address;

  const symbol = String(tokenObj.symbol ?? tokenObj.token_symbol ?? "TOKEN");
  const decimals = safeParseDecimals(tokenObj.decimals ?? tokenObj.token_decimals);

  const tokenAddress =
    typeof addr === "string" && addr.startsWith("0x") ? (addr as `0x${string}`) : undefined;

  return { tokenAddress, symbol, decimals };
}

async function fetchTokenBalances(owner: `0x${string}`, maxTokens: number): Promise<BlockscoutBalanceRow[]> {
  const url = `https://base.blockscout.com/api/v2/addresses/${owner}/token-balances`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Blockscout error: ${res.status}`);

  const raw: unknown = await res.json();

  if (Array.isArray(raw)) return (raw as BlockscoutBalanceRow[]).slice(0, maxTokens);

  if (typeof raw === "object" && raw !== null) {
    const data = raw as BlockscoutResponse;
    const items = Array.isArray(data.items) ? data.items : [];
    return items.slice(0, maxTokens);
  }

  return [];
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>
): Promise<R[]> {
  const out: R[] = new Array(items.length);
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
  const t0 = Date.now();

  let calls = 0;
  let errors = 0;

  try {
    const bodyUnknown: unknown = await req.json();
    const body = bodyUnknown as Partial<ScanRequestBody>;

    const owner = body.owner;
    const isPro = Boolean(body.isPro);

    if (!owner || typeof owner !== "string" || !owner.startsWith("0x")) {
      return NextResponse.json(
        {
          items: [],
          meta: { tokensChecked: 0, spendersChecked: 0, calls: 0, errors: 0, durationMs: Date.now() - t0 },
          error: "Invalid owner",
        },
        { status: 400 }
      );
    }

    const spenders: Spender[] = isPro ? BASE_SPENDERS_PRO : BASE_SPENDERS_FREE;
    const maxTokens = isPro ? 40 : 15;

    const balances = await fetchTokenBalances(owner, maxTokens);

    const tokenList = balances
      .map(getTokenFields)
      .filter(
        (t): t is { tokenAddress: `0x${string}`; symbol: string; decimals: number } => Boolean(t.tokenAddress)
      );

    const tokensChecked = tokenList.length;
    const spendersChecked = spenders.length;

    async function readAllowance(token: Address, o: Address, spender: Address): Promise<bigint> {
      try {
        calls += 1;
        const a = await publicClient.readContract({
          address: token,
          abi: erc20Abi,
          functionName: "allowance",
          args: [o, spender],
        });
        return a as bigint;
      } catch {
        errors += 1;
        return 0n;
      }
    }

    const resultsNested = await mapWithConcurrency(tokenList, 4, async (token) => {
      const rows = await mapWithConcurrency(spenders, 6, async (sp) => {
        const allowance = await readAllowance(token.tokenAddress as Address, owner as Address, sp.address as Address);
        if (allowance === 0n) return null;

        const unlimited = isUnlimitedAllowance(allowance);
        const risk: RiskLevel = unlimited ? "red" : "orange";
        const reason = unlimited
          ? "Unlimited approval — spender could drain funds if compromised."
          : "Active approval — revoke if you no longer use this spender.";

        const item: ScanItem = {
          tokenSymbol: token.symbol,
          tokenAddress: token.tokenAddress,
          spenderName: sp.name,
          spenderAddress: sp.address,
          allowanceLabel: formatAllowance(allowance, token.decimals),
          risk,
          reason,
        };
        return item;
      });

      return rows.filter((x): x is ScanItem => x !== null);
    });

    const items = resultsNested.flat();

    const order: Record<RiskLevel, number> = { red: 0, orange: 1, green: 2 };
    items.sort((a, b) => order[a.risk] - order[b.risk]);

    const durationMs = Date.now() - t0;

    return NextResponse.json({
      items,
      meta: {
        tokensChecked,
        spendersChecked,
        calls,
        errors,
        durationMs,
      },
    });
  } catch (e) {
    const durationMs = Date.now() - t0;
    return NextResponse.json(
      {
        items: [],
        meta: { tokensChecked: 0, spendersChecked: 0, calls, errors: errors + 1, durationMs },
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
