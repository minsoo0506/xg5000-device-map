import React, {useMemo, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {ReactFlow, Background, Controls, MiniMap} from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import '@xyflow/react/dist/style.css';
import './style.css';
import {demo} from './demo.js';
import {validateProject, neighborhood, searchDevices} from './graph.js';

function App(){
 const [project,setProject]=useState(demo),[selected,setSelected]=useState('M100'),[query,setQuery]=useState(''),[depth,setDepth]=useState(1),[detail,setDetail]=useState(null),[error,setError]=useState('');
 const visible=useMemo(()=>neighborhood(project,selected,depth),[project,selected,depth]);
 const {nodes,edges}=useMemo(()=>{
  const rs=project.rungs.filter(r=>visible.rungs.includes(r.id));
  const ds=project.devices.filter(d=>visible.devices.includes(d.address));
  const nodes=[...ds.map(d=>({id:'d:'+d.address,data:{label:<><b>{d.address}</b><small>{d.comment || '설명 없음'}</small></>},className:d.address===selected?'device selected':'device',position:{x:0,y:0}})),...rs.map(r=>({id:'r:'+r.id,data:{label:<><b>{r.program}</b><small>{r.location} · {r.writes.map(w=>w.instruction).join(', ')}</small></>},className:'rung',position:{x:0,y:0}}))];
  const edges=[]; for(const r of rs){ for(const [i,a] of r.reads.entries()) edges.push({id:`${r.id}-in-${i}`,source:'d:'+a,target:'r:'+r.id,animated:false}); for(const [i,w] of r.writes.entries()) edges.push({id:`${r.id}-out-${i}`,source:'r:'+r.id,target:'d:'+w.address,label:w.instruction}); }
  const g=new dagre.graphlib.Graph();g.setGraph({rankdir:'LR',nodesep:35,ranksep:80});g.setDefaultEdgeLabel(()=>({})); for(const n of nodes)g.setNode(n.id,{width:180,height:66});for(const e of edges)g.setEdge(e.source,e.target);dagre.layout(g);for(const n of nodes){const p=g.node(n.id);n.position={x:p.x-90,y:p.y-33};}return {nodes,edges};
 },[project,visible,selected]);
 async function load(e){const file=e.target.files?.[0];if(!file)return;try{const parsed=validateProject(JSON.parse(await file.text()));if(!parsed.devices.length)throw Error('디바이스가 없습니다.');setProject(parsed);setSelected(parsed.devices[0].address);setDepth(1);setDetail(null);setError('');}catch(err){setError(`파일을 열 수 없습니다: ${err.message}`)}finally{e.target.value='';}}
 const list=searchDevices(project,query); const chosen=project.devices.find(d=>d.address===selected);
 return <div className="app"><header><div><span className="brand">XG <em>MAP</em></span><span className="header-sub">디바이스 관계 탐색기</span></div><div className="actions"><button onClick={()=>{setProject(demo);setSelected('M100');setDepth(1);setDetail(null);setError('')}}>예제 열기</button><label className="primary">관계 데이터 열기<input type="file" accept=".json,application/json" onChange={load}/></label></div></header>
 <div className="notice"><strong>안내</strong> · 예제와 전용 JSON 파일을 열 수 있습니다. XG5000 프로젝트와 CSV는 아직 직접 분석할 수 없습니다. 실제 동작은 원본 래더에서 확인하세요.</div>
 <main><aside><div className="aside-head"><p className="eyebrow">PROJECT</p><h2>{project.name || '이름 없는 프로젝트'}</h2><p>{project.devices.length}개 디바이스 · {project.rungs.length}개 조건 묶음</p></div><div className="search"><label htmlFor="search">디바이스 검색</label><input id="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="주소 또는 주석 입력"/></div><div className="list">{list.map(d=><button key={d.address} className={selected===d.address?'active':''} onClick={()=>{setSelected(d.address);setDetail(null);setDepth(1)}}><b>{d.address}</b><span>{d.comment || '설명 없음'}</span><i>›</i></button>)}{!list.length&&<p className="empty">검색 결과가 없습니다.</p>}</div></aside>
 <section className="workspace"><div className="workspace-head"><div><p className="eyebrow">DEVICE RELATIONSHIP</p><h1>{selected} <span>{chosen?.comment}</span></h1><p>디바이스를 클릭하면 해당 주소를 중심으로 다시 탐색합니다.</p></div><div className="depth"><span>탐색 단계</span><button onClick={()=>setDepth(Math.max(1,depth-1))} disabled={depth===1}>−</button><strong>{depth}</strong><button onClick={()=>setDepth(Math.min(5,depth+1))} disabled={depth===5}>+</button></div></div>{error&&<div role="alert" className="error">{error}</div>}<div className="canvas"><ReactFlow key={`${selected}-${depth}-${project.name}`} nodes={nodes} edges={edges} fitView minZoom={0.1} onNodeClick={(_,n)=>{if(n.id.startsWith('d:')){setSelected(n.id.slice(2));setDepth(1);setDetail(null)}else setDetail(project.rungs.find(r=>r.id===n.id.slice(2)))}} nodesDraggable={true}><Background color="#cbd5e1" gap={22}/><Controls/><MiniMap pannable zoomable/></ReactFlow><div className="legend"><span>● 디바이스</span><span>■ 조건 묶음</span><span>→ 참조 방향</span></div></div><div className="detail"><div><p className="eyebrow">DETAILS</p><h3>{detail?`${detail.program} · ${detail.location}`:'조건 묶음을 선택하세요'}</h3></div><p>{detail?`읽기: ${detail.reads.join(', ') || '없음'}  /  쓰기: ${detail.writes.map(w=>`${w.instruction} ${w.address}`).join(', ') || '없음'}${detail.note?'  ·  '+detail.note:''}`:'관계도에서 가운데 조건 묶음을 클릭하면 관련 디바이스와 명령을 볼 수 있습니다.'}</p></div></section></main></div>
}

createRoot(document.getElementById('root')).render(<App/>);
