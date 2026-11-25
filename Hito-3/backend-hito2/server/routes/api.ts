import {Router} from 'express';
import {controllers} from '../controllers/records.js';
import {RecordService} from '../services/records.js';
export function apiRoutes(service:RecordService){const r=Router(),c=controllers(service);
 for(const name of ['analisis','alertas'] as const){r.get('/'+name,c.list(name));r.get('/'+name+'/:id',c.get(name));r.delete('/'+name+'/:id',c.delete(name));}
 r.post('/analisis',c.createAnalysis);r.patch('/analisis/:id',c.note);
 r.post('/alertas',c.createAlert);r.patch('/alertas/:id',c.updateAlert);return r;}
