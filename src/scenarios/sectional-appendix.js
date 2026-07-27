(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RailSectionalAppendix=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const FORMAT='rail-form-network-rail-sectional-appendix',VERSION=1,clone=value=>JSON.parse(JSON.stringify(value));
  function validate(document,corridorIds=[]){
    const errors=[],routes=new Map(),documents=new Set(),corridors=new Set(corridorIds);
    if(!document||typeof document!=='object')return{valid:false,errors:['Sectional Appendix document must be an object.']};
    if(document.format!==FORMAT)errors.push(`Unsupported Sectional Appendix format: ${document.format}.`);
    if(document.version!==VERSION)errors.push(`Unsupported Sectional Appendix version: ${document.version}.`);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(document.effectiveDate||''))errors.push('Sectional Appendix requires an effective date.');
    for(const source of document.documents||[]){
      if(!source.id||documents.has(source.id))errors.push(`Duplicate or missing Sectional Appendix document ID: ${source.id||'<missing>'}.`);else documents.add(source.id);
      if(!source.url?.startsWith('https://')||!/^[a-f0-9]{64}$/.test(source.sha256||'')||!Number.isSafeInteger(source.bytes)||!Number.isSafeInteger(source.pages))errors.push(`Sectional Appendix document ${source.id||'<missing>'} lacks pinned provenance.`);
    }
    for(const route of document.routes||[]){
      if(!route.code||routes.has(route.code))errors.push(`Duplicate or missing line-of-route code: ${route.code||'<missing>'}.`);else routes.set(route.code,route);
      if(!documents.has(route.documentId))errors.push(`Line of route ${route.code} references missing document ${route.documentId}.`);
      if(!Array.isArray(route.pdfPages)||route.pdfPages.length!==2||route.pdfPages.some(page=>!Number.isSafeInteger(page))||route.pdfPages[0]>route.pdfPages[1])errors.push(`Line of route ${route.code} has invalid PDF page evidence.`);
      if(!['start','end'].includes(route.upTowards))errors.push(`Line of route ${route.code} lacks an Up designation.`);
    }
    const pairs=new Map();
    for(const chain of document.chains||[]){
      if(!Array.isArray(chain.stations)||chain.stations.length<2)errors.push(`Sectional Appendix chain ${chain.id||'<missing>'} requires two stations.`);
      if((chain.routeCodes||[]).some(code=>!routes.has(code)))errors.push(`Sectional Appendix chain ${chain.id||'<missing>'} references an unknown line of route.`);
      for(let index=0;index<(chain.stations||[]).length-1;index++){
        const aId=chain.stations[index],bId=chain.stations[index+1],key=[aId,bId].sort().join('|');
        if(pairs.has(key))errors.push(`Sectional Appendix defines corridor ${key} more than once.`);
        pairs.set(key,{aId,bId,chain});
      }
    }
    for(const exception of document.exceptions||[]){
      const key=[exception.aId,exception.bId].sort().join('|');
      if(pairs.has(key))errors.push(`Sectional Appendix exception duplicates corridor ${key}.`);
      if((exception.routeCodes||[]).some(code=>!routes.has(code)))errors.push(`Sectional Appendix exception ${key} references an unknown line of route.`);
      pairs.set(key,{aId:exception.aId,bId:exception.bId,exception});
    }
    for(const override of document.physicalRoadOverrides||[]){
      const key=[override.aId,override.bId].sort().join('|');
      if(!pairs.has(key))errors.push(`Physical-road override references unknown corridor ${key}.`);
      if(![1,2,4].includes(override.physicalRoads))errors.push(`Physical-road override ${key} has an invalid road count.`);
      if(!routes.has(override.routeCode))errors.push(`Physical-road override ${key} references unknown line of route ${override.routeCode}.`);
    }
    if(corridors.size){
      for(const corridorId of corridors)if(!pairs.has(corridorId))errors.push(`Sectional Appendix does not classify corridor ${corridorId}.`);
      for(const key of pairs.keys())if(!corridors.has(key))errors.push(`Sectional Appendix classifies unknown corridor ${key}.`);
    }
    return{valid:errors.length===0,errors};
  }
  function normalize(document,corridorIds=[]){
    const result=validate(document,corridorIds);if(!result.valid)throw new TypeError(`Invalid Sectional Appendix data: ${result.errors.join(' ')}`);
    const routeByCode=new Map(document.routes.map(route=>[route.code,route])),rules=[];
    for(const chain of document.chains){
      for(let index=0;index<chain.stations.length-1;index++){
        const aId=chain.stations[index],bId=chain.stations[index+1],towardsLast=chain.upTowards==='last';
        rules.push({id:[aId,bId].sort().join('|'),aId,bId,routeCodes:[...chain.routeCodes],designation:'fixed',upTowardsStationId:towardsLast?bId:aId,sourcePages:chain.routeCodes.map(code=>({code,documentId:routeByCode.get(code).documentId,modulePages:routeByCode.get(code).modulePages,pdfPages:[...routeByCode.get(code).pdfPages]}))});
      }
    }
    for(const exception of document.exceptions)rules.push({id:[exception.aId,exception.bId].sort().join('|'),...clone(exception),upTowardsStationId:null,sourcePages:exception.routeCodes.map(code=>({code,documentId:routeByCode.get(code).documentId,modulePages:routeByCode.get(code).modulePages,pdfPages:[...routeByCode.get(code).pdfPages]}))});
    for(const override of document.physicalRoadOverrides||[]){const rule=rules.find(candidate=>candidate.id===[override.aId,override.bId].sort().join('|'));Object.assign(rule,clone(override));}
    rules.sort((a,b)=>a.id.localeCompare(b.id));
    return Object.freeze({format:FORMAT,version:VERSION,effectiveDate:document.effectiveDate,documents:clone(document.documents),routes:clone(document.routes),corridorRules:Object.freeze(rules.map(Object.freeze))});
  }
  function ruleFor(topology,aId,bId){const id=[aId,bId].sort().join('|');return topology?.corridorRules?.find(rule=>rule.id===id)||null;}
  function movement(topology,current,target){const rule=ruleFor(topology,current?.id||current,target?.id||target);if(!rule)return null;if(rule.designation!=='fixed')return{label:'varies',rule};return{label:(target?.id||target)===rule.upTowardsStationId?'up':'down',rule};}
  return{FORMAT,VERSION,validate,normalize,ruleFor,movement};
});
