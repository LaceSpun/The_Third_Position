/* Contradiction Map — a deterministic (no physics-sim dependency) node map.
   Three concentric rings: domains (outer), structural families (middle),
   mechanisms (inner). Edge thickness/opacity encodes how many responses
   connect two nodes. Nodes are sized by how often they appear. */

function buildGraph(responses) {
  const enriched = responses.map((r) => ({ r, d: dilemmaById(r.dilemmaId) })).filter((x) => x.d);
  const domainCount = new Map();
  const familyCount = new Map();
  const mechCount = new Map();
  const domainMech = new Map(); // "domain|mech" -> count
  const mechFamily = new Map(); // "family|mech" -> count

  for (const { r, d } of enriched) {
    const mech = mechName(r);
    const mechLabel = mech.startsWith("OTHER:") ? mech.slice(6) : mechanismLabel(mech);
    domainCount.set(d.domain, (domainCount.get(d.domain) || 0) + 1);
    mechCount.set(mechLabel, (mechCount.get(mechLabel) || 0) + 1);
    if (d.family) familyCount.set(d.family, (familyCount.get(d.family) || 0) + 1);

    const dm = `${d.domain}|${mechLabel}`;
    domainMech.set(dm, (domainMech.get(dm) || 0) + 1);
    if (d.family) {
      const fm = `${d.family}|${mechLabel}`;
      mechFamily.set(fm, (mechFamily.get(fm) || 0) + 1);
    }
  }

  return { domainCount, familyCount, mechCount, domainMech, mechFamily, total: enriched.length };
}

function renderMap(svg, responses) {
  const graph = buildGraph(responses);
  const W = 900,
    H = 900,
    cx = W / 2,
    cy = H / 2;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.innerHTML = "";

  if (graph.total === 0) {
    const t = document.createElementNS("http://www.w3.org/2000/svg", "text");
    t.setAttribute("x", cx);
    t.setAttribute("y", cy);
    t.setAttribute("text-anchor", "middle");
    t.setAttribute("class", "map-empty");
    t.textContent = "No data yet. Answer a few contradictions first.";
    svg.appendChild(t);
    return;
  }

  const ns = "http://www.w3.org/2000/svg";
  function ring(items, radius) {
    const arr = [...items.entries()];
    const n = arr.length;
    const positions = new Map();
    arr.forEach(([key, count], i) => {
      const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
      positions.set(key, {
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
        count,
      });
    });
    return positions;
  }

  const domainPos = ring(graph.domainCount, 400);
  const familyPos = ring(graph.familyCount, 260);
  const mechPos = ring(graph.mechCount, 120);

  function drawEdge(p1, p2, weight, maxWeight, colorClass) {
    const line = document.createElementNS(ns, "line");
    line.setAttribute("x1", p1.x);
    line.setAttribute("y1", p1.y);
    line.setAttribute("x2", p2.x);
    line.setAttribute("y2", p2.y);
    line.setAttribute("class", `edge ${colorClass}`);
    line.setAttribute("stroke-width", 0.6 + (weight / maxWeight) * 3.5);
    line.setAttribute("opacity", 0.15 + (weight / maxWeight) * 0.55);
    svg.appendChild(line);
  }

  const maxDM = Math.max(1, ...graph.domainMech.values());
  for (const [key, weight] of graph.domainMech) {
    const [domain, mechLabel] = key.split("|");
    const p1 = domainPos.get(domain);
    const p2 = mechPos.get(mechLabel);
    if (p1 && p2) drawEdge(p1, p2, weight, maxDM, "edge-domain-mech");
  }
  const maxMF = Math.max(1, ...graph.mechFamily.values());
  for (const [key, weight] of graph.mechFamily) {
    const [family, mechLabel] = key.split("|");
    const p1 = familyPos.get(family);
    const p2 = mechPos.get(mechLabel);
    if (p1 && p2) drawEdge(p1, p2, weight, maxMF, "edge-mech-family");
  }

  function drawNodes(positions, className, maxCount) {
    for (const [key, p] of positions) {
      const r = 10 + (p.count / maxCount) * 22;
      const circle = document.createElementNS(ns, "circle");
      circle.setAttribute("cx", p.x);
      circle.setAttribute("cy", p.y);
      circle.setAttribute("r", r);
      circle.setAttribute("class", `node ${className}`);
      const title = document.createElementNS(ns, "title");
      title.textContent = `${key} (${p.count})`;
      circle.appendChild(title);
      svg.appendChild(circle);

      const label = document.createElementNS(ns, "text");
      label.setAttribute("x", p.x);
      label.setAttribute("y", p.y + r + 13);
      label.setAttribute("text-anchor", "middle");
      label.setAttribute("class", "node-label");
      label.textContent = key.length > 22 ? key.slice(0, 20) + "…" : key;
      svg.appendChild(label);
    }
  }

  const maxDomain = Math.max(1, ...graph.domainCount.values());
  const maxFamily = Math.max(1, ...graph.familyCount.values());
  const maxMech = Math.max(1, ...graph.mechCount.values());
  drawNodes(domainPos, "node-domain", maxDomain);
  drawNodes(familyPos, "node-family", maxFamily);
  drawNodes(mechPos, "node-mech", maxMech);
}
