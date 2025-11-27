import React, { useState, useRef, useEffect } from "react";

const uid = (prefix = "id") => `${prefix}_${Math.random().toString(36).slice(2,9)}`;

function ProcessNode({ node, onMouseDown, selected, highlight }) {
  return (
    <div
      onMouseDown={(e) => onMouseDown(e, node.id)}
      className={`absolute cursor-grab select-none p-2 rounded-xl border-2 shadow-lg w-32 text-center ${selected ? 'ring-4 ring-indigo-300' : ''} ${highlight ? 'bg-red-200 border-red-600' : 'bg-white border-gray-300'}`}
      style={{ left: node.x, top: node.y }}
    >
      <div className="font-semibold">{node.label}</div>
      <div className="text-xs text-gray-600">PID: {node.id}</div>
    </div>
  );
}

function ResourceNode({ node, onMouseDown, selected }) {
  return (
    <div
      onMouseDown={(e) => onMouseDown(e, node.id)}
      className={`absolute cursor-grab select-none p-2 rounded-xl border-2 shadow-lg w-36 text-center ${selected ? 'ring-4 ring-indigo-300' : ''} bg-gray-50 border-gray-400`}
      style={{ left: node.x, top: node.y }}
    >
      <div className="font-semibold">{node.label}</div>
      <div className="text-xs text-gray-600">Instances: {node.instances}</div>
      <div className="text-xs text-gray-600">RID: {node.id}</div>
    </div>
  );
}

