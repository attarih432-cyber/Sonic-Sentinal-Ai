from pathlib import Path
import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch,FancyArrowPatch
import csv,wave,re
root=Path(r"E:\SonicSentinel AI"); doc=root/"documentation"
for d in ["diagrams","graphs","screenshots","model-evidence","dataset","testing"]:(doc/d).mkdir(parents=True,exist_ok=True)
main=(root/"ml-service/app/main.py").read_text(encoding="utf-8")
routes=[]
for m in re.finditer(r'@app\.(get|post|put|patch|delete)\("([^"]+)"(?:,\s*status_code=(\d+))?',main):routes.append((m.group(1).upper(),m.group(2),m.group(3) or "200"))
lines=["# API Documentation","","Source: ml-service/app/main.py (inspected).","","| Method | Path | Success status |","|---|---|---|"]
for a,b,c in routes:lines.append(f"| {a} | {b} | {c} |")
(doc/"API_DOCUMENTATION.md").write_text("\n".join(lines)+"\n",encoding="utf-8")
uploads=list((root/"ml-service/data/uploads").glob("*")); wav=[p for p in uploads if p.suffix.lower()==".wav"]; rows=[]
for p in wav:
 try:
  with wave.open(str(p),"rb") as wf: rows.append([p.name,wf.getnchannels(),wf.getframerate(),wf.getnframes(),wf.getsampwidth()])
 except: rows.append([p.name,"UNREADABLE","","",""])
with (doc/"dataset/audio-inventory.csv").open("w",newline="",encoding="utf-8") as f:
 w=csv.writer(f);w.writerow(["file","channels","sample_rate_hz","frames","sample_width_bytes"]);w.writerows(rows)
