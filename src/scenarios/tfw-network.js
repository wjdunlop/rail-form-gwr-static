(function (root, factory) {
  const common = typeof module === 'object' && module.exports;
  const value = factory(
    common ? require('./schema.js') : root.RailScenarioSchema,
    common ? require('./geographic-mapping.js') : root.RailGeographicMapping,
    common ? require('./maps/tfw-network.exact.js') : root.RailTfWExactMap,
    common ? require('./maps/tfw-network.stations.js') : root.RailTfWStationMap,
    common ? require('./maps/tfw-network.cif.js') : root.RailTfWCIF,
    common ? require('../simulation/od-demand.js') : root.RailODDemand,
    common ? require('./maps/tfw-network.odm.js') : root.RailTfWPassengerDemand
  );
  if (common) module.exports = value;
  else root.RailTfWScenario = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Schema, GeographicMapping, ExactMap, StationMap, WorkingTimetable, ODDemand, PassengerDemand) {
  'use strict';

  const sources = Object.freeze([
    'https://tfw.wales/places/our-network-map',
    'https://tfw.wales/service-status/timetables',
    'https://www.networkrail.co.uk/industry-and-commercial/the-timetable/working-timetable/',
    'https://raildata.org.uk/',
    'https://dataportal.orr.gov.uk/statistics/usage/regional-rail-usage/',
    'https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv'
  ]);
  const colours=['#c92f3b','#356f8a','#657c43','#9b633e','#735b91','#ad7d22','#47766f','#914e6b'];
  const transform=ExactMap.transform;
  const project=coordinate=>({
    x:Math.round((coordinate[0]-transform.origin[0])*transform.scale[0]+transform.translate[0]),
    y:Math.round((transform.origin[1]-coordinate[1])*transform.scale[1]+transform.translate[1])
  });
  const occupied=[];
  function reserve(coordinate){const point=project(coordinate);let attempt=0;while(occupied.some(other=>Math.abs(other.x-point.x)<3&&Math.abs(other.y-point.y)<3)){point.y+=3;if(++attempt%5===0)point.x+=3;}occupied.push(point);return point;}
  const annualByOrigin=new Map();
  for(const[origin,,journeys]of PassengerDemand.flows)annualByOrigin.set(origin,(annualByOrigin.get(origin)||0)+journeys);
  const stationDegree=new Map();
  for(const corridor of ExactMap.corridors)for(const id of[corridor.aId,corridor.bId])stationDegree.set(id,(stationDegree.get(id)||0)+1);
  const stations=StationMap.stations.map(source=>{const{x,y}=reserve(source.coordinates),annual=annualByOrigin.get(source.id)||0;return{
    id:source.id,cityId:`city-${source.id}`,name:source.name,short:source.short,kind:'city-station',x,y,area:{x:x-1,y:y-1,w:2,h:2},timetableManaged:true,allowThroughRouting:true,
    layout:{kind:(stationDegree.get(source.id)||0)<=1?'terminus':'through',axis:'horizontal'},platformRefs:[...source.platformRefs],platformCount:source.platformCount,
    geography:{longitude:source.coordinates[0],latitude:source.coordinates[1],source:'Network Rail CIF station registry and GTCL attachment'},
    color:colours[Math.abs(source.id.split('').reduce((sum,value)=>sum+value.charCodeAt(0),0))%colours.length],
    population:Math.max(1000,Math.round(Math.sqrt(annual||25000)*150))
  };});
  const byId=new Map(stations.map(station=>[station.id,station]));
  const cities=stations.map(station=>({id:station.cityId,stationId:station.id,population:station.population,baseDemand:Math.max(2,Math.round(Math.sqrt(station.population)/18))}));

  function flowingPolyline(a,b){const points=[{x:a.x,y:a.y}],dx=b.x-a.x,dy=b.y-a.y,steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))/8));for(let index=1;index<steps;index++)points.push({x:Math.round(a.x+dx*index/steps),y:Math.round(a.y+dy*index/steps)});points.push({x:b.x,y:b.y});return points.filter((point,index)=>!index||point.x!==points[index-1].x||point.y!==points[index-1].y);}
  function offset(points,amount){return points.map((point,index)=>{const prior=points[Math.max(0,index-1)],next=points[Math.min(points.length-1,index+1)],dx=next.x-prior.x,dy=next.y-prior.y,length=Math.hypot(dx,dy)||1;return{x:Math.round(point.x-dy/length*amount),y:Math.round(point.y+dx/length*amount)};});}
  const trackPolylines=[];
  for(const corridor of ExactMap.corridors){const base=flowingPolyline(byId.get(corridor.aId),byId.get(corridor.bId));trackPolylines.push(base,offset(base,-1),offset(base,1));}
  for(const station of stations)for(const x of[station.area.x-2,station.area.x+station.area.w+1])trackPolylines.push([{x,y:station.y-3},{x,y:station.y+3}]);

  const services=StationMap.serviceFamilies.map((stopIds,index)=>({
    id:`tfw-family-${String(index+1).padStart(2,'0')}`,number:index+1,
    name:`${byId.get(stopIds[0]).name} – ${byId.get(stopIds.at(-1)).name}`,
    stopIds:[...stopIds],calls:stopIds.map((stationId,callIndex)=>({stationId,type:callIndex&&callIndex<stopIds.length-1?'regular':'terminal'})),
    color:colours[index%colours.length],serviceClass:'regional',operator:'Transport for Wales',operatingMode:'reverse',
    allocation:{locomotives:1,passengerCars:2},operatingPattern:{mode:'timetable',intervalTicks:24,minimumConnectionTicks:4}
  }));
  const initialQueues=ODDemand.seedQueues(PassengerDemand,220);
  const fleet={locomotives:services.length,passengerCars:services.length*2};
  const maximumX=Math.max(...stations.map(station=>station.x))+20,maximumY=Math.max(...stations.map(station=>station.y))+20;

  return Schema.defineScenario({
    id:'tfw-network',name:'Transport for Wales: Full Network',
    description:'Analyse the complete seven-day Transport for Wales rail plan across Wales and its cross-border routes to Liverpool, Manchester, Birmingham and Cheltenham.',
    difficulty:'advanced',learningGoals:['Whole-network TfW operations','South Wales Metro demand','Cambrian and rural-line resilience','Cross-border service regulation','Passenger interchange analysis'],
    seed:'rail-form-tfw-full-network',sources,grid:{cols:Math.max(460,maximumX),rows:Math.max(320,maximumY)},credits:6000,fleet,
    stations,cities,trackPolylines,visualTrackGeometry:GeographicMapping.normalize(ExactMap,stations.map(station=>station.id)),
    workingTimetable:WorkingTimetable,services,initialQueues,passengerDemand:PassengerDemand,
    metadata:{sourceChecked:'2026-07-31',atocCode:'AW',runtimeMode:'timetable-analysis',scope:'Every TfW rail working and mapped station in the pinned 20–26 July 2026 CIF week.',
      geographicCaveat:`${ExactMap.source.selection.fallbackCorridors} of ${ExactMap.source.selection.corridors} station-pair corridors remain explicit provisional anchor-gap geometry.`}
  });
});