export default function ResourceAllocationSimulator() {
  const [processes, setProcesses] = useState([
  { id: uid('P'), label: 'P1', x: 300, y: 200 }
]);

const [resources, setResources] = useState([
  { id: uid('R'), label: 'R1', x: 600, y: 200, instances: 1 }
]);

  const [allocations, setAllocations] = useState([]);
  const [requests, setRequests] = useState([]);
  const [mode, setMode] = useState('select');
  const [selectedId, setSelectedId] = useState(null);
  const [dragging, setDragging] = useState(null);
  const canvasRef = useRef(null);
  const [edgeStep, setEdgeStep] = useState(null);
  const [deadlockInfo, setDeadlockInfo] = useState({cycles: [], waitForEdges: []});

  function getCenter(node) {
    const w = node.label.startsWith('P') ? 128 : 144;
    const h = 56;
    return { x: node.x + w/2, y: node.y + h/2 };
  }

  useEffect(() => {
    function onMouseMove(e) {
      if (!dragging) return;
      const { id, type, offsetX, offsetY } = dragging;
      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left - offsetX;
      const y = e.clientY - rect.top - offsetY;
      if (type === 'process') {
        setProcesses(prev => prev.map(p => p.id === id ? { ...p, x, y } : p));
      } else {
        setResources(prev => prev.map(r => r.id === id ? { ...r, x, y } : r));
      }
    }
    function onMouseUp() {
      setDragging(null);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    }
  }, [dragging]);

  function startDrag(e, id, type) {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const node = (type === 'process' ? processes : resources).find(n => n.id === id);
    const offsetX = e.clientX - rect.left - node.x;
    const offsetY = e.clientY - rect.top - node.y;
    setDragging({ id, type, offsetX, offsetY });
  }

  function addProcess() {
    const p = { id: uid('P'), label: `P${processes.length+1}`, x: 40 + processes.length*20, y: 40 + processes.length*20 };
    setProcesses(prev => [...prev, p]);
  }

  function addResource() {
    const r = { id: uid('R'), label: `R${resources.length+1}`, x: 300 + resources.length*20, y: 80 + resources.length*20, instances: 1 };
    setResources(prev => [...prev, r]);
  }

  function totalAllocated(resId) {
    return allocations.filter(a => a.resId === resId).reduce((s,a)=>s+a.count,0);
  }

  function availableInstances(resId) {
    const res = resources.find(r=>r.id===resId);
    if (!res) return 0;
    return res.instances - totalAllocated(resId);
  }

  function handleNodeClick(type, id) {
    if (mode === 'select') {
      setSelectedId(id);
      return;
    }
    if (mode === 'add-allocation') {
      if (!edgeStep) {
        setEdgeStep({ type: 'alloc', sourceId: id });
      } else {
        const src = edgeStep.sourceId;
        const dst = id;
        const isSrcRes = resources.some(r=>r.id===src);
        const isDstRes = resources.some(r=>r.id===dst);
        const isSrcProc = processes.some(p=>p.id===src);
        const isDstProc = processes.some(p=>p.id===dst);
        let resId = null, procId = null;
        if (isSrcRes && isDstProc) resId = src, procId = dst;
        else if (isDstRes && isSrcProc) resId = dst, procId = src;
        else { setEdgeStep(null); return; }
        if (availableInstances(resId) <= 0) { setEdgeStep(null); return; }
        setAllocations(prev => [...prev, { resId, procId, count: 1 }]);
        setEdgeStep(null);
      }
    }
    if (mode === 'add-request') {
      if (!edgeStep) {
        setEdgeStep({ type: 'req', sourceId: id });
      } else {
        const src = edgeStep.sourceId;
        const dst = id;
        const isSrcProc = processes.some(p=>p.id===src);
        const isDstRes = resources.some(r=>r.id===dst);
        const isDstProc = processes.some(p=>p.id===dst);
        const isSrcRes = resources.some(r=>r.id===src);
        let procId = null, resId = null;
        if (isSrcProc && isDstRes) procId = src, resId = dst;
        else if (isSrcRes && isDstProc) procId = dst, resId = src;
        else { setEdgeStep(null); return; }
        setRequests(prev=>[...prev, { procId, resId, count: 1 }]);
        setEdgeStep(null);
      }
    }
    if (mode === 'delete') {
      const isP = processes.some(p=>p.id===id);
      if (isP) {
        setProcesses(prev=>prev.filter(p=>p.id!==id));
        setAllocations(prev=>prev.filter(a=>a.procId!==id));
        setRequests(prev=>prev.filter(r=>r.procId!==id));
      } else {
        setResources(prev=>prev.filter(r=>r.id!==id));
        setAllocations(prev=>prev.filter(a=>a.resId!==id));
        setRequests(prev=>prev.filter(r=>r.resId!==id));
      }
    }
  }

  function holdersOfResource(resId) {
    return allocations.filter(a => a.resId === resId).map(a => a.procId);
  }

  function detectDeadlock() {
    const wfg = new Map();
    processes.forEach(p => wfg.set(p.id, new Set()));
    const waitForEdges = [];

    requests.forEach(req => {
      if (availableInstances(req.resId) > 0) return;
      const holders = holdersOfResource(req.resId);
      holders.forEach(h => {
        if (!wfg.has(req.procId)) wfg.set(req.procId, new Set());
        wfg.get(req.procId).add(h);
        waitForEdges.push({from: req.procId, to: h, via: req.resId});
      });
    });

    const visited = new Set();
    const stack = new Set();
    const cycles = [];

    function dfs(node, path) {
      if (stack.has(node)) {
        const idx = path.indexOf(node);
        cycles.push(path.slice(idx));
        return;
      }
      if (visited.has(node)) return;
      visited.add(node);
      stack.add(node);
      const neighbors = wfg.get(node) ? Array.from(wfg.get(node)) : [];
      for (let nb of neighbors) dfs(nb, [...path, nb]);
      stack.delete(node);
    }

    processes.forEach(p => { if (!visited.has(p.id)) dfs(p.id, [p.id]); });
    setDeadlockInfo({ cycles, waitForEdges });
  }

  function exportJSON() {
    const payload = { processes, resources, allocations, requests };
    const data = JSON.stringify(payload, null, 2);
    const blob = new Blob([data], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'rag-sim.json'; a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(ev) {
    const file = ev.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        setProcesses(data.processes || []);
        setResources(data.resources || []);
        setAllocations(data.allocations || []);
        setRequests(data.requests || []);
        setDeadlockInfo({cycles: [], waitForEdges: []});
      } catch(e) {}
    };
    reader.readAsText(file);
  }

  function normalizedCycles(cycles) {
    const seen = new Set();
    const out = [];
    cycles.forEach(c => {
      const key = c.slice().sort().join('|');
      if (!seen.has(key)) { seen.add(key); out.push(c); }
    });
    return out;
  }

  const cycleProcs = new Set((deadlockInfo.cycles||[]).flat());

  return (
    <div className="p-4 font-sans">
      <h1 className="text-2xl font-bold mb-3">Resource Allocation Graph Simulator</h1>
      <div className="flex gap-4">
        <div className="w-72 p-3 bg-white rounded-lg shadow-md border">
          <div className="mb-2 font-semibold">Controls</div>
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <button onClick={addProcess} className="px-2 py-1 bg-indigo-600 text-white rounded">Add Process</button>
              <button onClick={addResource} className="px-2 py-1 bg-green-600 text-white rounded">Add Resource</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button className={`px-2 py-1 rounded ${mode==='select' ? 'bg-indigo-500 text-white' : 'bg-gray-100'}`} onClick={()=>setMode('select')}>Select</button>
              <button className={`px-2 py-1 rounded ${mode==='add-allocation' ? 'bg-indigo-500 text-white' : 'bg-gray-100'}`} onClick={()=>{setMode('add-allocation'); setEdgeStep(null);}}>Add Allocation</button>
              <button className={`px-2 py-1 rounded ${mode==='add-request' ? 'bg-indigo-500 text-white' : 'bg-gray-100'}`} onClick={()=>{setMode('add-request'); setEdgeStep(null);}}>Add Request</button>
              <button className={`px-2 py-1 rounded ${mode==='delete' ? 'bg-red-500 text-white' : 'bg-gray-100'}`} onClick={()=>setMode('delete')}>Delete</button>
            </div>
            <div className="text-sm text-gray-600">Edge step: {edgeStep ? `waiting for second node (source ${edgeStep.sourceId})` : 'none'}</div>
            <div className="flex gap-2 mt-2">
              <button onClick={detectDeadlock} className="px-2 py-1 bg-red-600 text-white rounded">Detect Deadlock</button>
              <button onClick={()=>{ setDeadlockInfo({cycles: [], waitForEdges: []}); }} className="px-2 py-1 bg-gray-200 rounded">Clear Detection</button>
            </div>
            <div className="mt-3 flex flex-col gap-2">
              <button onClick={exportJSON} className="px-2 py-1 border rounded">Export JSON</button>
              <label className="px-2 py-1 border rounded text-sm text-gray-700 cursor-pointer">
                Import JSON
                <input type="file" accept="application/json" onChange={importJSON} className="hidden" />
              </label>
            </div>
          </div>

          <div className="mt-4">
            <div className="font-semibold">Allocations</div>
            <div className="text-xs text-gray-600 max-h-32 overflow-auto">
              {allocations.length === 0 ? <div className="text-gray-400">(none)</div> : allocations.map((a,i)=>{
                const r = resources.find(x=>x.id===a.resId);
                const p = processes.find(x=>x.id===a.procId);
                return <div key={i} className="flex justify-between items-center">
                  <div>{r?.label} ➜ {p?.label} (count {a.count})</div>
                  <button onClick={()=>setAllocations(prev=>prev.filter((_,j)=>j!==i))} className="text-sm text-red-600">x</button>
                </div>
              })}
            </div>
            <div className="font-semibold mt-2">Requests</div>
            <div className="text-xs text-gray-600 max-h-32 overflow-auto">
              {requests.length === 0 ? <div className="text-gray-400">(none)</div> : requests.map((r,i)=>{
                const res = resources.find(x=>x.id===r.resId);
                const p = processes.find(x=>x.id===r.procId);
                return <div key={i} className="flex justify-between items-center">
                  <div>{p?.label} ➜ {res?.label} (count {r.count})</div>
                  <button onClick={()=>setRequests(prev=>prev.filter((_,j)=>j!==i))} className="text-sm text-red-600">x</button>
                </div>
              })}
            </div>
          </div>
        </div>

        <div className="flex-1 bg-gray-50 rounded-lg border p-2 relative" ref={canvasRef} style={{ minHeight: 520 }}>
          <svg className="absolute inset-0 w-full h-full pointer-events-none">
            {allocations.map((a,idx)=>{
              const res = resources.find(r=>r.id===a.resId);
              const proc = processes.find(p=>p.id===a.procId);
              if(!res||!proc) return null;
              const c1 = getCenter(res), c2 = getCenter(proc);
              const isHighlighted = cycleProcs.has(proc.id);
              return (
                <g key={`alloc-${idx}`}>
                  <defs>
                    <marker id={`arrow-alloc-${idx}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                      <path d="M0,0 L10,5 L0,10 z" fill="blue" />
                    </marker>
                  </defs>
                  <line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke={isHighlighted ? "red" : "blue"} strokeWidth="2" markerEnd={`url(#arrow-alloc-${idx})`} />
                </g>
              );
            })}
            {requests.map((req,idx)=>{
              const proc = processes.find(p=>p.id===req.procId);
              const res = resources.find(r=>r.id===req.resId);
              if(!proc||!res) return null;
              const c1 = getCenter(proc), c2 = getCenter(res);
              const isHighlighted = cycleProcs.has(proc.id);
              return (
                <g key={`req-${idx}`}>
                  <defs>
                    <marker id={`arrow-req-${idx}`} markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                      <path d="M0,0 L10,5 L0,10 z" fill="green" />
                    </marker>
                  </defs>
                  <line x1={c1.x} y1={c1.y} x2={c2.x} y2={c2.y} stroke={isHighlighted ? "red" : "green"} strokeWidth="2" markerEnd={`url(#arrow-req-${idx})`} />
                </g>
              );
            })}
          </svg>
          {processes.map(p => (
            <ProcessNode key={p.id} node={p} onMouseDown={(e) => startDrag(e, p.id, 'process')} selected={selectedId === p.id} highlight={cycleProcs.has(p.id)} />
          ))}
          {resources.map(r => (
            <ResourceNode key={r.id} node={r} onMouseDown={(e) => startDrag(e, r.id, 'resource')} selected={selectedId === r.id} />
          ))}
        </div>
      </div>
    </div>
  );
}
