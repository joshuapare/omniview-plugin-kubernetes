import type { ExactParseResult } from '../../editor-controls';
/** Cilium ASN values use the complete unsigned 32-bit range, without Number conversion. */
export function parseCiliumInteger(name: string, value: string): ExactParseResult {
 if (!/^\d+$/.test(value)) return {valid:false,error:'Enter a whole number.'};
 const number=BigInt(value);
 const maximum=name.endsWith('ASN') ? 4294967295n : name.endsWith('Port') ? 65535n : name==='maskSize' ? 128n : 2147483647n;
 if (number>maximum) return {valid:false,error:`Maximum is ${maximum}.`};
 if (name.endsWith('Port') && number===0n) return {valid:false,error:'Port must be between 1 and 65535.'};
 return {valid:true,value:number};
}
