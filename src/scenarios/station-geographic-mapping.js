(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RailStationGeographicMapping=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FORMAT='rail-form-geographic-stations',VERSION=1,clone=value=>JSON.parse(JSON.stringify(value));
  function deepFreeze(value){if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.values(value).forEach(deepFreeze);return Object.freeze(value);}
  const finitePair=value=>Array.isArray(value)&&value.length>=2&&Number.isFinite(value[0])&&Number.isFinite(value[1]);
  function validate(document,trackMap,stationIds=[]){
    const errors=[],knownStations=new Set(stationIds),knownTracks=new Set((trackMap?.tracks||[]).map(track=>track.id)),ids=new Set(),stationRefs=new Set();
    if(!document||typeof document!=='object')return{valid:false,errors:['Station mapping document must be an object.']};
    if(document.format!==FORMAT||document.version!==VERSION)errors.push('Station mapping has an unsupported format or version.');
    if(document.crs!=='EPSG:4326')errors.push(`Unsupported station mapping CRS: ${document.crs}.`);
    if(!document.source?.url||document.source?.license!=='ODbL-1.0'||!/^[a-f0-9]{64}$/i.test(document.source?.sha256||''))errors.push('Station mapping requires ODbL source URL and SHA-256 provenance.');
    if(document.trackSourceSha256!==trackMap?.source?.sha256)errors.push('Station mapping was not matched against this Track Model source.');
    for(const station of document.stations||[]){
      if(!station.id||ids.has(station.id))errors.push(`Duplicate or missing station layout ID: ${station.id||'<missing>'}.`);else ids.add(station.id);
      if(knownStations.size&&!knownStations.has(station.id))errors.push(`Station layout references unknown station ${station.id}.`);
      for(const ref of station.platformRefs||[]){const key=`${station.id}:${ref}`;if(!ref||stationRefs.has(key))errors.push(`Duplicate or missing platform reference: ${key}.`);else stationRefs.add(key);}
      for(const platform of station.platforms||[]){if(!platform.id||ids.has(platform.id))errors.push(`Duplicate platform feature ${platform.id}.`);else ids.add(platform.id);if(!Array.isArray(platform.coordinates)||platform.coordinates.length<2||platform.coordinates.some(point=>!finitePair(point)))errors.push(`Platform ${platform.id} requires line or area coordinates.`);}
      for(const road of station.platformRoads||[]){if(!(station.platformRefs||[]).includes(road.ref))errors.push(`Platform road ${station.id}:${road.ref} has no declared platform.`);if(!knownTracks.has(road.trackId))errors.push(`Platform road ${station.id}:${road.ref} references missing track ${road.trackId}.`);if(!finitePair(road.trackPoint)||!finitePair(road.sourcePoint))errors.push(`Platform road ${station.id}:${road.ref} requires finite matched points.`);if(!Number.isFinite(road.matchDistanceMetres)||road.matchDistanceMetres>40)errors.push(`Platform road ${station.id}:${road.ref} is not credibly matched to Track Model geometry.`);}
      for(const kind of['stops','switches','buffers'])for(const feature of station[kind]||[]){if(!feature.id||ids.has(feature.id))errors.push(`Duplicate ${kind} feature ${feature.id}.`);else ids.add(feature.id);if(!finitePair(feature.coordinates))errors.push(`${kind} feature ${feature.id} requires a finite point.`);}
    }
    if((document.stations||[]).length!==knownStations.size)errors.push('Station mapping must cover every scenario station.');
    return{valid:errors.length===0,errors};
  }
  function normalize(document,trackMap,stationIds=[]){
    const result=validate(document,trackMap,stationIds);if(!result.valid)throw new TypeError(`Invalid station geographic mapping: ${result.errors.join(' ')}`);
    const transform=document.transform,project=coordinate=>({x:(coordinate[0]-transform.origin[0])*transform.scale[0]+transform.translate[0],y:(transform.origin[1]-coordinate[1])*transform.scale[1]+transform.translate[1]});
    const stations=document.stations.map(station=>{const platforms=station.platforms.map(platform=>({...clone(Object.fromEntries(Object.entries(platform).filter(([key])=>key!=='coordinates'))),points:platform.coordinates.map(project)})),platformRoads=station.platformRoads.map(road=>({...clone(Object.fromEntries(Object.entries(road).filter(([key])=>!['trackPoint','sourcePoint'].includes(key)))),trackPoint:project(road.trackPoint),sourcePoint:project(road.sourcePoint)})),anchors=platformRoads.map(road=>road.sourcePoint);if(!anchors.length)anchors.push(...platforms.flatMap(platform=>platform.points));const point=anchors.length?anchors.reduce((sum,anchor)=>({x:sum.x+anchor.x/anchors.length,y:sum.y+anchor.y/anchors.length}),{x:0,y:0}):project(station.coordinates);return{
      ...clone(Object.fromEntries(Object.entries(station).filter(([key])=>!['platforms','stops','switches','buffers','platformRoads'].includes(key)))),point,platforms,
      stops:station.stops.map(feature=>({...clone(Object.fromEntries(Object.entries(feature).filter(([key])=>key!=='coordinates'))),point:project(feature.coordinates)})),
      switches:station.switches.map(feature=>({...clone(Object.fromEntries(Object.entries(feature).filter(([key])=>key!=='coordinates'))),point:project(feature.coordinates)})),
      buffers:station.buffers.map(feature=>({...clone(Object.fromEntries(Object.entries(feature).filter(([key])=>key!=='coordinates'))),point:project(feature.coordinates)})),platformRoads
    };}).sort((a,b)=>a.id.localeCompare(b.id));
    return deepFreeze({format:FORMAT,version:VERSION,crs:document.crs,source:clone(document.source),trackSourceSha256:document.trackSourceSha256,transform:clone(transform),stations});
  }
  function validateNormalized(geometry,trackGeometry,stationIds=[]){
    const errors=[],knownStations=new Set(stationIds),knownTracks=new Set((trackGeometry?.tracks||[]).map(track=>track.id)),seen=new Set();
    if(geometry?.format!==FORMAT||geometry?.version!==VERSION)errors.push('Normalized station mapping has an unsupported format or version.');
    if(geometry?.source?.license!=='ODbL-1.0'||!geometry?.source?.sha256)errors.push('Normalized station mapping is missing ODbL provenance.');
    for(const station of geometry?.stations||[]){if(seen.has(station.id))errors.push(`Duplicate normalized station layout ${station.id}.`);seen.add(station.id);if(knownStations.size&&!knownStations.has(station.id))errors.push(`Unknown normalized station layout ${station.id}.`);if(!Number.isFinite(station.point?.x)||!Number.isFinite(station.point?.y))errors.push(`Normalized station ${station.id} requires a finite map point.`);for(const platform of station.platforms||[])if(!Array.isArray(platform.points)||platform.points.length<2||platform.points.some(point=>!Number.isFinite(point.x)||!Number.isFinite(point.y)))errors.push(`Normalized platform ${platform.id} requires finite points.`);for(const road of station.platformRoads||[]){if(!knownTracks.has(road.trackId))errors.push(`Normalized platform road ${station.id}:${road.ref} references missing track ${road.trackId}.`);if(!Number.isFinite(road.trackPoint?.x)||!Number.isFinite(road.trackPoint?.y))errors.push(`Normalized platform road ${station.id}:${road.ref} requires a finite track point.`);}}
    if(seen.size!==knownStations.size)errors.push('Normalized station mapping must cover every scenario station.');
    return{valid:errors.length===0,errors};
  }
  return{FORMAT,VERSION,validate,validateNormalized,normalize};
});
