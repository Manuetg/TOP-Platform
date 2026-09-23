import { Lightbulb } from "lucide-react";

export interface ContextRailBlock { title: string; description: string }

export function ContextRail({ title, blocks }: { title: string; blocks: readonly ContextRailBlock[] }) {
  if (!blocks.length) return null;
  return (
    <aside className="top-context-rail" aria-label={title}>
      <div className="top-context-rail__heading"><Lightbulb size={20} aria-hidden="true" /><h2>{title}</h2></div>
      {blocks.map((block) => <section className="top-surface top-context-rail__block" key={block.title}><h3>{block.title}</h3><p>{block.description}</p></section>)}
    </aside>
  );
}
