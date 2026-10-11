import type { Locator } from "@playwright/test";
import { makePng } from "./png";

/** Delivers a picture file to a rich-text box the way a paste does: a paste event whose clipboard holds the file (ADR 0062, 0063). */
export async function pastePicture(box: Locator, name: string) {
  const base64 = makePng(48, 32).toString("base64");
  await box.evaluate(
    (el, { base64, name }) => {
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const data = new DataTransfer();
      data.items.add(new File([bytes], name, { type: "image/png" }));
      el.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: data,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { base64, name },
  );
}
