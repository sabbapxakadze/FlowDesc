import { useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAskInfo } from "../api/ask";
import { AskContext, type AskContextValue } from "./ask-context";

export function useAsk(): AskContextValue {
  const ctx = useContext(AskContext);
  if (!ctx) throw new Error("useAsk must be used within AskProvider");
  return ctx;
}

/** True only when the server says Ask is on. Until it has answered, and if it cannot be asked, Ask is hidden: a feature that may be off is not shown. */
export function useAskEnabled(): boolean {
  const info = useQuery({ queryKey: ["ask", "info"], queryFn: fetchAskInfo, staleTime: 5 * 60_000, retry: false });
  return info.data?.enabled === true;
}
