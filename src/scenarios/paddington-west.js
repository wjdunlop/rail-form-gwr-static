(function (root, factory) {
  const common = typeof module === 'object' && module.exports;
  const value = factory(common ? require('./schema.js') : root.RailScenarioSchema,common ? require('./geographic-mapping.js') : root.RailGeographicMapping,common ? require('./track-geometry-composition.js') : root.RailTrackGeometryComposition,common ? require('./gtcl-corridor-composition.js') : root.RailGTCLCorridorComposition,common ? require('./station-geographic-mapping.js') : root.RailStationGeographicMapping,common ? require('./sectional-appendix.js') : root.RailSectionalAppendix,common ? require('./maps/paddington-west.mapping.js') : root.RailPaddingtonWestTrackMap,common ? require('./maps/paddington-west.gtcl-routed.js') : root.RailPaddingtonWestGTCLRouted,common ? require('./maps/paddington-west.gtcl-topology.js') : root.RailPaddingtonWestGTCLTopology,common ? require('./maps/paddington-west.stations.js') : root.RailPaddingtonWestStationMap,common ? require('./maps/paddington-west.cif.js') : root.RailPaddingtonWestCIF,common ? require('./maps/paddington-west.nesa.js') : root.RailPaddingtonWestNESA,common ? require('../simulation/od-demand.js') : root.RailODDemand,common ? require('./maps/paddington-west.odm.js') : root.RailPaddingtonWestPassengerDemand,common ? require('./maps/paddington-west.external-demand.js') : root.RailPaddingtonWestExternalDemand);
  if (typeof module === 'object' && module.exports) module.exports = value;
  else root.RailPaddingtonWestScenario = value;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Schema,GeographicMapping,TrackGeometryComposition,GTCLCorridorComposition,StationGeographicMapping,SectionalAppendix,TrackMap,GTCLMap,GTCLTopology,StationMap,WorkingTimetable,NESA,ODDemand,PassengerDemand,ExternalPassengerDemand) {
  'use strict';

  // Official references used for the simplified topology and service families:
  // Network Rail describes the Great Western Main Line from Paddington to Bristol/South Wales and branches towards the Cotswolds.
  // https://www.networkrail.co.uk/our-work/our-routes/western/
  // GWR's current timetable index identifies London–Oxford, London–Worcester/Hereford, and Bristol–Cheltenham/Worcester service groups.
  // https://www.gwr.com/travel-information/train-times
  // GWR's official network map supplies the station ordering around Didcot, Oxford, Worcester, Hereford, Bristol and Newport.
  // https://www.gwr.com/stations-and-destinations/stations
  const sources=Object.freeze([
    'https://www.networkrail.co.uk/our-work/our-routes/western/',
    'https://www.gwr.com/travel-information/train-times',
    'https://www.gwr.com/-/media/gwr-sc-website/files/timetables/may-26-december-26/T10-train-times-17-May-to-12-December-2026.pdf',
    'https://www.gwr.com/-/media/gwr-sc-website/files/timetables/may-26-december-26/T8-train-times-17-May-to-12-December-2026-v2.pdf',
    'https://www.gwr.com/-/media/gwr-sc-website/files/timetables/may-26-december-26/T6-train-times-17-May-to-12-December-2026-v2.pdf',
    'https://www.gwr.com/-/media/gwr-sc-website/files/timetables/may-26-december-26/B7-train-times-17-May-to-12-December-2026-v2.pdf',
    'https://www.gwr.com/stations-and-destinations/stations',
    'https://naptan.api.dft.gov.uk/v1/access-nodes?dataFormat=csv',
    'https://download.geofabrik.de/europe/great-britain-260722.osm.pbf',
    'https://github.com/openraildata/network-rail-gis/releases/tag/20230711-01',
    'https://www.networkrail.co.uk/industry-and-commercial/the-timetable/working-timetable/',
    'https://www.networkrail.co.uk/wp-content/uploads/2025/02/01.-June-2026-December-2026-Working-timetable-documents.zip',
    'https://www.networkrail.co.uk/industry-and-commercial/information-for-operators/national-electronic-sectional-appendix/',
    'https://www.openstreetmap.org/copyright',
    'https://dataportal.orr.gov.uk/statistics/usage/regional-rail-usage/'
  ]);
  const transform=TrackMap.transform;
  const project=(longitude,latitude)=>({x:Math.round((longitude+3.15)*68)+8,y:Math.round((52.30-latitude)*96)+8});
  const occupiedOperationalPoints=[];
  const reserveOperationalPoint=(longitude,latitude)=>{const point=project(longitude,latitude);while(occupiedOperationalPoints.some(other=>Math.abs(other.x-point.x)<3&&Math.abs(other.y-point.y)<3))point.y+=3;occupiedOperationalPoints.push(point);return point;};
  const stationOverrides={
    paddington:{population:8900000,color:'#345995',layout:{kind:'terminus',axis:'horizontal'}},
    slough:{population:164000,color:'#6c8ebf'},reading:{population:350000,color:'#345995'},didcot:{population:32000,color:'#789f54'},
    swindon:{population:233000,color:'#d1933c'},chippenham:{population:36000,color:'#81959a'},'bath-spa':{population:101000,color:'#a35d8d'},
    'bristol-parkway':{population:145000,color:'#a35d8d'},newport:{population:160000,color:'#c45252'},
    'bristol-temple-meads':{population:480000,color:'#a35d8d'},oxford:{population:165000,color:'#789f54'},
    worcester:{population:104000,color:'#d1933c'},hereford:{population:55000,color:'#c45252'},kemble:{population:1100,color:'#8b6f9e'},
    stroud:{population:27000,color:'#8b6f9e'},cheltenham:{population:119000,color:'#6c8ebf'},gloucester:{population:132000,color:'#6d8791'}
  };
  const stations=StationMap.stations.map(mapped=>{const [longitude,latitude]=mapped.coordinates,{x,y}=reserveOperationalPoint(longitude,latitude),override=stationOverrides[mapped.id]||{},platformRefs=[...mapped.platformRefs];return{
    id:mapped.id,cityId:`city-${mapped.id}`,name:mapped.name,short:mapped.short,kind:'city-station',x,y,area:{x:x-1,y:y-1,w:2,h:2},
    layout:override.layout||{kind:'through',axis:'horizontal'},platformRefs,platformCount:platformRefs.length,
    geography:{longitude,latitude,source:'Pinned GWR/OSM station catalog'},color:override.color||'#6d8791',
    population:override.population||12000
  };});
  const visualStationGeometry=StationGeographicMapping.normalize(StationMap,TrackMap,stations.map(station=>station.id));
  const routedMap=GTCLCorridorComposition.compose(TrackMap,GTCLTopology);
  const visualMap=TrackGeometryComposition.compose(routedMap,GTCLMap);
  function flowingPolyline(a,b){const direction=Math.sign(b.x-a.x)||1,lead=3,start={x:a.x,y:a.y},first={x:a.x+direction*lead,y:a.y},last={x:b.x-direction*lead,y:b.y},points=[start,first],spanX=last.x-first.x,spanY=last.y-first.y,stages=Math.max(1,Math.ceil(Math.max(Math.abs(spanX),Math.abs(spanY))/8));for(let stage=1;stage<=stages;stage++)points.push({x:Math.round(first.x+spanX*stage/stages),y:Math.round(first.y+spanY*stage/stages)});points.push({x:b.x,y:b.y});return points.filter((point,index)=>!index||point.x!==points[index-1].x||point.y!==points[index-1].y);}
  function offsetPolyline(points,offset){const shifted=[],push=point=>{const previous=shifted.at(-1);if(!previous||previous.x!==point.x||previous.y!==point.y)shifted.push(point);};for(let index=0;index<points.length-1;index++){const a=points[index],b=points[index+1],horizontal=a.y===b.y,start=horizontal?{x:a.x,y:a.y+offset}:{x:a.x+offset,y:a.y},end=horizontal?{x:b.x,y:b.y+offset}:{x:b.x+offset,y:b.y};push(start);push(end);}return shifted;}
  function corridorPlan(edges){const byId=new Map(stations.map(station=>[station.id,station])),polylines=[];for(const[aId,bId,profile='pair']of edges){const base=flowingPolyline(byId.get(aId),byId.get(bId)),offsets=profile==='quad'?[-3,-1,1,3]:profile==='single'?[0]:[-1,1];for(const offset of offsets)polylines.push(offsetPolyline(base,offset));}for(const station of stations)for(const x of[station.area.x-2,station.area.x+station.area.w+1])polylines.push([{x,y:station.y-3},{x,y:station.y+3}]);return polylines;}
  const cities=stations.map(station=>({id:station.cityId,stationId:station.id,population:station.population,baseDemand:Math.max(2,Math.round(Math.sqrt(station.population)/12))}));
  const call=(stationId,type='regular')=>({stationId,type});
  const service=(id,number,name,stops,cars,headway,color,callTypes={})=>({id,number,name,stopIds:stops,color,operatingMode:'reverse',patternId:`western-${headway}`,
    calls:stops.map(stationId=>call(stationId,callTypes[stationId]||'regular')),allocation:{locomotives:1,passengerCars:cars},
    operatingPattern:{mode:'timer',intervalTicks:headway},acceptsFreight:false});
  const services=[
    service('western-thames-local',1,'Thames Valley Local',['paddington','ealing-broadway','southall','hayes-harlington','west-drayton','iver','langley','slough','burnham','taplow','maidenhead','twyford','reading','tilehurst','pangbourne','goring-streatley','cholsey','didcot'],2,12,'#5d78b8'),
    service('western-oxford-fast',2,'Oxford Fast',['paddington','reading','didcot','oxford'],2,16,'#4d846b',{reading:'express',didcot:'express'}),
    service('western-oxford-stopping',3,'Oxford Canal Local',['reading','tilehurst','pangbourne','goring-streatley','cholsey','didcot','appleford','culham','radley','oxford'],2,16,'#789f54'),
    service('western-cotswold',4,'Cotswold & Malverns',['paddington','reading','oxford','hanborough','combe','finstock','charlbury','ascott-under-wychwood','shipton','kingham','moreton-in-marsh','honeybourne','evesham','pershore','worcestershire-parkway','worcester','worcester-foregate-street','malvern-link','great-malvern','colwall','ledbury','hereford'],3,24,'#d49a32',{reading:'express',oxford:'express'}),
    service('western-south-wales',5,'South Wales Main Line',['paddington','reading','swindon','bristol-parkway','severn-tunnel-junction','newport'],3,16,'#ed5d37',{reading:'express',swindon:'express'}),
    service('western-bristol',6,'Bristol Intercity',['paddington','reading','swindon','chippenham','bath-spa','bristol-temple-meads'],3,16,'#b06ca3',{reading:'express',swindon:'express'}),
    service('western-bath-local',7,'Bristol & Bath Local',['bristol-temple-meads','keynsham','oldfield-park','bath-spa','chippenham'],2,16,'#a35d8d'),
    service('western-severn-regional',8,'Severn Regional',['bristol-temple-meads','lawrence-hill','stapleton-road','ashley-down','filton-abbey-wood','bristol-parkway','yate','cam-dursley','gloucester','cheltenham','ashchurch-for-tewkesbury','worcestershire-parkway','worcester'],2,20,'#81959a'),
    service('western-bristol-south-wales',9,'Bristol–Newport Local',['bristol-temple-meads','lawrence-hill','stapleton-road','ashley-down','filton-abbey-wood','patchway','pilning','severn-tunnel-junction','newport'],2,20,'#c45252'),
    service('western-cheltenham',10,'Golden Valley Express',['paddington','reading','didcot','swindon','kemble','stroud','stonehouse','gloucester','cheltenham','ashchurch-for-tewkesbury','worcestershire-parkway','worcester'],2,20,'#8b6f9e',{reading:'express',didcot:'express',swindon:'express',gloucester:'express'})
  ];
  const initialQueues=ODDemand.seedQueues(PassengerDemand,300);
  const corridorIds=TrackMap.corridors.map(corridor=>[corridor.aId,corridor.bId].sort().join('|'));
  const operationalTopology=SectionalAppendix.normalize(NESA,corridorIds);
  const corridorEdges=TrackMap.corridors.map(corridor=>{const rule=SectionalAppendix.ruleFor(operationalTopology,corridor.aId,corridor.bId);return[corridor.aId,corridor.bId,rule?.physicalRoads===1?'single':corridor.profile||'pair'];});

  return Schema.defineScenario({
    id:'paddington-west',name:'Paddington & the Western',description:'Build capacity and manage passenger connections from Paddington to Oxford, the Cotswolds, Bristol and South Wales.',
    difficulty:'advanced',learningGoals:['Great Western trunk capacity','Oxford and Cotswold connections','Bristol and South Wales routing','Passenger interchange resilience'],
    seed:'rail-form-paddington-west',sources,grid:{cols:1120,rows:600},credits:2400,
    fleet:{locomotives:10,passengerCars:23},stations,cities,
    timetablePatterns:[
      {id:'western-12',headwayTicks:12,dwellTicks:2,layoverTicks:4,turnaroundTicks:3},
      {id:'western-16',headwayTicks:16,dwellTicks:2,layoverTicks:5,turnaroundTicks:4},
      {id:'western-20',headwayTicks:20,dwellTicks:2,layoverTicks:5,turnaroundTicks:4},
      {id:'western-24',headwayTicks:24,dwellTicks:2,layoverTicks:6,turnaroundTicks:5}
    ],
    // Operations retain a deterministic grid projection; display and routed flow use current exact-node OSM tracks.
    trackPolylines:corridorPlan(corridorEdges),visualTrackGeometry:GeographicMapping.normalize(visualMap,stations.map(station=>station.id)),visualStationGeometry,workingTimetable:WorkingTimetable,operationalTopology,
    services,initialQueues,passengerDemand:PassengerDemand,externalPassengerDemand:ExternalPassengerDemand
  });
});
