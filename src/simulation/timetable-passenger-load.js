(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RailTimetablePassengerLoad=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const ENTRY_CALLS=Object.freeze({
    'CARDIFF CENTRAL':[['cardiff-central',-22]],
    'SWANSEA':[['swansea',-70],['cardiff-central',-22]],
    'CARMARTHEN':[['carmarthen',-105],['swansea',-70],['cardiff-central',-22]],
    'PEMBROKE DOCK':[['pembroke-dock',-190],['whitland',-125],['carmarthen',-105],['swansea',-70],['cardiff-central',-22]]
  });
  const key=(originId,destinationId)=>`${originId}>${destinationId}`;
  const stopCalls=trip=>(trip?.calls||[]).filter(call=>call.action==='stop');

  function augmentedStops(trip){
    const visible=stopCalls(trip).map(call=>({stationId:call.stationId,minute:Number(call.minute),external:false}));if(!visible.length)return visible;
    const before=ENTRY_CALLS[String(trip.origin||'').toUpperCase()]||[],after=ENTRY_CALLS[String(trip.destination||'').toUpperCase()]||[];
    return[
      ...before.map(([stationId,offset])=>({stationId,minute:visible[0].minute+offset,external:true})),
      ...visible,
      ...[...after].reverse().map(([stationId,offset])=>({stationId,minute:visible.at(-1).minute-offset,external:true}))
    ].filter((call,index,array)=>!index||call.stationId!==array[index-1].stationId);
  }

  function inferredCapacity(trip){
    if(trip?.category!=='passenger')return 0;
    const timing=String(trip.timingLoad||'').toUpperCase(),span=Number(trip.endMinute)-Number(trip.startMinute),stops=stopCalls(trip).length;
    if(['800','802'].includes(timing)||trip.operator==='GW'&&span>=75&&stops<=12)return 650;
    if(trip.operator==='XR'||timing==='387')return 454;
    // TfW's CIF timing load describes the timed traction, not an authoritative
    // formation. These values are conservative planning estimates for the
    // common two/three-car fleets until allocation/consist data is installed.
    if(trip.operator==='AW'){
      if(timing==='197')return 188;
      if(timing==='245')return 170;
      if(timing==='S')return 150;
      if(timing==='E')return 180;
      return 170;
    }
    if(span>=90)return 480;
    return 300;
  }

  function buildServiceIndex(trips){
    const events=new Map();
    for(const trip of trips||[]){if(trip.category!=='passenger')continue;const calls=augmentedStops(trip);for(let origin=0;origin<calls.length-1;origin++)for(let destination=origin+1;destination<calls.length;destination++){const id=key(calls[origin].stationId,calls[destination].stationId),list=events.get(id)||[];list.push({tripId:trip.id,minute:calls[origin].minute});events.set(id,list);}}
    for(const list of events.values())list.sort((a,b)=>a.minute-b.minute||a.tripId.localeCompare(b.tripId));
    return events;
  }

  function serviceHeadway(index,originId,destinationId,tripId,minute){
    const list=index.get(key(originId,destinationId))||[],same=list.filter(event=>event.minute===minute),distinct=[...new Set(list.map(event=>event.minute))],position=distinct.indexOf(minute);if(!same.some(event=>event.tripId===tripId)||position<0)return 60;
    const previous=distinct[position-1],next=distinct[position+1],gap=Number.isFinite(previous)?minute-previous:Number.isFinite(next)?next-minute:60;
    return Math.max(5,Math.min(180,gap))/Math.max(1,same.length);
  }

  function estimate(trip,location,options){
    if(trip?.category!=='passenger'||!location)return{passengers:{},capacity:0,rawPassengers:0,loadFactor:0};
    const calls=augmentedStops(trip),currentMinute=Number(location.from.minute)+(Number(location.to.minute)-Number(location.from.minute))*Number(location.progress||0),fromIndex=Math.max(0,calls.reduce((latest,call,index)=>call.minute<currentMinute-.001?index:latest,-1)),raw={},rawOrigins={};let total=0;
    for(let origin=0;origin<=fromIndex;origin++)for(let destination=fromIndex+1;destination<calls.length;destination++){
      const annual=Number(options.annualFlow(calls[origin].stationId,calls[destination].stationId)||0);if(!annual)continue;
      const minute=((calls[origin].minute%1440)+1440)%1440,temporal=Number(options.temporalMultiplier(options.dayIndex,minute*60)),headway=serviceHeadway(options.serviceIndex,calls[origin].stationId,calls[destination].stationId,trip.id,calls[origin].minute),count=annual/options.secondsPerYear*temporal*headway*60;if(count<=0)continue;
      raw[calls[destination].stationId]=(raw[calls[destination].stationId]||0)+count;rawOrigins[calls[origin].stationId]=(rawOrigins[calls[origin].stationId]||0)+count;total+=count;
    }
    const capacity=inferredCapacity(trip),scale=total>capacity?capacity/total:1,passengers={};for(const[destinationId,count]of Object.entries(raw)){const rounded=Math.round(count*scale);if(rounded)passengers[destinationId]=rounded;}
    const originBoardings={};for(const[originId,count]of Object.entries(rawOrigins)){const rounded=Math.round(count*scale);if(rounded)originBoardings[originId]=rounded;}const onboard=Object.values(passengers).reduce((sum,count)=>sum+count,0);return{passengers,originBoardings,capacity,rawPassengers:total,loadFactor:capacity?onboard/capacity:0};
  }

  return Object.freeze({ENTRY_CALLS,augmentedStops,inferredCapacity,buildServiceIndex,serviceHeadway,estimate});
});