(doc/"dataset/dataset-summary.md").write_text(f"# Dataset Summary\n\nRuntime upload inventory inspected from ml-service/data/uploads.\n\n- WAV files found: {len(wav)}\n- Other upload files: {len(uploads)-len(wav)}\n- Labels, training provenance, class counts, duplicates, and split metadata: PENDING VERIFICATION.\n\nSee dataset/audio-inventory.csv for observed WAV metadata.\n",encoding="utf-8")
(doc/"dataset/dataset-card.md").write_text("# Dataset Card\n\nThe repository contains runtime uploads, not a labelled training manifest. Source, licensing, taxonomy, duplicate groups, and split policy are PENDING VERIFICATION.\n",encoding="utf-8")
(doc/"dataset/data-dictionary.md").write_text("# Data Dictionary\n\nThe inventory CSV records filename, channels, sample rate, frames, and sample width. Labels and extracted features are PENDING VERIFICATION.\n",encoding="utf-8")
(doc/"dataset/quality-report.md").write_text(f"# Quality Report\n\nObserved WAV uploads: {len(wav)}. Label balance, corruption manifest, and noise robustness are PENDING VERIFICATION.\n",encoding="utf-8")
(doc/"dataset/class-distribution.csv").write_text("status,reason\nPENDING VERIFICATION,No labelled class metadata found\n",encoding="utf-8")
for n in ["rf-results.csv","svm-results.csv","cnn-results.csv","model-comparison.csv","test-predictions.csv"]:(doc/"model-evidence"/n).write_text("status,reason\nRESULTS PENDING,No saved training/evaluation artifact is present\n",encoding="utf-8")
(doc/"model-evidence/model-evaluation.md").write_text("# Model Evaluation\n\nRESULTS PENDING — model training/evaluation evidence is not currently available. No RF, SVM, CNN metrics or confusion matrices are present.\n",encoding="utf-8")
tests={"test-plan.md":"# Test Plan\n\nScope: frontend, auth, analysis, live monitoring, alerts, reviews, reports, admin, API health, and ML integration.\n","test-results.md":"# Test Results\n\nFrontend build verified with npm run build. Full functional execution is PENDING VERIFICATION.\n","functional-tests.md":"# Functional Tests\n\nRoute-by-route browser execution: PENDING VERIFICATION.\n","api-tests.md":"# API Tests\n\nFastAPI endpoint test output: PENDING VERIFICATION.\n","authentication-tests.md":"# Authentication Tests\n\nRegister/login/logout/reset and protected route output: PENDING VERIFICATION.\n","ml-tests.md":"# ML Tests\n\nModel inference/evaluation output: PENDING VERIFICATION.\n","integration-tests.md":"# Integration Tests\n\nFrontend-to-FastAPI and persistence output: PENDING VERIFICATION.\n"}
for n,t in tests.items():(doc/"testing"/n).write_text(t,encoding="utf-8")
(doc/"screenshots/README.md").write_text("# Screenshot Evidence\n\nNo automated browser captures are stored. Required captures: landing, login, signup, dashboard, upload, prediction, alerts, history, reports, live microphone, manual review, and admin dashboard.\n",encoding="utf-8")
names=["architecture","use-case","dfd-level-0","dfd-level-1","activity-diagram","sequence-diagram","er-diagram","authentication-flow","audio-upload-flow","audio-processing-pipeline","live-microphone-flow","ml-training-pipeline","random-forest-pipeline","svm-pipeline","cnn-pipeline","model-comparison-flow","critical-alert-decision","alert-severity-flow","manual-review-flow","dataset-split-flow","prediction-flow","deployment-architecture"]
flows={n:["Input","Service/API","Persistence","Operator"] for n in names}
flows["architecture"]=["React/Vite UI","FastAPI service","SQLite persistence","ML boundary"];flows["authentication-flow"]=["Login/register","Session","/auth/me","Protected UI"];flows["audio-upload-flow"]=["Select file","POST /detections/analyze","Upload","Result"];flows["deployment-architecture"]=["Browser","Vite :5173","FastAPI :8000","SQLite/uploads"];flows["er-diagram"]=["users","detections","alerts","reviews"]
for n in names:
 fig,ax=plt.subplots(figsize=(12,6),facecolor="#080e1c");ax.set_facecolor("#080e1c");ax.axis("off");ax.text(.05,.9,n.replace("-"," ").title(),color="#3acdde",fontsize=20,fontweight="bold",transform=ax.transAxes);v=flows[n];xs=[.08+i*.84/(len(v)-1) for i in range(len(v))]
 for i,(x,label) in enumerate(zip(xs,v)):
  ax.add_patch(FancyBboxPatch((x-.07,.43),.14,.18,boxstyle="round,pad=.02",facecolor="#121d34",edgecolor="#3acdde",transform=ax.transAxes));ax.text(x,.52,label,color="#f0f4fa",ha="center",va="center",fontsize=10,transform=ax.transAxes)
  if i<len(v)-1:ax.add_patch(FancyArrowPatch((x+.075,.52),(xs[i+1]-.075,.52),arrowstyle="->",color="#9dadc4",mutation_scale=15,transform=ax.transAxes))
 ax.text(.05,.08,"SonicSentinel AI | implementation-informed diagram",color="#9dadc4",fontsize=9,transform=ax.transAxes);fig.savefig(doc/"diagrams"/(n+".png"),dpi=140,bbox_inches="tight",facecolor=fig.get_facecolor());plt.close(fig)
for n in ["class-distribution","dataset-split","model-accuracy","model-precision","model-recall","model-f1","confusion-matrix-rf","confusion-matrix-svm","confusion-matrix-cnn","class-wise-performance","confidence-analysis","top-two-margin","false-positive-analysis","false-negative-analysis","noise-robustness"]:(doc/"graphs"/(n+".md")).write_text("# "+n.replace("-"," ").title()+"\n\nRESULTS PENDING — model training/evaluation evidence is not currently available. No graph is generated without verified source data.\n",encoding="utf-8")
print("routes",len(routes),"wav",len(wav),"diagrams",len(names))
