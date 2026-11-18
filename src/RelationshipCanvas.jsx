import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BaseEdge,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useReactFlow,
} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import './canvas.css';
import { networkLocation, networkNote } from './diagnostics.js';
import { neighborhood } from './graph.js';

const WIDTH = 184;
const HEIGHT = 64;
const copy = {
  ko: {
    device: '디바이스',
    rung: '조건 묶음',
    read: '읽기',
    write: '쓰기',
    none: '설명 없음',
    controls: '관계도 조작',
    zoomIn: '확대',
    zoomOut: '축소',
    fit: '전체 보기',
    map: '미니맵',
    select: 'Enter 키나 스페이스바를 눌러 디바이스를 선택하세요.',
  },
  en: {
    device: 'Device',
    rung: 'Rung',
    read: 'Read',
    write: 'Write',
    none: 'No description',
    controls: 'Graph controls',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    fit: 'Fit to view',
    map: 'Mini map',
    select: 'Press Enter or Space to select a device.',
  },
  ja: {
    device: 'デバイス',
    rung: '回路ブロック',
    read: '読み取り',
    write: '書き込み',
    none: '説明なし',
    controls: 'グラフ操作',
    zoomIn: '拡大',
    zoomOut: '縮小',
    fit: '全体表示',
    map: 'ミニマップ',
    select: 'Enter キーまたはスペースキーでデバイスを選択します。',
  },
};

