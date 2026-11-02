/* Display-unit adapter. The machining math and estimate schema stay canonical millimeters. */
export const MM_PER_INCH=25.4;
export const UNIT_FIELDS=Object.freeze({
 width:"length",height:"length",allowance:"length",diameter:"length",stepdown:"length",clearance:"length",
 feed:"speed",plunge:"speed",rapid:"speed",cutlength:"length",cutspeed:"speed"
});
export const UNIT_LABELS=Object.freeze({length:{in:"in",mm:"mm"},speed:{in:"in/min",mm:"mm/min"}});
export function assertUnit(unit){if(unit!=="in"&&unit!=="mm")throw Error("Unknown length unit");return unit;}
export function toMm(value,unit){assertUnit(unit);const mm=Number(value)*(unit==="in"?MM_PER_INCH:1);return unit==="in"&&Number.isFinite(mm)?Number(mm.toFixed(6)):mm;}
export function fromMm(value,unit){assertUnit(unit);return Number(value)/(unit==="in"?MM_PER_INCH:1);}
export function convertDisplay(value,from,to){
 assertUnit(from);assertUnit(to);
 return Number((Number(value)*(from===to?1:from==="mm"?1/MM_PER_INCH:MM_PER_INCH)).toFixed(to==="mm"?6:8));
}
export function displayNumber(value,unit,digits=4){
 assertUnit(unit);return Number(fromMm(value,unit)).toLocaleString("en-US",{maximumFractionDigits:digits});
}
