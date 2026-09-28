import sys,json,pathlib,numpy as np,joblib
sys.path.insert(0,"ml-service")
from app import model_evaluator as m
print("labels",m.CLASS_LABELS,flush=True)
for n,p in [("rf",m.RF_PATH),("svm",m.SVM_PATH)]:
 o=joblib.load(p); print(n,type(o),getattr(o,"classes_",None),getattr(o,"n_features_in_",None),flush=True)
m.load_models(); print("cnn",{k:v.shape for k,v in m._CNN_WEIGHTS.items()} if m._CNN_WEIGHTS else None,flush=True)
import librosa
for p in list(pathlib.Path("ml-service/data/uploads").glob("*.wav"))[:6]:
 y,s=librosa.load(str(p),sr=22050,duration=5.0); f=m.extract_tabular_features(y,s); sp=m.extract_mel_spectrogram(y,s)
 print(json.dumps({"file":p.name,"shape":list(f.shape),"mean":float(f.mean()),"std":float(f.std()),"rf":m._RF_MODEL.predict_proba(f)[0].tolist(),"svm":m._SVM_MODEL.predict_proba(f)[0].tolist(),"cnn":m.cnn_forward_pass(sp,m._CNN_WEIGHTS).tolist()}),flush=True)