function layout(project, selected, depth) {
  const visible = neighborhood(project, selected, depth);
  const devices = new Set(visible.devices);
  const rungs = new Set(visible.rungs);
  const graph = new dagre.graphlib.Graph({ multigraph: true });
  graph.setGraph({
    rankdir: 'LR',
    ranksep: 112,
    nodesep: 52,
    edgesep: 28,
    ranker: 'longest-path',
  });
  graph.setDefaultEdgeLabel(() => ({}));
  const nodes = [];
  const edges = [];
  function addNode(id, item, kind) {
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
  for (const node of nodes) {
    const { x, y } = graph.node(node.id);
    node.position = { x: x - WIDTH / 2, y: y - HEIGHT / 2 };
  }
  for (const edge of edges) {
    edge.points = graph.edge(edge.source, edge.target, edge.id).points;
    edge.sourceCenter = graph.node(edge.source);
    edge.targetCenter = graph.node(edge.target);
  }
  return { nodes, edges };
}

const Card = memo(function Card({ data }) {
  const { item, kind, active, labels, language, nativeProject, example } = data;
  const device = kind === 'device';
  const title = device ? item.address : item.program;
  const location =
    !device && (nativeProject || example)
      ? networkLocation(item.location, language)
      : item.location;
  const note =
    !device && nativeProject ? networkNote(item.note, language) : item.note;
  const description = device
    ? item.comment || labels.none
    : [location, ...new Set(item.writes.map((w) => w.instruction))].join(' · ');
  const tooltip = device
    ? description
    : [
        title + ' · ' + location,
        labels.read + ' · ' + item.reads.join(', '),
        labels.write +
          ' · ' +
          item.writes.map((w) => w.instruction + ' ' + w.address).join(', '),
        note,
      ]
        .filter(Boolean)
        .join('\n');
  return (
    <div
      className={'relationship-card ' + kind + (active ? ' current' : '')}
      title={tooltip}
    >
      <Handle type="target" position={Position.Left} />
      <b>{title}</b>
      <small>{description}</small>
      <Handle type="source" position={Position.Right} />
    </div>
  );
});

// Round each bend while keeping the path within Dagre's assigned routing channel.
function roundedLine(points) {
  let path = 'M ' + points[0].x + ' ' + points[0].y;
  for (let index = 1; index < points.length - 1; index++) {
    const a = points[index - 1],
      b = points[index],
      c = points[index + 1];
    const before = Math.hypot(a.x - b.x, a.y - b.y),
      after = Math.hypot(c.x - b.x, c.y - b.y);
    if (!before || !after) continue;
    const radius = Math.min(18, before / 2, after / 2);
    path +=
      ' L ' +
      (b.x + ((a.x - b.x) * radius) / before) +
      ' ' +
      (b.y + ((a.y - b.y) * radius) / before);
    path +=
      ' Q ' +
      b.x +
      ' ' +
      b.y +
      ' ' +
      (b.x + ((c.x - b.x) * radius) / after) +
      ' ' +
      (b.y + ((c.y - b.y) * radius) / after);
  }
  return path + ' L ' + points.at(-1).x + ' ' + points.at(-1).y;
}

function RoutedEdge({ id, data, markerEnd, style, label }) {
  const points = data.points;
  const mid = points[Math.floor(points.length / 2)];
  return (
    <BaseEdge
      id={id}
      path={roundedLine(points)}
      markerEnd={markerEnd}
      style={style}
      label={label}
      labelX={mid.x}
      labelY={mid.y}
      labelBgPadding={[4, 2]}
      labelBgBorderRadius={3}
    />
  );
}
const nodeTypes = { relationship: Card };
const edgeTypes = { routed: RoutedEdge };

function CenterSelection({ graph, selected, project, container }) {
  const flow = useReactFlow();
  const previous = useRef(null);
  useEffect(() => {
    if (
      !flow.viewportInitialized ||
      previous.current?.graph === graph ||
      !container.current
    )
      return;
    const root = graph.nodes.find((node) => node.id === 'd:' + selected);
    if (!root) return;
    const x = root.position.x + WIDTH / 2,
      y = root.position.y + HEIGHT / 2;
    let zoom = flow.getZoom();
    if (previous.current?.project !== project) {
      const { width, height } = container.current.getBoundingClientRect();
      let radiusX = WIDTH / 2,
        radiusY = HEIGHT / 2;
      for (const node of graph.nodes) {
        radiusX = Math.max(
          radiusX,
          Math.abs(node.position.x + WIDTH / 2 - x) + WIDTH / 2,
        );
        radiusY = Math.max(
          radiusY,
          Math.abs(node.position.y + HEIGHT / 2 - y) + HEIGHT / 2,
        );
      }
      zoom = Math.max(
        0.35,
        Math.min(
          1,
          (width - 32) / (2 * radiusX),
          (height - 56) / (2 * radiusY),
        ),
      );
    }
    previous.current = { graph, project };
    const { width, height } = container.current.getBoundingClientRect();
    flow.setViewport({
      x: width / 2 - x * zoom,
      y: height / 2 - y * zoom,
      zoom,
    });
  }, [container, flow, graph, project, selected]);
  return null;
}

export default function RelationshipCanvas({
  project,
  selected,
  depth,
  onSelect,
  language = 'ko',
  theme = 'light',
  nativeProject = false,
  example = false,
}) {
  const container = useRef(null);
  const labels = copy[language] ?? copy.ko;
  const graph = useMemo(
    () => layout(project, selected, depth),
    [project, selected, depth],
  );
  const [drag, setDrag] = useState(null);
  const positions = drag?.graph === graph ? drag.positions : null;
  const nodes = useMemo(
    () =>
      graph.nodes.map((node) => ({
        ...node,
        position: positions?.get(node.id) || node.position,
        data: { ...node.data, labels, language, nativeProject, example },
        focusable: node.data.kind === 'device',
        domAttributes:
          node.data.kind === 'device'
            ? {
                onKeyDownCapture: (event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelect(node.data.item.address);
                  }
                },
              }
            : undefined,
        ariaLabel:
          node.data.kind === 'device'
            ? labels.device + ' ' + node.data.item.address
            : labels.rung +
              ' ' +
              (nativeProject || example
                ? networkLocation(node.data.item.location, language)
                : node.data.item.location),
      })),
    [graph, positions, labels, onSelect, language, nativeProject, example],
  );
  const dark = theme === 'dark';
  const edges = useMemo(
    () =>
      graph.edges.map((edge) => {
        const read = edge.source === 'd:' + selected,
          write = edge.target === 'd:' + selected;
        const color = read
          ? dark
            ? '#79aaff'
            : '#376cca'
          : write
            ? dark
              ? '#f9b46e'
              : '#bb632c'
            : dark
              ? '#758398'
              : '#9aa9ba';
        const points = edge.points.slice();
        for (const [index, id, center] of [
          [0, edge.source, edge.sourceCenter],
          [points.length - 1, edge.target, edge.targetCenter],
        ]) {
          const dragged = positions?.get(id);
          if (dragged)
            points[index] = {
              x: points[index].x + dragged.x + WIDTH / 2 - center.x,
              y: points[index].y + dragged.y + HEIGHT / 2 - center.y,
            };
        }
        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          type: 'routed',
          label: edge.instruction,
          data: { points },
          zIndex: read || write ? 1 : 0,
          markerEnd: { type: MarkerType.ArrowClosed, color },
          style: { stroke: color, strokeWidth: read || write ? 2.4 : 1.5 },
        };
      }),
    [graph, positions, selected, dark],
  );
  function onNodesChange(changes) {
    const moved = changes.filter(
      (change) => change.type === 'position' && change.position,
    );
    if (!moved.length) return;
    setDrag((prior) => {
      const updated = new Map(prior?.graph === graph ? prior.positions : []);
      for (const change of moved) updated.set(change.id, change.position);
      return { graph, positions: updated };
    });
  }
  return (
    <div
      ref={container}
      className="canvas relationship-canvas"
      data-mode={dark ? 'dark' : 'light'}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        colorMode={dark ? 'dark' : 'light'}
        minZoom={0.08}
        maxZoom={3}
        nodesConnectable={false}
        edgesFocusable={false}
        deleteKeyCode={null}
        onNodeClick={(_, node) => {
          if (node.data.kind === 'device') onSelect(node.data.item.address);
        }}
        ariaLabelConfig={{
          'controls.ariaLabel': labels.controls,
          'controls.zoomIn.ariaLabel': labels.zoomIn,
          'controls.zoomOut.ariaLabel': labels.zoomOut,
          'controls.fitView.ariaLabel': labels.fit,
          'minimap.ariaLabel': labels.map,
          'node.a11yDescription.default': labels.select,
          'node.a11yDescription.keyboardDisabled': labels.select,
        }}
      >
        <CenterSelection
          graph={graph}
          selected={selected}
          project={project}
          container={container}
        />
        <Background gap={20} size={1} color={dark ? '#465263' : '#d3dae2'} />
        <Controls showInteractive={false} />
        <MiniMap
          pannable
          zoomable
          style={{ width: 132, height: 82 }}
          bgColor={dark ? '#212d3b' : '#f6f8fb'}
          maskColor={dark ? 'rgba(8,14,24,0.38)' : 'rgba(198,208,220,0.32)'}
          maskStrokeColor={dark ? '#9aabbc' : '#778aa1'}
          maskStrokeWidth={1}
          nodeColor={(node) =>
            node.data.active
              ? '#18947d'
              : node.data.kind === 'rung'
                ? '#849ac4'
                : '#a5b7bc'
          }
        />
      </ReactFlow>
      <div className="relationship-legend">
        <span>
          <i className="read" />
          {labels.read}
        </span>
        <span>
          <i className="write" />
          {labels.write}
        </span>
      </div>
    </div>
  );
}
