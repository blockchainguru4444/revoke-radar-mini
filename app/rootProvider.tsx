"use client";

import { ReactNode } from "react";
import { base } from "wagmi/chains";
import { OnchainKitProvider } from "@coinbase/onchainkit";
import "@coinbase/onchainkit/styles.css";

export function RootProvider({ children }: { children: ReactNode }) {
  const apiKey =
    process.env.NEXT_PUBLIC_ONCHAINKIT_API_KEY ??
    process.env.NEXT_PUBLIC_CDP_API_KEY ??
    "";

  // Debug (nur kurz drin lassen, bis Checkout funktioniert)
  console.log("OnchainKit API key present?", Boolean(apiKey));

  return (
    <OnchainKitProvider
      apiKey={apiKey}
      chain={base}
      config={{
        appearance: { mode: "auto" },
        wallet: {
          // für lokale Tests stabiler als "smartWalletOnly"
          display: "classic",
          preference: "smartWalletOnly",
        },
      }}
      miniKit={{
        enabled: true,
        autoConnect: true,
        notificationProxyUrl: undefined,
      }}
    >
      {children}
    </OnchainKitProvider>
  );
}
