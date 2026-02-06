"use client";

import { useEffect, useMemo, useState } from "react";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { Checkout, CheckoutButton, CheckoutStatus } from "@coinbase/onchainkit/checkout";
import { useAccount, useChainId } from "wagmi";
import styles from "./page.module.css";

const BASE_CHAIN_ID = 8453;
const PRO_PRODUCT_ID = "e3e47a82-3278-49ab-8a6c-537d6c703227";
const PRO_STORAGE_KEY = "revokeRadarPro";

type RiskLevel = "green" | "orange" | "red";

type ScanItem = {
  tokenSymbol: string;
  tokenAddress: `0x${string}`;
  spenderName: string;
  spenderAddress: `0x${string}`;
  allowanceLabel: string;
  risk: RiskLevel;
  reason: string;
};

type ScanMeta = {
  tokensChecked: number;
  spendersChecked: number;
  calls: number;
  errors: number;
  durationMs: number;
};

type ScanApiResponse =
  | ScanItem[]
  | {
      items: ScanItem[];
      meta?: ScanMeta;
    };

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();

  const [isPro, setIsPro] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [results, setResults] = useState<ScanItem[]>([]);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [scanMeta, setScanMeta] = useState<ScanMeta | null>(null);

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  useEffect(() => {
    const v = typeof window !== "undefined" ? localStorage.getItem(PRO_STORAGE_KEY) : null;
    if (v === "true") setIsPro(true);
  }, []);

  const isOnBase = chainId === BASE_CHAIN_ID;

  const shortAddress = useMemo(() => {
    if (!address) return "";
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }, [address]);

  function nowLabel() {
    return new Date().toLocaleString();
  }

  function normalizeScanResponse(data: ScanApiResponse): ScanItem[] {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray((data as { items: ScanItem[] }).items)) return (data as { items: ScanItem[] }).items;
    return [];
  }

  async function runScan(mode: "free" | "pro") {
    setScanError(null);
    setScanMeta(null);

    if (!isConnected || !address) {
      setScanError("Please connect your wallet first.");
      return;
    }
    if (!isOnBase) {
      setScanError("This MVP scans Base only. Please switch your wallet network to Base.");
      return;
    }
    if (mode === "pro" && !isPro) {
      setScanError("Pro is locked. Unlock Pro to run Deep Scan.");
      return;
    }

    setIsScanning(true);
    setResults([]);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: address,
          isPro: mode === "pro",
        }),
      });

      if (!res.ok) throw new Error(`Scan failed (${res.status})`);

      const json = (await res.json()) as ScanApiResponse;
      const items = normalizeScanResponse(json);

      const meta = !Array.isArray(json) ? (json.meta ?? null) : null;
      setScanMeta(meta);

      const order: Record<RiskLevel, number> = { red: 0, orange: 1, green: 2 };
      items.sort((a, b) => order[a.risk] - order[b.risk]);

      setResults(items);
      setLastScan(nowLabel());

      if (items.length === 0) {
        setScanError("No approvals found on Base for your wallet (or none matched our known spender list).");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Unknown error";
      setScanError(msg);
    } finally {
      setIsScanning(false);
    }
  }

  function clearResults() {
    setResults([]);
    setScanError(null);
    setLastScan(null);
    setScanMeta(null);
  }

  async function copyReport() {
    const lines: string[] = [];
    lines.push("Revoke Radar — Approval Report (Base)");
    if (address) lines.push(`Wallet: ${address}`);
    if (lastScan) lines.push(`Scanned: ${lastScan}`);
    if (scanMeta) {
      lines.push(
        `Coverage: ${scanMeta.tokensChecked} tokens × ${scanMeta.spendersChecked} spenders | calls=${scanMeta.calls} errors=${scanMeta.errors} time=${scanMeta.durationMs}ms`
      );
    }
    lines.push("");

    if (results.length === 0) {
      lines.push("No results.");
    } else {
      for (const r of results) {
        const riskLabel = r.risk === "red" ? "RISKY" : r.risk === "orange" ? "MEH" : "GOOD";
        lines.push(
          `[${riskLabel}] ${r.tokenSymbol} | Allowance: ${r.allowanceLabel} | Spender: ${r.spenderName} (${r.spenderAddress})`
        );
        lines.push(`Reason: ${r.reason}`);
        lines.push("");
      }
    }

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setScanError("Report copied to clipboard.");
      setTimeout(() => setScanError(null), 1800);
    } catch {
      setScanError("Could not copy. Your browser may block clipboard access.");
    }
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logoDot} />
          <div>
            <div className={styles.appName}>Revoke Radar</div>
            <div className={styles.tagline}>Scan approvals. Spot risk. Revoke smarter.</div>
          </div>
        </div>

        <div className={styles.walletArea}>
          <Wallet />
          <div className={styles.walletStatus}>
            {isConnected ? (
              <span className={styles.connected}>
                Connected: <b>{shortAddress}</b> • Network: <b>{isOnBase ? "Base" : `Wrong (${chainId ?? "?"})`}</b>
              </span>
            ) : (
              <span className={styles.disconnected}>Not connected</span>
            )}
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {/* SCAN CARD */}
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Approval Scan</h2>
          <p className={styles.cardText}>
            MVP is <b>Base-only</b>. We detect active ERC-20 approvals and label risk with a traffic light.
          </p>

          {(scanError || !isOnBase) && (
            <div
              style={{
                marginTop: 10,
                padding: "10px 12px",
                borderRadius: 12,
                background: "rgba(255,255,255,0.06)",
                fontSize: 13,
                lineHeight: 1.4,
              }}
            >
              {!isOnBase ? (
                <div>
                  <b>Network mismatch.</b> Please switch your wallet to <b>Base</b> to scan.
                </div>
              ) : (
                <div>{scanError}</div>
              )}
            </div>
          )}

          <div className={styles.actions} style={{ marginTop: 12 }}>
            <button
              className={styles.primaryButton}
              onClick={() => runScan("free")}
              disabled={!isConnected || !isOnBase || isScanning}
              title={!isConnected ? "Connect your wallet first" : !isOnBase ? "Switch to Base" : "Run scan"}
            >
              {isScanning ? "Scanning…" : "Scan Approvals (Free)"}
            </button>

            <button
              className={styles.secondaryButton}
              onClick={() => runScan("pro")}
              disabled={!isConnected || !isOnBase || isScanning || !isPro}
              title={!isPro ? "Unlock Pro to run Deep Scan" : "Run Deep Scan"}
              style={{ opacity: !isPro ? 0.55 : 1 }}
            >
              Deep Scan (Pro)
            </button>

            <button className={styles.ghostButton} onClick={copyReport} disabled={isScanning} title="Copy report">
              Copy report
            </button>

            <button className={styles.ghostButton} onClick={clearResults} disabled={isScanning} title="Clear results">
              Clear
            </button>

            <div className={styles.meta} style={{ marginLeft: "auto" }}>
              {lastScan ? <span>Last scan: {lastScan}</span> : <span>No scan yet</span>}
            </div>
          </div>

          {scanMeta && (
            <div style={{ marginTop: 10, fontSize: 12, opacity: 0.8 }}>
              Coverage: <b>{scanMeta.tokensChecked}</b> tokens × <b>{scanMeta.spendersChecked}</b> spenders • RPC calls:{" "}
              <b>{scanMeta.calls}</b> • Errors: <b>{scanMeta.errors}</b> • Time: <b>{Math.round(scanMeta.durationMs)}ms</b>
              {scanMeta.errors > 0 && <span style={{ marginLeft: 10 }}>⚠ Scan may be incomplete — try again.</span>}
            </div>
          )}

          <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            {isPro ? (
              <div style={{ fontSize: 13, opacity: 0.9 }}>✅ Pro unlocked — Deep Scan enabled (device-based MVP).</div>
            ) : (
              <>
                <div style={{ fontSize: 13, opacity: 0.85 }}>
                  Unlock <b>Pro</b> for a deeper scan: <b>$3</b>
                </div>

                <Checkout
                  productId={PRO_PRODUCT_ID}
                  onStatus={(status) => {
                    if (status?.statusName === "success") {
                      localStorage.setItem("revokeRadarPro", "true");
                      setIsPro(true);
                      setScanError("✅ Pro unlocked on this device.");
                      setTimeout(() => setScanError(null), 1800);
                    }
                  }}
                >
                  <CheckoutButton />
                  <CheckoutStatus />
                </Checkout>
              </>
            )}
          </div>
        </section>

        {/* RESULTS CARD */}
        <section className={styles.card}>
          <div className={styles.resultsHeader}>
            <h2 className={styles.cardTitle}>Results</h2>
            <div className={styles.legend}>
              <LegendDot risk="green" label="Good" />
              <LegendDot risk="orange" label="Meh" />
              <LegendDot risk="red" label="Risky" />
            </div>
          </div>

          {results.length === 0 ? (
            <div className={styles.empty}>
              {isScanning ? "Scanning approvals…" : isConnected ? "No results yet. Run a scan to see approvals on Base." : "Connect your wallet to start scanning."}
            </div>
          ) : (
            <ul className={styles.resultsList}>
              {results.map((item, idx) => (
                <li key={`${item.tokenAddress}-${item.spenderAddress}-${idx}`} className={styles.resultRow}>
                  <div className={styles.riskCell}>
                    <RiskDot risk={item.risk} />
                  </div>

                  <div className={styles.resultMain}>
                    <div className={styles.resultTop}>
                      <div className={styles.tokenLine}>
                        <span className={styles.token}>{item.tokenSymbol}</span>
                        <span className={styles.allowance}>{item.allowanceLabel}</span>
                      </div>

                      <div className={styles.spenderLine}>
                        <span className={styles.spenderName}>{item.spenderName}</span>
                        <span className={styles.mono}>{short(item.spenderAddress)}</span>
                      </div>
                    </div>

                    <div className={styles.reason}>{item.reason}</div>

                    <div className={styles.rowActions}>
                      <button className={styles.secondaryButton} disabled title="Coming next">
                        Revoke (next)
                      </button>

                      <button
                        className={styles.ghostButton}
                        onClick={() => navigator.clipboard.writeText(item.spenderAddress)}
                        title="Copy spender address"
                      >
                        Copy spender
                      </button>

                      <button
                        className={styles.ghostButton}
                        onClick={() => navigator.clipboard.writeText(item.tokenAddress)}
                        title="Copy token address"
                      >
                        Copy token
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          <div style={{ marginTop: 14, fontSize: 12, opacity: 0.75 }}>
            MVP: Base-only • Pro unlock is device-based (server verification next) • Revoke action coming next
          </div>
        </section>
      </main>

      <footer className={styles.footer}>Revoke Radar MVP • Base approvals scanner</footer>
    </div>
  );
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function RiskDot({ risk }: { risk: RiskLevel }) {
  const cls = risk === "green" ? styles.dotGreen : risk === "orange" ? styles.dotOrange : styles.dotRed;
  return <span className={`${styles.dot} ${cls}`} />;
}

function LegendDot({ risk, label }: { risk: RiskLevel; label: string }) {
  return (
    <span className={styles.legendItem}>
      <RiskDot risk={risk} />
      <span>{label}</span>
    </span>
  );
}
