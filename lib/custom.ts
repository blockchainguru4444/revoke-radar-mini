export type CustomSpender = { name: string; address: `0x${string}` };
export type CustomToken = { address: `0x${string}`; label: string };

export function isAddress(v: string): v is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(v.trim());
}

export function loadCustomSpenders(): CustomSpender[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("rr_custom_spenders");
    const arr = raw ? (JSON.parse(raw) as Array<{ name?: string; address?: string }>) : [];
    return arr
      .filter((x) => x?.address && isAddress(x.address))
      .map((x) => ({
        name: (x.name || "Custom").trim().slice(0, 32),
        address: x.address!.trim() as `0x${string}`,
      }));
  } catch {
    return [];
  }
}

export function saveCustomSpenders(items: CustomSpender[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem("rr_custom_spenders", JSON.stringify(items));
}

export function loadCustomTokens(): CustomToken[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("rr_custom_tokens");
    const arr = raw ? (JSON.parse(raw) as Array<{ label?: string; address?: string }>) : [];
    return arr
      .filter((x) => x?.address && isAddress(x.address))
      .map((x) => ({
        label: (x.label || "Custom Token").trim().slice(0, 32),
        address: x.address!.trim() as `0x${string}`,
      }));
  } catch {
    return [];
  }
}

export function saveCustomTokens(items: CustomToken[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem("rr_custom_tokens", JSON.stringify(items));
}
