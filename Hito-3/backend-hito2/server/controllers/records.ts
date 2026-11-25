import type {Request,Response} from 'express';
import {RecordService} from '../services/records.js';
import {analysisInput,analysisPatch,alertInput,alertPatch,idInput,paging} from '../services/validation.js';
export function controllers(s:RecordService){return {
 list:(r:'analisis'|'alertas')=>async(req:Request,res:Response)=>{const p=paging(req.query);res.json({data:await s.list(r,p.limit,p.offset),...p});},
 get:(r:'analisis'|'alertas')=>async(req:Request,res:Response)=>res.json({data:await s.get(r,idInput(req.params.id))}),
 createAnalysis:async(req:Request,res:Response)=>{
  const header=req.get('Idempotency-Key');
  const {data,replayed}=await s.createAnalysis(analysisInput(req.body),header===undefined?undefined:idInput(header).toLowerCase());
  res.location('/api/v1/analisis/'+data.id).status(replayed?200:201).json({data});
 },
 note:async(req:Request,res:Response)=>res.json({data:await s.note(idInput(req.params.id),analysisPatch.parse(req.body).nota)}),
 createAlert:async(req:Request,res:Response)=>{const data=await s.createAlert(alertInput.parse(req.body).analisis_id);res.location('/api/v1/alertas/'+data.id).status(201).json({data});},
 updateAlert:async(req:Request,res:Response)=>res.json({data:await s.updateAlert(idInput(req.params.id),alertPatch.parse(req.body))}),
 delete:(r:'analisis'|'alertas')=>async(req:Request,res:Response)=>{await s.delete(r,idInput(req.params.id));res.status(204).end();}
};}
