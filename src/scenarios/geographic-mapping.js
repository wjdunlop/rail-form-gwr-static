(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RailGeographicMapping=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FORMAT='rail-form-geographic-track',VERSION=1,clone=value=>JSON.parse(JSON.stringify(value));
  function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.values(value).forEach(deepFreeze);return Object.freeze(value);}
  function finitePair(value){return Array.isArray(value)&&value.length>=2&&Number.isFinite(value[0])&&Number.isFinite(value[1]);}
  function validate(document,stationIds=[]){
    const errors=[],stations=new Set(stationIds),ids=new Set(),corridorLanes=new Set();
    if(!document||typeof document!=='object')return{valid:false,errors:['Mapping document must be an object.']};
    if(document.format!==FORMAT)errors.push(`Unsupported mapping format: ${document.format}.`);
    if(document.version!==VERSION)errors.push(`Unsupported mapping version: ${document.version}.`);
    if(document.crs!=='EPSG:4326')errors.push(`Unsupported mapping CRS: ${document.crs}.`);
    if(!document.source?.url||!document.source?.license||!/^[a-f0-9]{64}$/i.test(document.source?.sha256||''))errors.push('Mapping source requires URL, licence and SHA-256 provenance.');
    if(document.transform?.kind!=='affine-v1'||!finitePair(document.transform.origin)||!finitePair(document.transform.scale)||!finitePair(document.transform.translate))errors.push('Mapping requires a valid affine-v1 transform.');
    for(const track of document.tracks||[]){
      if(!track.id||ids.has(track.id))errors.push(`Duplicate or missing track ID: ${track.id||'<missing>'}.`);else ids.add(track.id);
      if(!Array.isArray(track.coordinates)||track.coordinates.length<2||track.coordinates.some(point=>!finitePair(point)))errors.push(`Track ${track.id||'<missing>'} requires finite coordinates.`);
    }
    for(const corridor of document.corridors||[]){
      if(!corridor.id||ids.has(corridor.id))errors.push(`Duplicate or missing corridor ID: ${corridor.id||'<missing>'}.`);else ids.add(corridor.id);
      if(stations.size&&(!stations.has(corridor.aId)||!stations.has(corridor.bId)))errors.push(`Corridor ${corridor.id} references a missing station.`);
      for(const path of corridor.paths||[]){const key=`${corridor.id}:${path.flow}`;if(corridorLanes.has(key))errors.push(`Duplicate corridor flow: ${key}.`);else corridorLanes.add(key);if(!['up','down','both'].includes(path.flow))errors.push(`Path ${path.id} has an invalid flow.`);if(!Array.isArray(path.coordinates)||path.coordinates.length<2||path.coordinates.some(point=>!finitePair(point)))errors.push(`Path ${path.id||'<missing>'} requires finite coordinates.`);}
      if(!['up','down'].every(flow=>(corridor.paths||[]).some(path=>path.flow===flow)))errors.push(`Corridor ${corridor.id} requires Up and Down paths.`);
    }
    if(!(document.tracks||[]).length)errors.push('Mapping requires physical track links.');
    if(!(document.corridors||[]).length)errors.push('Mapping requires routed corridors.');
    return{valid:errors.length===0,errors};
  }
  function normalize(document,stationIds=[]){
    const result=validate(document,stationIds);if(!result.valid)throw new TypeError(`Invalid geographic mapping: ${result.errors.join(' ')}`);
    const transform=document.transform,project=coordinate=>({x:(coordinate[0]-transform.origin[0])*transform.scale[0]+transform.translate[0],y:(transform.origin[1]-coordinate[1])*transform.scale[1]+transform.translate[1]}),length=points=>points.slice(1).reduce((sum,point,index)=>sum+Math.hypot(point.x-points[index].x,point.y-points[index].y),0),normalizePoints=coordinates=>coordinates.map(project);
    const tracks=document.tracks.map(track=>{const{coordinates,...properties}=track,points=normalizePoints(coordinates);return{...clone(properties),points,length:length(points)};}).sort((a,b)=>a.id.localeCompare(b.id));
    const corridors=document.corridors.map(corridor=>{const{paths,...properties}=corridor;return{...clone(properties),paths:paths.map(path=>{const{coordinates,...pathProperties}=path,points=normalizePoints(coordinates);return{...clone(pathProperties),points,length:length(points)};}).sort((a,b)=>a.flow.localeCompare(b.flow))};}).sort((a,b)=>a.id.localeCompare(b.id));
    const stations=document.stations.map(station=>{const{coordinates,...properties}=station;return{...clone(properties),point:project(coordinates)};}).sort((a,b)=>a.id.localeCompare(b.id));
    return deepFreeze({format:FORMAT,version:VERSION,crs:document.crs,source:clone(document.source),transform:clone(transform),stations,tracks,corridors});
  }
  function validateNormalized(geometry,stationIds=[]){const errors=[],stations=new Set(stationIds),ids=new Set();if(geometry?.format!==FORMAT||geometry?.version!==VERSION)errors.push('Normalized mapping has an unsupported format or version.');if(!geometry?.source?.sha256)errors.push('Normalized mapping is missing provenance.');for(const track of geometry?.tracks||[]){if(!track.id||ids.has(track.id))errors.push(`Duplicate or missing normalized track ID: ${track.id||'<missing>'}.`);ids.add(track.id);if(!Array.isArray(track.points)||track.points.length<2||track.points.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y)))errors.push(`Normalized track ${track.id} requires finite points.`);}for(const corridor of geometry?.corridors||[]){if(stations.size&&(!stations.has(corridor.aId)||!stations.has(corridor.bId)))errors.push(`Normalized corridor ${corridor.id} references a missing station.`);if(!['up','down'].every(flow=>corridor.paths?.some(path=>path.flow===flow&&path.points?.length>=2)))errors.push(`Normalized corridor ${corridor.id} requires Up and Down paths.`);}return{valid:errors.length===0,errors};}
  return{FORMAT,VERSION,validate,validateNormalized,normalize};
});
