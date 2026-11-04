import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { askRequestSchema, type AskLimits } from "@flowdesc/contracts";
import { ApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth/useAuth";
import { postAsk } from "../api/ask";
import { AskContext, type AskMessage } from "./ask-context";

/** What a person reads when something unexpected goes wrong; the server's own friendly messages (limits, resting) are shown as they are. */
const GENERIC_PROBLEM = "Ask could not answer right now. Please try again in a moment.";

export function AskProvider({ children }: { children: ReactNode }) {
  const { organization } = useAuth();
  const organizationId = organization?.id;
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [limits, setLimits] = useState<AskLimits | null>(null);
  const nextId = useRef(1);
  // A second send before the first is answered is refused here too (the server also allows one at a time per person).
  const running = useRef(false);

  // `Omit` on a union keeps only the fields every member shares, so the id is removed from each member separately.
  const add = useCallback((message: AskMessage extends infer M ? (M extends AskMessage ? Omit<M, "id"> : never) : never) => {
    setMessages((current) => [...current, { ...message, id: nextId.current++ } as AskMessage]);
  }, []);

  const send = useCallback(
    async (raw: string) => {
      if (running.current || !organizationId) return;
      const parsed = askRequestSchema.safeParse({ question: raw });
      if (!parsed.success) return;
      running.current = true;
      setPending(true);
      add({ kind: "question", text: parsed.data.question });
      try {
        const result = await postAsk(organizationId, parsed.data.question);
        add({ kind: "answer", text: result.answer, sources: result.sources });
        setLimits(result.limits);
      } catch (error) {
        add({ kind: "problem", text: error instanceof ApiError ? error.message : GENERIC_PROBLEM });
      } finally {
        running.current = false;
        setPending(false);
      }
    },
    [add, organizationId],
  );

  const clear = useCallback(() => {
    if (running.current) return;
    setMessages([]);
  }, []);

  const questionsAsked = messages.filter((m) => m.kind === "question").length;
  const value = useMemo(
    () => ({ open, setOpen, messages, pending, limits, questionsAsked, send, clear }),
    [open, messages, pending, limits, questionsAsked, send, clear],
  );
  return <AskContext.Provider value={value}>{children}</AskContext.Provider>;
}
