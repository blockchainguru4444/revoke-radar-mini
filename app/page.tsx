"use client";

import { useEffect, useMemo, useState } from "react";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import { Checkout, CheckoutButton, CheckoutStatus } from "@coinbase/onchainkit/checkout";
import { useAccount } from "wagmi";
import styles from "./page.module.css";

import {
  loadCustomSpenders,
  saveCustomSpenders,
  loadCustomTokens,
  saveCustomTokens,
  isAddress,
  type CustomSpender,
  type CustomToken,
} from "@/lib/custom";
import type { ScanItem, RiskLevel } from "@/lib/scanTypes";

const PRO_PRODUCT_ID = "e3e47a82-3278-49ab-8a6c-537d6c703227";

// Keep MVP simple: UI-only chain selection (backend must support it)
const DEFAULT_CHAIN_IDS = [8453, 1, 10, 42161] as const;
const CHAIN_LABEL: Record<number, string> = {
  8453: "Base",
  1: "Ethereum",
  10: "Optimism",
  42161: "Arbitrum",
};

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { address, isConnected } = useAccount();

  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<ScanItem[]>([]);
  const [lastScan, setLastScan] = useState<string | null>(null);
  const [showRiskyOnly, setShowRiskyOnly] = useState(false);

  // MVP: Pro unlock stored locally (later: webhook verification)
  const [isPro, setIsPro] = useState(false);

  // Chains
  const [chainIds, setChainIds] = useState<number[]>([...DEFAULT_CHAIN_IDS]);

  // Custom Spenders
  const [customSpenders, setCustomSpenders] = useState<CustomSpender[]>([]);
  const [spenderInput, setSpenderInput] = useState("");
  const [spenderNameInput, setSpenderNameInput] = useState("");

  // Custom Tokens (NEW)
  const [customTokens, setCustomTokens] = useState<CustomToken[]>([]);
  const [tokenInput, setTokenInput] = useState("");
  const [tokenLabelInput, setTokenLabelInput] = useState("");

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  useEffect(() => {
    const v = localStorage.getItem("revokeRadarPro");
    if (v === "true") setIsPro(true);

    setCustomSpenders(loadCustomSpenders());
    setCustomTokens(loadCustomTokens());
  }, []);

  const shortAddress = useMemo(() => {
    if (!address) return "";
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }, [address]);

  function nowLabel() {
    return new Date().toLocaleString();
  }

  function toggleChain(id: number) {
    setChainIds((prev) => {
      const has = prev.includes(id);
      const next = has ? prev.filter((x) => x !== id) : [...prev, id];
      return next.length ? next : prev; // never allow empty
    });
  }

  function addCustomSpender() {
    const s = spenderInput.trim();
    const n = spenderNameInput.trim() || "Custom";
    if (!isAddress(s)) return alert("Please paste a valid 0x spender address.");
    const next = [...customSpenders, { name: n.slice(0, 32), address: s }];
    // unique by address
    const uniq = uniqueBy(next, (x) => x.address.toLowerCase());
    setCustomSpenders(uniq);
    saveCustomSpenders(uniq);
    setSpenderInput("");
    setSpenderNameInput("");
  }

  function removeCustomSpender(addr: `0x${string}`) {
    const next = customSpenders.filter((x) => x.address.toLowerCase() !== addr.toLowerCase());
    setCustomSpenders(next);
    saveCustomSpenders(next);
  }

  function addCustomToken() {
    const a = tokenInput.trim();
    const lbl = (tokenLabelInput.trim() || "Custom Token").slice(0, 32);
    if (!isAddress(a)) return alert("Please paste a valid 0x token contract address.");
    const next = [...customTokens, { address: a, label: lbl }];
    const uniq = uniqueBy(next, (x) => x.address.toLowerCase());
    setCustomTokens(uniq);
    saveCustomTokens(uniq);
    setTokenInput("");
    setTokenLabelInput("");
  }

  function removeCustomToken(addr: `0x${string}`) {
    const next = customTokens.filter((x) => x.address.toLowerCase() !== addr.toLowerCase());
    setCustomTokens(next);
    saveCustomTokens(next);
  }

  async function runScan() {
    if (!isConnected || !address) return;

    setIsScanning(true);
    setResults([]);

    try {
      const res = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          owner: address,
          isPro,
          chainIds,
          customSpenders,
          customTokens,
        }),
      });

      if (!res.ok) throw new Error(`Scan failed: ${res.status}`);
      const data = (await res.json()) as { items?: ScanItem[] };

      setResults(Array.isArray(data.items) ? data.items : []);
      setLastScan(nowLabel());
    } catch (e: any) {
      console.error(e);
      alert("Scan failed. Check /api/scan logs on Vercel or your terminal.");
    } finally {
      setIsScanning(false);
    }
  }

  const filtered = useMemo(() => {
    const base = results;
    if (!showRiskyOnly) return base;
    return base.filter((x) => x.risk !== "green");
  }, [results, showRiskyOnly]);

  const coverageLabel = useMemo(() => {
    const names = chainIds.map((id) => CHAIN_LABEL[id] || `Chain ${id}`);
    return `${names.length} chain(s)`;
  }, [chainIds]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logoDot} />
          <div>
            <div className={styles.appName}>Revoke Radar</div>
            <div className={styles.tagline}>Scan approvals. Spot risk.</div>
          </div>
        </div>

        <div className={styles.walletArea}>
          <Wallet />
          <div className={styles.walletStatus}>
            {isConnected ? (
              <span className={styles.connected}>
                Connected: <b>{shortAddress}</b>
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
            We scan token approvals (allowances) and flag risky permissions with a traffic-light system.
          </p>

          {/* Chains */}
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>Chains</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {DEFAULT_CHAIN_IDS.map((id) => (
                <label key={id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={chainIds.includes(id)}
                    onChange={() => toggleChain(id)}
                  />
                  {CHAIN_LABEL[id]}
                </label>
              ))}
            </div>
          </div>

          {/* Custom spenders */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>Custom spenders (optional)</div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={spenderNameInput}
                onChange={(e) => setSpenderNameInput(e.target.value)}
                placeholder="Name (e.g. Uniswap Router)"
                style={inputStyle}
              />
              <input
                value={spenderInput}
                onChange={(e) => setSpenderInput(e.target.value)}
                placeholder="Spender 0x…"
                style={{ ...inputStyle, minWidth: 320 }}
              />
              <button className={styles.secondaryButton} onClick={addCustomSpender}>
                Add
              </button>
            </div>

            {customSpenders.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {customSpenders.map((s) => (
                  <Chip
                    key={s.address}
                    label={`${s.name}: ${short(s.address)}`}
                    onRemove={() => removeCustomSpender(s.address)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Custom tokens */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
              Custom tokens (recommended)
            </div>
            <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 8 }}>
              Paste token contract addresses from Etherscan/Blockscout. This finds approvals even if you no longer hold the token.
            </div>

            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <input
                value={tokenLabelInput}
                onChange={(e) => setTokenLabelInput(e.target.value)}
                placeholder="Label (e.g. USDC)"
                style={inputStyle}
              />
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Token contract 0x…"
                style={{ ...inputStyle, minWidth: 320 }}
              />
              <button className={styles.secondaryButton} onClick={addCustomToken}>
                Add
              </button>
            </div>

            {customTokens.length > 0 && (
              <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                {customTokens.map((t) => (
                  <Chip
                    key={t.address}
                    label={`${t.label}: ${short(t.address)}`}
                    onRemove={() => removeCustomToken(t.address)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Scan action */}
          <div className={styles.actions} style={{ marginTop: 16 }}>
            <button
              className={styles.primaryButton}
              onClick={runScan}
              disabled={!isConnected || isScanning}
              title={!isConnected ? "Please connect your wallet first" : "Start scan"}
            >
              {isScanning ? "Scanning…" : isPro ? "Scan Approvals (Pro)" : "Scan Approvals"}
            </button>

            <div className={styles.meta}>
              {lastScan ? (
                <span>
                  Last scan: {lastScan} &nbsp;&nbsp; Coverage: {coverageLabel} {isPro ? "• Deep scan" : ""}
                </span>
              ) : (
                <span>Ready.</span>
              )}
            </div>
          </div>
        </section>

        {/* RESULTS */}
        <section className={styles.card}>
          <div className={styles.resultsHeader}>
            <h2 className={styles.cardTitle}>Results</h2>

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <div className={styles.legend}>
                <LegendDot risk="green" label="Good" />
                <LegendDot risk="orange" label="Meh" />
                <LegendDot risk="red" label="Risky" />
              </div>

              <button className={styles.secondaryButton} onClick={() => setShowRiskyOnly((v) => !v)}>
                {showRiskyOnly ? "Show All" : "Show Risky Only"}
              </button>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className={styles.empty}>
              {isScanning
                ? "Scanning approvals…"
                : "No approvals found for the selected coverage."}
            </div>
          ) : (
            <ul className={styles.resultsList}>
              {filtered.map((item, idx) => (
                <li key={`${item.chainId}-${item.tokenAddress}-${item.spenderAddress}-${idx}`} className={styles.resultRow}>
                  <div className={styles.riskCell}>
                    <RiskDot risk={item.risk} />
                  </div>

                  <div className={styles.resultMain}>
                    <div className={styles.resultTop}>
                      <div className={styles.tokenLine}>
                        <span className={styles.token}>
                          {item.tokenSymbol} <span style={{ opacity: 0.7, fontSize: 12 }}>({item.chainName})</span>
                        </span>
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
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* PRO UNLOCK */}
          <div style={{ marginTop: 14, display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            {isPro ? (
              <div style={{ fontSize: 13, opacity: 0.9 }}>✅ Pro unlocked — Deep Scan enabled.</div>
            ) : (
              <>
                <div style={{ fontSize: 13, opacity: 0.85 }}>
                  Want a deeper scan? Unlock Pro for <b>$3</b>.
                </div>

                <Checkout
                  productId={PRO_PRODUCT_ID}
                  onStatus={(status) => {
                    // MVP: unlock locally if payment succeeds
                    if (status?.statusName === "success") {
                      localStorage.setItem("revokeRadarPro", "true");
                      setIsPro(true);
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
      </main>

      <footer className={styles.footer}>
        MVP build • Multi-chain scan + revoke • Next: webhook verification + better spender database
      </footer>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 10,
  padding: "10px 12px",
  color: "inherit",
  outline: "none",
  fontSize: 13,
  minWidth: 220,
};

function uniqueBy<T>(arr: T[], key: (t: T) => string) {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const it of arr) {
    const k = key(it);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(it);
  }
  return out;
}

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function RiskDot({ risk }: { risk: RiskLevel }) {
  const cls =
    risk === "green" ? styles.dotGreen : risk === "orange" ? styles.dotOrange : styles.dotRed;
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

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: "6px 10px",
        borderRadius: 999,
        border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.04)",
        fontSize: 12,
      }}
    >
      <span style={{ opacity: 0.9 }}>{label}</span>
      <button
        onClick={onRemove}
        style={{
          background: "transparent",
          border: "none",
          color: "inherit",
          opacity: 0.7,
          cursor: "pointer",
          fontSize: 14,
          lineHeight: 1,
        }}
        title="Remove"
      >
        ×
      </button>
    </span>
  );
}
