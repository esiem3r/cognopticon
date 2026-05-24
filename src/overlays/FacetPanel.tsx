import type { NodeFacet } from "../model/cognopticonNode";

export function FacetPanel({ facets }: { facets: NodeFacet[] }) {
  return (
    <div className="facet-grid">
      {facets.slice(0, 6).map((facet) => (
        <section key={facet.id} className="facet-panel">
          <h4>{facet.title}</h4>
          <p>{facet.summary ?? summarize(facet.data)}</p>
        </section>
      ))}
    </div>
  );
}

function summarize(data: unknown) {
  if (typeof data === "string") return data;
  if (Array.isArray(data)) return `${data.length} item(s)`;
  if (data && typeof data === "object") return Object.keys(data).slice(0, 4).join(" / ");
  return "No detail";
}
