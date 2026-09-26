import {api} from './client';
export interface Prediction { classification:string; confidence:number; modelVersion?:string }
export interface AudioQuality { sampleRate?:number; duration?:number; rms?:number; status:'good'|'poor'|'unknown' }
export interface Detection { id:string; audioFilename:string; audioUrl?:string; classification?:string; confidence?:number; severity?:'low'|'medium'|'high'|'critical'; pythonPrediction?:Prediction; teachableMachinePrediction?:Prediction; modelAgreement?:'agree'|'disagree'|'manual_review'; audioQuality?:AudioQuality; status:string; source?:'upload'|'live'; sessionId?:string|null; createdAt:string }
export interface DetectionFilters { severity?:string; status?:string; source?:string; classification?:string; from?:string; to?:string; minConfidence?:number; limit?:number; offset?:number }
export const detectionsApi={list:(filters:DetectionFilters={})=>api.get<Detection[]>('/detections',{params:filters}),get:(id:string)=>api.get<Detection>(`/detections/${id}`),analyze:(audio:File)=>{const body=new FormData();body.append('audio',audio);return api.post<Detection>('/detections/analyze',body)}};
