import dagre from '@dagrejs/dagre';
import { neighborhood } from './graph.js';

export const WIDTH = 184;
export const HEIGHT = 64;

// Dagre removes back edges before ranking and restores their direction after
// routing. Split crowded ranks here so paths can route around the new columns.
function spreadRanks(graph, nodeIds) {
  const ranks = new Map();
  const columns = new Map();
  for (const id of dagre.graphlib.alg.topsort(graph).reverse()) {
    if (!nodeIds.has(id)) continue;
    let rank = 0;
    for (const { w: target } of graph.outEdges(id)) {
      rank = Math.min(rank, ranks.get(target) - 1);
    }
    ranks.set(id, rank);
  }
  for (const id of nodeIds) {
    const rank = ranks.get(id);
    if (!columns.has(rank)) columns.set(rank, []);
    columns.get(rank).push(id);
  }

  let nextRank = 0;
  let wrapped = false;
  for (const rank of [...columns.keys()].sort((a, b) => a - b)) {
    const column = columns.get(rank);
    const rows =
      column.length <= 6
        ? column.length
        : Math.max(4, Math.ceil(Math.sqrt(column.length)));
    wrapped ||= rows < column.length;
    for (const [index, id] of column.entries()) {
      // Dagre reserves the odd-numbered ranks for edge labels.
      graph.node(id).rank = nextRank + 2 * Math.floor(index / rows);
    }
    nextRank += 2 * Math.ceil(column.length / rows);
  }
  for (const id of graph.nodes()) {
    if (!nodeIds.has(id)) graph.node(id).rank = -1;
  }
  return wrapped;
}

// Keep Dagre's top-to-bottom routing order in each column, but center the
// columns independently so long parallel branches do not keep entire rows apart.
function compactColumns(graph) {
  const columns = new Map();
  const originalHeights = new Map();
  const routingColumns = new Set();
  function place(point, height, apply) {
    if (!columns.has(point.x)) columns.set(point.x, []);
    columns.get(point.x).push({ y: point.y, height, apply });
  }
  for (const id of graph.nodes()) {
    const node = graph.node(id);
    routingColumns.add(node.x);
    place(node, HEIGHT + 44, (y) => {
      originalHeights.set(id, node.y);
      node.y = y;
    });
  }
  for (const edge of graph.edges()) {
    for (const point of graph.edge(edge).points.slice(1, -1)) {
      place(point, 14, (y) => {
        point.y = y;
      });
    }
  }
  for (const column of columns.values()) {
    column.sort((a, b) => a.y - b.y);
    const total = column.reduce((sum, entry) => sum + entry.height, 0);
    let top = -total / 2;
    for (const entry of column) {
      entry.apply(top + entry.height / 2);
      top += entry.height;
    }
  }

  for (const edge of graph.edges()) {
    const route = graph.edge(edge);
    const [start, ...rest] = route.points;
    const end = rest.pop();
    const direction = Math.sign(graph.node(edge.w).x - graph.node(edge.v).x);
    function alignEndpoint(point, id, side) {
      const node = graph.node(id);
      const offset = point.y - originalHeights.get(id);
      const limit = HEIGHT / 2 - 10;
      point.x = node.x + (side * WIDTH) / 2;
      point.y = node.y + Math.max(-limit, Math.min(limit, offset));
    }
    alignEndpoint(start, edge.v, direction);
    alignEndpoint(end, edge.w, -direction);
    const lead = (point, distance) => ({
      x: point.x + direction * distance,
      y: point.y,
    });
    const points = [start, lead(start, 8)];
    for (const point of rest) {
      // Keep the route horizontal while it crosses the full width of a card
      // column. Between columns it can bend without cutting through a card.
      if (routingColumns.has(point.x)) {
        const clearance = WIDTH / 2 + 8;
        points.push(lead(point, -clearance), lead(point, clearance));
      } else {
        points.push(point);
      }
    }
    points.push(lead(end, -8), end);
    route.points = points;
  }
}

export function layout(project, selected, depth) {
  const visible = neighborhood(project, selected, depth);
  const devices = new Set(visible.devices);
  const rungs = new Set(visible.rungs);
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  const nodeIds = new Set();
  let wrapped = false;
  graph.setGraph({
    rankdir: 'LR',
    ranksep: 112,
    nodesep: 52,
    edgesep: 28,
    ranker: (layoutGraph) => {
      wrapped = spreadRanks(layoutGraph, nodeIds);
    },
  });
  graph.setDefaultEdgeLabel(() => ({}));
  const nodes = [];
  const edges = [];
  function addNode(id, item, kind) {
    nodeIds.add(id);
    graph.setNode(id, { width: WIDTH, height: HEIGHT });
    nodes.push({
      id,
      type: 'relationship',
      width: WIDTH,
      height: HEIGHT,
      data: { item, kind, active: id === 'd:' + selected },
    });
  }
  function addEdge(source, target, id, instruction) {
    graph.setEdge(source, target, {}, id);
    edges.push({ id, source, target, instruction });
  }
  for (const device of project.devices) {
    if (devices.has(device.address))
      addNode('d:' + device.address, device, 'device');
  }
  for (const rung of project.rungs) {
    if (!rungs.has(rung.id)) continue;
    const id = 'r:' + rung.id;
    addNode(id, rung, 'rung');
    rung.reads.forEach((address, index) =>
      addEdge('d:' + address, id, id + ':read:' + index),
    );
    rung.writes.forEach((write, index) =>
      addEdge(
        id,
        'd:' + write.address,
        id + ':write:' + index,
        write.instruction,
      ),
    );
  }
  dagre.layout(graph);
  if (wrapped) compactColumns(graph);
  for (const node of nodes) {
    const { x, y } = graph.node(node.id);
    node.position = { x: x - WIDTH / 2, y: y - HEIGHT / 2 };
  }
  for (const edge of edges) {
    edge.points = graph.edge(edge.source, edge.target, edge.id).points;
    edge.sourceCenter = graph.node(edge.source);
    edge.targetCenter = graph.node(edge.target);
  }
  return { nodes, edges, wrapped };
}
