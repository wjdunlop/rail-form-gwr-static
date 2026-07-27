(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RailWorkingPlan=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const DAY_TOKEN=['SU','M','T','W','Th','F','S'];
  const clone=value=>JSON.parse(JSON.stringify(value));
  const freeze=value=>{if(!value||typeof value!=='object'||Object.isFrozen(value))return value;Object.values(value).forEach(freeze);return Object.freeze(value);};

  function dateParts(value){
    const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!match)throw new TypeError('Operating date must use YYYY-MM-DD.');
    const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));
    if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value)throw new TypeError('Operating date is invalid.');
    return{date,token:DAY_TOKEN[date.getUTCDay()],dayGroup:date.getUTCDay()===0?'sunday':date.getUTCDay()===6?'saturday':'weekdays'};
  }

  function runningDayTokens(code){
    const text=String(code||''),mode=text.endsWith('O')?'only':text.endsWith('X')?'except':null,prefix=mode?text.slice(0,-1):text,tokens=[];
    let cursor=0;while(cursor<prefix.length){if(prefix.slice(cursor,cursor+2)==='Th'||prefix.slice(cursor,cursor+2)==='SU'){tokens.push(prefix.slice(cursor,cursor+2));cursor+=2;continue;}const token=prefix[cursor];if(!['M','T','W','F','S'].includes(token))throw new TypeError(`Unsupported WTT running-days code: ${code}`);tokens.push(token);cursor++;}
    return{mode,tokens};
  }

  function runsOnDate(plan,dateValue){
    const{token,dayGroup}=dateParts(dateValue);
    return freeze((plan?.runs||[]).filter(run=>{
      if(run.dayGroup!==dayGroup||dateValue<run.startDate||dateValue>run.endDate)return false;
      const rule=runningDayTokens(run.runningDays);
      if(rule.mode==='only')return rule.tokens.includes(token);
      if(rule.mode==='except')return!rule.tokens.includes(token);
      return true;
    }).map(clone));
  }

  function rawClock(raw,near){
    const match=String(raw||'').match(/^(\d{2}).*?(\d{2})(½)?$/);if(!match)return null;
    let value=Number(match[1])*60+Number(match[2])+(match[3] ? .5 : 0),best=value,bestDistance=Math.abs(value-near);
    for(const shift of[-1440,1440,2880]){const candidate=value+shift,distance=Math.abs(candidate-near);if(distance<bestDistance){best=candidate;bestDistance=distance;}}
    return best;
  }

  function platformWindow(call){
    if(call.action!=='stop'||!call.platform)return null;
    const anchor=Number(call.minute),arrival=rawClock(call.arrival,anchor),departure=rawClock(call.departure,anchor);
    let start=arrival??anchor-.25,end=departure??anchor+.25;if(end<start)end+=1440;if(end-start<.5)end=start+.5;
    return{startMinute:start,endMinute:end};
  }

  function fleetClass(category){return category==='passenger'||category==='empty-stock'?'passenger-stock':category;}

  function operatingSignature(run){return run.calls.map(call=>[call.stationId,call.minute,call.action,call.platform||'',call.runningLine||''].join('@')).join('>');}

  function collapseAlternatives(runs){
    const groups=new Map();for(const run of runs){const key=operatingSignature(run);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(run);}
    return[...groups.values()].map(group=>{group.sort((a,b)=>{const aOnly=runningDayTokens(a.runningDays).mode==='only',bOnly=runningDayTokens(b.runningDays).mode==='only';return Number(bOnly)-Number(aOnly)||a.id.localeCompare(b.id);});const selected=clone(group[0]);selected.alternativeRunIds=group.slice(1).map(run=>run.id);selected.alternativeHeadcodes=[...new Set(group.map(run=>run.headcode))].sort();return selected;});
  }

  function platformReference(station,raw){
    const value=String(raw||''),references=(station.platformRefs||[]).map(String);if(references.includes(value))return value;
    const numeric=value.match(/^(\d+)[A-Z]$/)?.[1];if(numeric&&references.includes(numeric))return numeric;
    return null;
  }

  function buildOperatingDay(plan,options={}){
    const date=options.date||'2026-07-23',stations=options.stations||[],stationById=new Map(stations.map(station=>[station.id,station])),selected=collapseAlternatives(runsOnDate(plan,date)
      .filter(run=>!options.categories||options.categories.includes(run.category))).sort((a,b)=>a.calls[0].minute-b.calls[0].minute||a.id.localeCompare(b.id));
    const slotsByPool=new Map(),trips=[],platformWindows=new Map(),issues=[];
    for(const run of selected){
      const calls=run.calls.filter(call=>stationById.has(call.stationId));if(new Set(calls.map(call=>call.stationId)).size<2)continue;
      const startMinute=calls[0].minute,endMinute=Math.max(startMinute+.5,...calls.map(call=>platformWindow(call)?.endMinute??call.minute)),poolKey=`${run.operator||'--'}:${fleetClass(run.category)}`;
      if(!slotsByPool.has(poolKey))slotsByPool.set(poolKey,[]);const slots=slotsByPool.get(poolKey),originStationId=calls[0].stationId;
      let slot=slots.filter(item=>item.availableMinute<=startMinute&&item.stationId===originStationId).sort((a,b)=>a.availableMinute-b.availableMinute||a.id.localeCompare(b.id))[0];
      if(!slot){slot={id:`wtt-train-${poolKey.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${String(slots.length+1).padStart(3,'0')}`,poolKey,availableMinute:-Infinity,stationId:originStationId};slots.push(slot);}
      const trip={...run,calls,startMinute,endMinute,trainId:slot.id,poolKey};slot.availableMinute=endMinute;slot.stationId=calls.at(-1).stationId;
      for(const call of calls){
        const window=platformWindow(call);if(!window)continue;const station=stationById.get(call.stationId),rawReference=String(call.platform),reference=platformReference(station,rawReference),platformId=reference?`${station.id}:P${reference}`:null;
        call.platformId=platformId;if(!reference){if(/^\d/.test(rawReference))issues.push({code:'UNMAPPED_WTT_PLATFORM',tripId:trip.id,stationId:station.id,reference:rawReference});continue;}
        const windows=platformWindows.get(platformId)||[];for(const existing of windows)if(window.startMinute<existing.endMinute&&existing.startMinute<window.endMinute)issues.push({code:'WTT_PLATFORM_CONFLICT',platformId,tripId:trip.id,otherTripId:existing.tripId,startMinute:Math.max(window.startMinute,existing.startMinute),endMinute:Math.min(window.endMinute,existing.endMinute)});
        windows.push({...window,tripId:trip.id,trainId:trip.trainId});platformWindows.set(platformId,windows);
      }
      trips.push(trip);
    }
    const fleet=[];for(const[poolKey,slots]of[...slotsByPool].sort(([a],[b])=>a.localeCompare(b)))fleet.push({poolKey,count:slots.length,trainIds:slots.map(slot=>slot.id)});
    const eventSweep=[];trips.forEach(trip=>{eventSweep.push([trip.startMinute,1],[trip.endMinute,-1]);});eventSweep.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let active=0,peak=0;eventSweep.forEach(([,delta])=>{active+=delta;peak=Math.max(peak,active);});
    return freeze({format:'rail-form-operating-day',version:1,date,source:clone(plan.source),trips,platformWindows:Object.fromEntries([...platformWindows].sort(([a],[b])=>a.localeCompare(b))),fleet,summary:{runCount:trips.length,peakConcurrentTrains:peak,allocatedTrainCount:fleet.reduce((sum,item)=>sum+item.count,0),platformConflictCount:issues.filter(issue=>issue.code==='WTT_PLATFORM_CONFLICT').length,unmappedPlatformCount:issues.filter(issue=>issue.code==='UNMAPPED_WTT_PLATFORM').length},issues});
  }

  function activeTrips(day,minute){const value=Number(minute);return(day?.trips||[]).filter(trip=>trip.startMinute<=value&&value<=trip.endMinute);}

  function locateTrip(trip,minute){
    const calls=trip?.calls||[];if(calls.length<2)return null;const value=Number(minute);
    if(value<=calls[0].minute)return{trip,from:calls[0],to:calls[1],progress:0,atCall:calls[0]};
    for(let index=1;index<calls.length;index++){const from=calls[index-1],to=calls[index];if(value<=to.minute){const span=Math.max(.5,to.minute-from.minute),progress=Math.max(0,Math.min(1,(value-from.minute)/span));return{trip,from,to,progress,atCall:progress<=.02?from:progress>=.98?to:null};}}
    return{trip,from:calls.at(-2),to:calls.at(-1),progress:1,atCall:calls.at(-1)};
  }

  function platformOccupancy(day,minute){
    const result={};for(const[platformId,windows]of Object.entries(day?.platformWindows||{})){const active=windows.filter(window=>window.startMinute<=minute&&minute<window.endMinute).sort((a,b)=>a.startMinute-b.startMinute||a.tripId.localeCompare(b.tripId));if(active.length)result[platformId]=active[0].trainId;}
    return freeze(result);
  }

  function platformHolds(day,minute){
    const result=[];for(const[platformId,windows]of Object.entries(day?.platformWindows||{})){const active=windows.filter(window=>window.startMinute<=minute&&minute<window.endMinute).sort((a,b)=>a.startMinute-b.startMinute||a.tripId.localeCompare(b.tripId));for(const window of active.slice(1))result.push({platformId,tripId:window.tripId,trainId:window.trainId,heldForTripId:active[0].tripId});}
    return freeze(result.sort((a,b)=>a.platformId.localeCompare(b.platformId)||a.tripId.localeCompare(b.tripId)));
  }

  return{dateParts,runningDayTokens,runsOnDate,platformWindow,operatingSignature,collapseAlternatives,platformReference,buildOperatingDay,activeTrips,locateTrip,platformOccupancy,platformHolds};
});
