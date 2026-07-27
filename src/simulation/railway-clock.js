(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.RailwayClock=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const DAY_SECONDS=86400,WEEK_SECONDS=DAY_SECONDS*7,DAY_NAMES=Object.freeze(['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']);

  function parseDate(value){
    const match=String(value||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);if(!match)throw new TypeError('Railway clock date must use YYYY-MM-DD.');
    const date=new Date(Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3])));if(Number.isNaN(date.getTime())||date.toISOString().slice(0,10)!==value)throw new TypeError('Railway clock date is invalid.');return date;
  }
  function parseTime(value){
    const match=String(value||'').match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);if(!match)throw new TypeError('Railway clock time must use HH:MM or HH:MM:SS.');
    const hour=Number(match[1]),minute=Number(match[2]),second=Number(match[3]||0);if(hour>23||minute>59||second>59)throw new RangeError('Railway clock time is invalid.');return hour*3600+minute*60+second;
  }
  function isoDate(date){return date.toISOString().slice(0,10);}
  function addDays(date,days){return new Date(date.getTime()+days*DAY_SECONDS*1000);}
  function mondayFor(date){const mondayOffset=(date.getUTCDay()+6)%7;return addDays(date,-mondayOffset);}
  function positiveModulo(value,modulus){return((value%modulus)+modulus)%modulus;}
  function pad(value){return String(value).padStart(2,'0');}

  function createClock(options={}){
    const operatingDate=String(options.operatingDate||'2026-07-23'),date=parseDate(operatingDate),startSecond=parseTime(options.startTime||'07:00:00'),stepSeconds=Number(options.stepSeconds??15);
    const stepsPerWeek=WEEK_SECONDS/stepSeconds;
    if(!Number.isFinite(stepSeconds)||stepSeconds<=0||!Number.isSafeInteger(stepsPerWeek))throw new RangeError('Railway clock stepSeconds must be a positive divisor of one week.');
    const weekStartDate=isoDate(mondayFor(date)),startDayIndex=(date.getUTCDay()+6)%7,startWeekSecond=startDayIndex*DAY_SECONDS+startSecond;
    return Object.freeze({version:1,weekStartDate,operatingDate,startTime:options.startTime||'07:00:00',stepSeconds,startWeekSecond,stepsPerWeek});
  }

  function atStep(clock,step){
    if(!clock||clock.version!==1)throw new TypeError('A railway clock configuration is required.');if(!Number.isSafeInteger(step)||step<0)throw new RangeError('Railway clock step must be a non-negative safe integer.');
    const elapsedSeconds=step*clock.stepSeconds,absoluteSecond=clock.startWeekSecond+elapsedSeconds,weekIndex=Math.floor(absoluteSecond/WEEK_SECONDS),weekSecond=positiveModulo(absoluteSecond,WEEK_SECONDS),dayIndex=Math.floor(weekSecond/DAY_SECONDS),secondOfDay=weekSecond-dayIndex*DAY_SECONDS,hour=Math.floor(secondOfDay/3600),minute=Math.floor((secondOfDay%3600)/60),second=secondOfDay%60,date=isoDate(addDays(parseDate(clock.weekStartDate),dayIndex));
    return Object.freeze({step,weekIndex,weekSecond,dayIndex,weekday:DAY_NAMES[dayIndex],date,hour,minute,second,secondOfDay,minuteOfDay:secondOfDay/60,time:`${pad(hour)}:${pad(minute)}:${pad(second)}`});
  }

  function previousDate(clock,instant){const index=positiveModulo(instant.dayIndex-1,7);return isoDate(addDays(parseDate(clock.weekStartDate),index));}
  function scheduleWindow(clock,step){const current=atStep(clock,step);return Object.freeze({current,serviceDate:current.date,minute:current.minuteOfDay,previousServiceDate:previousDate(clock,current),previousMinute:current.minuteOfDay+1440});}
  function format(instant,options={}){const includeSeconds=options.seconds!==false,time=includeSeconds?`${pad(instant.hour)}:${pad(instant.minute)}:${pad(Math.floor(instant.second))}`:`${pad(instant.hour)}:${pad(instant.minute)}`;return`${instant.weekday.slice(0,3).toUpperCase()} ${time}`;}

  return{DAY_SECONDS,WEEK_SECONDS,DAY_NAMES,createClock,atStep,scheduleWindow,format};
});
