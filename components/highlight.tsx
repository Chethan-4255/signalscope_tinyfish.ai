import { termMatches } from "../lib/answerability";
import { normalized } from "../lib/text";

/** Highlights query terms (with crude prefix stemming) inside a text run. */
export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (!text) return null;
  const parts = text.split(/(\s+)/);
  return (
    <>
      {parts.map((p, i) => {
        const n = normalized(p);
        const hit = n && terms.some((t) => termMatches(t, n));
        return hit ? <mark key={i}>{p}</mark> : <span key={i}>{p}</span>;
      })}
    </>
  );
}
