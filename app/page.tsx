"use client";

import { useEffect, useMemo, useState } from "react";
import { Wallet } from "@coinbase/onchainkit/wallet";
import { useMiniKit } from "@coinbase/onchainkit/minikit";
import {
  useAccount,
  usePublicClient,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import styles from "./page.module.css";

import { DEFAULT_CHAIN_IDS, CHAINS, type SupportedChainId } from "../lib/chains";
import { scanApprovals, type UserSpender } from "../lib/scanApprovals";
import type { ScanItem, RiskLevel } from "../lib/scanApprovals";

const HOSTED_CHECKOUT_URL =
  "https://commerce.coinbase.com/checkout/e3e47a82-3278-49ab-8a6c-537d6c703227";

const erc20ApproveAbi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [], // some tokens return nothing, some return bool
  },
] as const;

export default function Home() {
  const { setMiniAppReady, isMiniAppReady } = useMiniKit();
  const { address, isConnected } = useAccount();

  const publicClient = usePublicClient();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState<ScanItem[]>([]);
  const [lastScan, setLastScan] = useState<string | null>(null);

  // MVP: Pro unlock stored locally (manual). We'll secure later with webhook verification.
  const [isPro, setIsPro] = useState(false);

  // Multi-chain MVP
  const [selectedChains, setSelectedChains] =
    useState<SupportedChainId[]>(DEFAULT_CHAIN_IDS);

  // Custom spenders (makes it useful immediately)
  const [userSpenders, setUserSpenders] = useState<UserSpender[]>([]);
  const [spenderInput, setSpenderInput] = useState(""); // "Name,0x..."

  const [revokingKey, setRevokingKey] = useState<string | null>(null);

  // UX toggles
  const [riskyOnly, setRiskyOnly] = useState(true);

  useEffect(() => {
    if (!isMiniAppReady) setMiniAppReady();
  }, [setMiniAppReady, isMiniAppReady]);

  // Load local settings
  useEffect(() => {
    const pro = localStorage.getItem("revokeRadarPro");
    if (pro === "true") setIsPro(true);

    const savedChains = localStorage.getItem("revokeRadarChains");
    if (savedChains) {
      try {
        const parsed = JSON.parse(savedChains) as SupportedChainId[];
        if (Array.isArray(parsed) && parsed.length) setSelectedChains(parsed);
      } catch {}
    }

    const savedSpenders = localStorage.getItem("revokeRadarSpenders");
    if (savedSpenders) {
      try {
        const parsed = JSON.parse(savedSpenders) as UserSpender[];
        if (Array.isArray(parsed)) setUserSpenders(parsed);
      } catch {}
    }

    const savedRiskyOnly = localStorage.getItem("revokeRadarRiskyOnly");
    if (savedRiskyOnly === "false") setRiskyOnly(false);
  }, []);

  // Persist chains/spenders/toggles
  useEffect(() => {
    localStorage.setItem("revokeRadarChains", JSON.stringify(selectedChains));
  }, [selectedChains]);

  useEffect(() => {
    localStorage.setItem("revokeRadarSpenders", JSON.stringify(userSpenders));
  }, [userSpenders]);

  useEffect(() => {
    localStorage.setItem("revokeRadarRiskyOnly", riskyOnly ? "true" : "false");
  }, [riskyOnly]);

  const shortAddress = useMemo(() => {
    if (!address) return "";
    return `${address.slice(0, 6)}…${address.slice(-4)}`;
  }, [address]);

  function getNowLabel() {
    const d = new Date();
    return d.toLocaleString();
  }

  async function runScan() {
    if (!isConnected || !address) return;

    if (!selectedChains.length) {
      alert("Select at least one chain to scan.");
      return;
    }

    setIsScanning(true);
    setResults([]);

    try {
      const items = await scanApprovals({
        owner: address as `0x${string}`,
        chainIds: selectedChains,
        isPro,
        userSpenders,
      });

      setResults(items);
      setLastScan(getNowLabel());
    } catch (e: any) {
      console.error(e);
      setLastScan(`Scan failed: ${String(e?.message ?? e)}`);
    } finally {
      setIsScanning(false);
    }
  }

  async function revokeApproval(item: ScanItem) {
    if (!isConnected || !address) return;

    const ok = confirm(
      `Revoke approval?\n\nChain: ${item.chainName}\nToken: ${item.tokenSymbol}\nSpender: ${item.spenderName}\n\nThis will set allowance to 0.`
    );
    if (!ok) return;

    const key = `${item.chainId}-${item.tokenAddress}-${item.spenderAddress}`;
    setRevokingKey(key);

    try {
      // switch to the chain where this approval lives
      await switchChainAsync({ chainId: item.chainId });

      const hash = await writeContractAsync({
        abi: erc20ApproveAbi,
        address: item.tokenAddress,
        functionName: "approve",
        args: [item.spenderAddress, 0n],
      });

      // wait to be mined (best effort)
      try {
        if (publicClient) {
          await publicClient.waitForTransactionReceipt({ hash });
        }
      } catch {}

      // refresh
      await runScan();
    } catch (e) {
      console.error(e);
      alert("Revoke failed or was rejected. Please confirm in your wallet.");
    } finally {
      setRevokingKey(null);
    }
  }

  function toggleChain(id: SupportedChainId, checked: boolean) {
    setSelectedChains((prev) =>
      checked ? Array.from(new Set([...prev, id])) : prev.filter((x) => x !== id)
    );
  }

  function addSpender() {
    const [nameRaw, addrRaw] = spenderInput.split(",").map((s) => s.trim());
    const name = nameRaw?.slice(0, 40) ?? "";
    const addr = addrRaw ?? "";

    if (!name || !addr || !addr.startsWith("0x") || addr.length < 10) {
      alert('Use: "Name,0xAddress"');
      return;
    }

    setUserSpenders((prev) => [
      ...prev,
      { name, address: addr as `0x${string}` },
    ]);
    setSpenderInput("");
  }

  function removeSpender(address: `0x${string}`) {
    setUserSpenders((prev) => prev.filter((s) => s.address !== address));
  }

  const visibleResults = riskyOnly
    ? results.filter((r) => r.risk !== "green")
    : results;

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
        <section className={styles.card}>
          <h2 className={styles.cardTitle}>Approval Scan</h2>
          <p className={styles.cardText}>
            We scan token approvals (allowances) across multiple chains and flag
            risky permissions with a traffic-light system.
          </p>

          {/* Chain selection (top in scan-card) */}
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
              Chains
            </div>

            <div
              style={{
                display: "flex",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              {DEFAULT_CHAIN_IDS.map((id) => (
                <label
                  key={id}
                  style={{
                    fontSize: 13,
                    display: "flex",
                    gap: 6,
                    alignItems: "center",
                    userSelect: "none",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedChains.includes(id)}
                    onChange={(e) => toggleChain(id, e.target.checked)}
                  />
                  {CHAINS[id].name}
                </label>
              ))}
            </div>
          </div>

          {/* Custom spender input */}
          <div style={{ marginTop: 12 }}>
            <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6 }}>
              Custom spenders (optional)
            </div>

            <div
              style={{
                display: "flex",
                gap: 8,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <input
                value={spenderInput}
                onChange={(e) => setSpenderInput(e.target.value)}
                placeholder='Add spender: "Uniswap Router,0x..."'
                style={{
                  padding: 10,
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.12)",
                  minWidth: 280,
                  background: "transparent",
                  color: "inherit",
                  outline: "none",
                }}
              />
              <button
                className={styles.secondaryButton}
                onClick={addSpender}
                type="button"
              >
                Add
              </button>

              {userSpenders.length > 0 && (
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Scanning {userSpenders.length} custom spender(s)
                </div>
              )}
            </div>

            {userSpenders.length > 0 && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                {userSpenders.map((s) => (
                  <span
                    key={s.address}
                    style={{
                      fontSize: 12,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(255,255,255,0.12)",
                      display: "inline-flex",
                      gap: 8,
                      alignItems: "center",
                    }}
                    title={s.address}
                  >
                    {s.name}
                    <button
                      className={styles.ghostButton}
                      onClick={() => removeSpender(s.address)}
                      type="button"
                      title="Remove"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className={styles.actions} style={{ marginTop: 12 }}>
            <button
              className={styles.primaryButton}
              onClick={runScan}
              disabled={!isConnected || isScanning || selectedChains.length === 0}
              title={
                !isConnected
                  ? "Please connect your wallet first"
                  : selectedChains.length === 0
                  ? "Select at least one chain"
                  : "Start scan"
              }
              type="button"
            >
              {isScanning
                ? "Scanning…"
                : isPro
                ? "Scan Approvals (Pro)"
                : "Scan Approvals"}
            </button>

            <div className={styles.meta}>
              {lastScan ? (
                <span>Last scan: {lastScan}</span>
              ) : (
                <span>No scan yet</span>
              )}
              <span style={{ marginLeft: 10, opacity: 0.7 }}>
                Coverage: {selectedChains.length} chain(s) •{" "}
                {isPro ? "Deep" : "Basic"} scan
              </span>
            </div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.resultsHeader}>
            <h2 className={styles.cardTitle}>Results</h2>

            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <div className={styles.legend}>
                <LegendDot risk="green" label="Good" />
                <LegendDot risk="orange" label="Meh" />
                <LegendDot risk="red" label="Risky" />
              </div>

              <button
                className={styles.ghostButton}
                onClick={() => setRiskyOnly((v) => !v)}
                type="button"
                title="Toggle safe rows"
              >
                {riskyOnly ? "Show All" : "Show Risky Only"}
              </button>
            </div>
          </div>

          {visibleResults.length === 0 ? (
            <div className={styles.empty}>
              {isScanning
                ? "Scanning approvals…"
                : riskyOnly
                ? "No risky approvals found. You're clean ✅ (Try Show All or add a custom spender.)"
                : "No approvals found for the selected coverage."}
            </div>
          ) : (
            <ul className={styles.resultsList}>
              {visibleResults.map((item, idx) => {
                const key = `${item.chainId}-${item.tokenAddress}-${item.spenderAddress}`;
                return (
                  <li key={`${key}-${idx}`} className={styles.resultRow}>
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

                        <div style={{ fontSize: 12, opacity: 0.75, marginTop: 4 }}>
                          Chain: <b>{item.chainName}</b>
                        </div>
                      </div>

                      <div className={styles.reason}>{item.reason}</div>

                      <div className={styles.rowActions}>
                        <button
                          className={styles.secondaryButton}
                          onClick={() => revokeApproval(item)}
                          disabled={!isConnected || revokingKey === key}
                          title="Revoke this approval (sets allowance to 0)"
                          type="button"
                        >
                          {revokingKey === key ? "Revoking…" : "Revoke"}
                        </button>

                        <button
                          className={styles.ghostButton}
                          onClick={() => navigator.clipboard.writeText(item.spenderAddress)}
                          title="Copy spender address"
                          type="button"
                        >
                          Copy spender
                        </button>

                        <button
                          className={styles.ghostButton}
                          onClick={() => navigator.clipboard.writeText(item.tokenAddress)}
                          title="Copy token address"
                          type="button"
                        >
                          Copy token
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          {/* PRO UNLOCK (FAST MVP) */}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            {isPro ? (
              <div style={{ fontSize: 13, opacity: 0.9 }}>
                ✅ Pro unlocked — Deep Scan enabled.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 13, opacity: 0.85 }}>
                  Want a deeper scan? Unlock Pro for <b>$3</b>.
                </div>

                <button
                  className={styles.primaryButton}
                  onClick={() => window.open(HOSTED_CHECKOUT_URL, "_blank")}
                  title="Opens Coinbase Commerce checkout"
                  type="button"
                >
                  Unlock Pro ($3)
                </button>

                <button
                  className={styles.ghostButton}
                  onClick={() => {
                    // MVP unlock (manual). We'll secure later with webhook verification.
                    localStorage.setItem("revokeRadarPro", "true");
                    setIsPro(true);
                  }}
                  title="After you paid, tap to unlock Pro (MVP)"
                  type="button"
                >
                  I already paid
                </button>

                <div style={{ fontSize: 12, opacity: 0.7 }}>
                  MVP note: Pro unlock is manual for now. Auto-verify via webhook comes next.
                </div>
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

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function RiskDot({ risk }: { risk: RiskLevel }) {
  const cls =
    risk === "green"
      ? styles.dotGreen
      : risk === "orange"
      ? styles.dotOrange
      : styles.dotRed;
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
