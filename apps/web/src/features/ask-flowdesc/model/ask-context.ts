import { createContext } from "react";
import type { AskLimits, AskSource } from "@flowdesc/contracts";

export type AskMessage =
  | { id: number; kind: "question"; text: string }
  | { id: number; kind: "answer"; text: string; sources: AskSource[] }
  | { id: number; kind: "problem"; text: string };

/** A chat is capped on screen so a very long one does not grow without end (the server has its own limits). */
export const MAX_QUESTIONS_PER_CHAT = 10;

export type AskContextValue = {
  open: boolean;
  setOpen: (open: boolean | ((current: boolean) => boolean)) => void;
  messages: AskMessage[];
  pending: boolean;
  /** What is left of the tightest limit, from the last answer; null before the first one. */
  limits: AskLimits | null;
  questionsAsked: number;
  send: (question: string) => Promise<void>;
  /** Forgets the chat (it was only ever in this page's memory). Not while a question is running. */
  clear: () => void;
};

/**
 * The chat lives above the panel, so closing the panel and opening it again shows the same conversation. It is kept in this page's
 * memory only: reloading the page, or signing out, ends it. Nothing is written to the browser's storage.
 */
export const AskContext = createContext<AskContextValue | null>(null);
