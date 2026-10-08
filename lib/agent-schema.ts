const text = { type: "string" };
const list = (items: unknown, maxItems: number) => ({
  type: "array",
  items,
  maxItems,
});
const object = (properties: Record<string, unknown>) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
});
export const auditOutputSchema = object({
  status: {
    type: "string",
    enum: ["readable", "blocked", "login_required", "unavailable"],
  },
  final_url: text,
  title: text,
  observations: list(
    object({ label: text, quote: text, source_url: text, interaction: text, importance: text }),
    6,
  ),
  barriers: list(text, 6),
  interactions: list(text, 6),
  strategy: text,
  recommendations: list(
    object({
      title: text,
      category: {
        type: "string",
        enum: ["Content", "AI readability", "Search intent", "Metadata"],
      },
      priority: { type: "string", enum: ["high", "medium", "low"] },
      effort: { type: "string", enum: ["small", "medium", "large"] },
      owner: { type: "string", enum: ["editor", "developer"] },
      evidence: object({
        source: { type: "string", enum: ["page", "competitor", "browser"] },
        quote: text,
      }),
      why: text,
      action: text,
      suggestedCopy: text,
      verification: text,
      assumptions: list(text, 5),
    }),
    4,
  ),
});
