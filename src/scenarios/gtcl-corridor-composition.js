(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RailGTCLCorridorComposition=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  function compose(osmMap,topology){
    if(!osmMap?.corridors?.length||!topology?.corridors?.length)throw new TypeError('OSM corridors and GTCL topology are required.');
    const routedById=new Map(topology.corridors.map(corridor=>[corridor.id,corridor]));
    const summary={requestedPaths:0,routedPaths:0,fallbackPaths:0,fallbackReasons:{}};
    const corridors=osmMap.corridors.map(corridor=>{
      const routed=routedById.get(corridor.id);
      if(!routed)throw new TypeError(`GTCL topology is missing corridor ${corridor.id}.`);
      const osmByFlow=new Map(corridor.paths.map(path=>[path.flow,path]));
      const paths=['up','down'].map(flow=>{
        summary.requestedPaths++;
        const candidate=routed.paths[flow],fallback=osmByFlow.get(flow);
        if(candidate?.status==='routed'&&candidate.coordinates?.length>=2){
          summary.routedPaths++;
          return{id:`${corridor.id}-${flow}`,flow,direction:flow,coordinates:candidate.coordinates,lengthMetres:candidate.lengthMetres,gtclAssetIds:candidate.gtclAssetIds,fromAnchor:candidate.fromAnchor,toAnchor:candidate.toAnchor,routeAuthority:'network-rail-gtcl',topologySource:'network-rail-gtcl-flow-graph'};
        }
        if(!fallback)throw new TypeError(`No ${flow} fallback exists for corridor ${corridor.id}.`);
        const reason=candidate?.reason||'MISSING_GTCL_CORRIDOR_PATH';
        summary.fallbackPaths++;summary.fallbackReasons[reason]=(summary.fallbackReasons[reason]||0)+1;
        return{...fallback,routeAuthority:'openstreetmap-fallback',topologySource:'openstreetmap-shared-node-graph',gtclFallbackReason:reason,gtclFromAnchor:candidate?.fromAnchor||null,gtclToAnchor:candidate?.toAnchor||null};
      });
      return{...corridor,paths,topologySource:paths.every(path=>path.routeAuthority==='network-rail-gtcl')?'network-rail-gtcl-flow-graph':paths.every(path=>path.routeAuthority==='openstreetmap-fallback')?'openstreetmap-fallback':'mixed-gtcl-osm'};
    });
    if(summary.requestedPaths!==topology.summary.requestedPaths||summary.routedPaths!==topology.summary.routedPaths||summary.fallbackPaths!==topology.summary.fallbackPaths)throw new TypeError('GTCL topology composition counts do not match the generated manifest.');
    return{...osmMap,source:{...osmMap.source,routing:{...osmMap.source.routing,authority:'Network Rail GTCL flow-aware topology',fallback:'OpenStreetMap exact shared-node topology',gtclSha256:topology.source.sha256,summary}},corridors,gtclTopologySummary:summary};
  }
  return{compose};
});
