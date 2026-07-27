(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RailCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const key = (x, y) => `${x},${y}`;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const areaOf = station => station.area || { x: station.x, y: station.y, w: 1, h: 1 };
  const contains = (rect, x, y) => x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
  const overlaps = (a, b) => a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y;
  const cells = rect => {
    const out = [];
    for (let x=rect.x; x<rect.x+rect.w; x++) for (let y=rect.y; y<rect.y+rect.h; y++) out.push({x,y});
    return out;
  };

  function entries(station, tracks) {
    const area = areaOf(station), found = new Map();
    for (const inside of cells(area)) {
      if (inside.x !== area.x && inside.x !== area.x+area.w-1 && inside.y !== area.y && inside.y !== area.y+area.h-1) continue;
      for (const [dx,dy] of dirs) {
        const outside = {x:inside.x+dx,y:inside.y+dy};
        if (!contains(area,outside.x,outside.y) && tracks.has(key(outside.x,outside.y))) {
          found.set(`${key(outside.x,outside.y)}|${key(inside.x,inside.y)}`, {inside,outside});
        }
      }
    }
    return [...found.values()];
  }

  function findRailPath(a, b, tracks, grid, allStations = []) {
    if (!a.area || !b.area) return null;
    const starts = entries(a,tracks), targets = entries(b,tracks);
    if (!starts.length || !targets.length) return null;
    const blockedAreas=allStations.filter(s=>s.id!==a.id&&s.id!==b.id&&s.area).map(s=>s.area);
    const blocked=(x,y)=>blockedAreas.some(area=>contains(area,x,y));
    const targetMap = new Map(targets.filter(e=>!blocked(e.outside.x,e.outside.y)).map(e => [key(e.outside.x,e.outside.y),e.inside]));
    const queue = [], seen = new Map(), sourceInside = new Map();
    for (const entry of starts.filter(e=>!blocked(e.outside.x,e.outside.y))) {
      const k=key(entry.outside.x,entry.outside.y);
      if (!seen.has(k)) { queue.push(entry.outside); seen.set(k,null); sourceInside.set(k,entry.inside); }
    }
    while(queue.length) {
      const p=queue.shift(), pk=key(p.x,p.y);
      if(targetMap.has(pk)) {
        const trackPath=[]; let cursor=pk;
        while(cursor){const [x,y]=cursor.split(',').map(Number);trackPath.unshift({x,y});cursor=seen.get(cursor);}
        const firstKey=key(trackPath[0].x,trackPath[0].y);
        return [sourceInside.get(firstKey),...trackPath,targetMap.get(pk)];
      }
      for(const [dx,dy] of dirs){
        const n={x:p.x+dx,y:p.y+dy}, nk=key(n.x,n.y);
        if(n.x>=0&&n.y>=0&&n.x<grid.cols&&n.y<grid.rows&&tracks.has(nk)&&!blocked(n.x,n.y)&&!seen.has(nk)){
          seen.set(nk,pk); sourceInside.set(nk,sourceInside.get(pk)); queue.push(n);
        }
      }
    }
    return null;
  }

  function validateArea(rect, stations, tracks, grid, ownerId) {
    const errors=[];
    if(rect.w<2||rect.h<2) errors.push('Station areas must be at least 2 × 2 cells.');
    if(rect.w>7||rect.h>6) errors.push('Station areas may not exceed 7 × 6 cells.');
    if(rect.x<0||rect.y<0||rect.x+rect.w>grid.cols||rect.y+rect.h>grid.rows) errors.push('Station area extends beyond the map.');
    const contained=stations.filter(s=>contains(rect,s.x,s.y));
    if(contained.length!==1) errors.push(contained.length?'A station area may contain only one station node.':'Drag the area around one station node.');
    if(contained[0]&&ownerId&&contained[0].id!==ownerId) errors.push('This area belongs to another station.');
    if(stations.some(s=>s.area&&s.id!==ownerId&&overlaps(rect,s.area))) errors.push('Station areas cannot overlap.');
    if(cells(rect).some(c=>tracks.has(key(c.x,c.y)))) errors.push('Remove track from inside the proposed station area.');
    return {valid:errors.length===0,errors,station:contained[0]||null};
  }

  function platformAssignments(station, lines) {
    if(!station.area)return [];
    const connected=lines.filter(l=>l.a.id===station.id||l.b.id===station.id).sort((a,b)=>a.number-b.number);
    const capacity=Math.max(1,station.platformCount|| (station.area.w>=station.area.h?station.area.h:station.area.w));
    return connected.slice(0,capacity).map((line,index)=>({lineId:line.id,platform:index+1,total:Math.min(connected.length,capacity)}));
  }

  function validateNetwork(stations, lines, tracks, grid) {
    const issues=[];
    stations.filter(s=>!s.area).forEach(s=>issues.push({level:'warning',code:'NO_STATION',message:`${s.name} has no station area.`}));
    lines.forEach(line=>{
      const path=findRailPath(line.a,line.b,tracks,grid,stations);
      if(!path) issues.push({level:'error',code:'BROKEN_LINE',lineId:line.id,message:`${line.name} has no valid rail path.`});
      if(!line.locomotive) issues.push({level:'warning',code:'NO_LOCO',lineId:line.id,message:`${line.name} has no locomotive.`});
      if(!line.passengerCars) issues.push({level:'warning',code:'NO_CARS',lineId:line.id,message:`${line.name} has no passenger coaches.`});
    });
    stations.filter(s=>s.area).forEach(s=>{const connected=lines.filter(l=>l.a.id===s.id||l.b.id===s.id),services=new Set(connected.map(line=>line.serviceGroup||line.serviceId||line.id));const capacity=Math.max(1,s.platformCount||(s.area.w>=s.area.h?s.area.h:s.area.w));if(services.size>capacity)issues.push({level:'error',code:'NO_PLATFORM',message:`${s.name} has ${services.size-capacity} service(s) without a physical platform.`});});
    return issues;
  }

  function distanceFare(pathLength, rate=1.4) { return Math.ceil(Math.max(1,pathLength-2)*rate); }
  function demandMultiplier(activeServices, completedTrips, population) {
    if(!activeServices)return .18;
    return 1+activeServices*.22+Math.min(1.5,(completedTrips/Math.max(1,population))*40);
  }
  function passengerSpawnRate(originPopulation,destinationPopulation,otherPopulation,demand) {
    return (originPopulation/5000)*.08*(destinationPopulation/Math.max(1,otherPopulation))*demand;
  }
  function findPassengerJourney(originId,destinationId,lines){
    if(originId===destinationId)return{stations:[originId],lines:[],distance:0,transfers:0};
    const eligible=lines.filter(l=>l.locomotive&&l.passengerCars&&!l.broken&&l.path?.length&&l.a?.type==='CITY'&&l.b?.type==='CITY').sort((a,b)=>a.number-b.number);
    const startKey=`${originId}|`,best=new Map([[startKey,{stationId:originId,serviceGroup:null,distance:0,transfers:0,stations:[originId],lines:[]}]]),queue=[startKey];
    const compare=(a,b)=>a.transfers-b.transfers||a.distance-b.distance||a.lines.join(',').localeCompare(b.lines.join(','));
    while(queue.length){queue.sort((a,b)=>compare(best.get(a),best.get(b))||a.localeCompare(b));const stateKey=queue.shift(),route=best.get(stateKey),current=route.stationId;if(current===destinationId)return{distance:route.distance,stations:route.stations,lines:route.lines,transfers:route.transfers};for(const line of eligible){let next=null;if(line.a.id===current)next=line.b.id;else if(line.b.id===current)next=line.a.id;if(!next)continue;const group=line.serviceGroup||line.serviceId||line.id,transfers=route.transfers+(route.serviceGroup&&route.serviceGroup!==group?1:0),candidate={stationId:next,serviceGroup:group,distance:route.distance+Math.max(1,line.path.length-2),transfers,stations:[...route.stations,next],lines:[...route.lines,line.id]},nextKey=`${next}|${group}`,known=best.get(nextKey);if(!known||compare(candidate,known)<0){best.set(nextKey,candidate);if(!queue.includes(nextKey))queue.push(nextKey);}}}
    return null;
  }

  return {key,contains,overlaps,cells,entries,findRailPath,validateArea,platformAssignments,validateNetwork,distanceFare,demandMultiplier,passengerSpawnRate,findPassengerJourney};
});
