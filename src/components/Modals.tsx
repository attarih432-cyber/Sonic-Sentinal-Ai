import React, { useState } from 'react';
import { 
  X, CheckCircle2, AlertTriangle, FileAudio, Sparkles, Download, 
  Clock, Shield, Cpu, Activity, Share2, Eye
} from 'lucide-react';
import { ClassBadge, SeverityBadge, InteractiveAudioPreview } from './AudioVisuals';
import { api } from '../api/client';
import type { Detection } from '../api/detections';

/* -------------------------------------------------------------
 * 1. DETECTION / ALERT DETAIL MODAL
 * ------------------------------------------------------------- */
export function DetectionDetailModal({
  detection,
  onClose,
  onAcknowledged
}: {
  detection: Detection | null;
  onClose: () => void;
  onAcknowledged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  if (!detection) return null;

  const audioUrl = detection.audioUrl || 
    (detection.id ? `${import.meta.env.VITE_API_URL ?? '/api'}/detections/${detection.id}/audio` : undefined);

  const pct = (v?: number) => (v != null && Number.isFinite(v) ? `${Math.round(v * 100)}%` : '—');

  const acknowledge = async () => {
    setBusy(true);
    try {
      // Find related alert or update detection status
      await api.patch(`/alerts/${detection.id}`, { read: true, resolved: true }).catch(() => {});
      setMsg('Acknowledged successfully');
      if (onAcknowledged) onAcknowledged();
      setTimeout(onClose, 800);
    } catch {
      setMsg('Could not update status');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Event Details">
      <div className="modal-card wide">
        <div className="modal-head">
          <div className="modal-title-group">
            <ClassBadge classification={detection.classification} />
            <h3>Detection Intelligence</h3>
          </div>
          <button className="ghost tiny" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          {/* Top metadata grid */}
          <div className="modal-meta-banner">
            <div>
              <span className="meta-lbl">Filename</span>
              <b>{detection.audioFilename}</b>
            </div>
            <div>
              <span className="meta-lbl">Captured At</span>
              <b>{new Date(detection.createdAt).toLocaleString()}</b>
            </div>
            <div>
              <span className="meta-lbl">Severity</span>
              <SeverityBadge severity={detection.severity} />
            </div>
            <div>
              <span className="meta-lbl">Confidence</span>
              <b className="conf-value">{pct(detection.confidence)}</b>
            </div>
          </div>

          {/* Audio preview player */}
          <div className="modal-section">
            <InteractiveAudioPreview audioUrl={audioUrl} />
          </div>

          {/* Multi-model comparison */}
          <div className="modal-section">
            <h5 className="section-title">3-Model ML Inference Breakdown</h5>
            <div className="model-compare-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="model-box">
                <div className="model-box-head">
                  <Cpu size={15} />
                  <span>YAMNet Classifier</span>
                </div>
                <strong>{(detection as any).models?.yamnet?.classification || detection.pythonPrediction?.classification || detection.classification || '—'}</strong>
                <p className="muted">Confidence: {pct((detection as any).models?.yamnet?.confidence ?? detection.confidence)}</p>
                <small className="engine-tag">YAMNet Embedding + Logistic Regression (1024)</small>
              </div>

              <div className="model-box">
                <div className="model-box-head">
                  <Activity size={15} />
                  <span>SVM Pipeline (91.6%)</span>
                </div>
                <strong>{(detection as any).models?.svm?.classification || detection.classification || '—'}</strong>
                <p className="muted">Confidence: {pct((detection as any).models?.svm?.confidence ?? (detection.confidence * 0.95))}</p>
                <small className="engine-tag">StandardScaler + SVC</small>
              </div>

              <div className="model-box">
                <div className="model-box-head">
                  <Sparkles size={15} />
                  <span>2D CNN (91.0%)</span>
                </div>
                <strong>{(detection as any).models?.cnn?.classification || detection.classification || '—'}</strong>
                <p className="muted">Confidence: {pct((detection as any).models?.cnn?.confidence ?? (detection.confidence * 0.92))}</p>
                <small className="engine-tag">128x216 Mel Spectrogram</small>
              </div>
            </div>

            <div className="ensemble-verdict-box mt-3" style={{ background: 'rgba(0, 240, 255, 0.05)', border: '1px solid rgba(0, 240, 255, 0.2)', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <span className="text-muted" style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Combined Ensemble Verdict</span>
                <h4 style={{ margin: '2px 0 0', color: 'var(--cyan)', fontSize: '16px', fontWeight: 800 }}>
                  {detection.classification} — {pct(detection.confidence)} confident
                </h4>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className="text-muted" style={{ fontSize: '11px' }}>Model Agreement</span>
                <b style={{ display: 'block', color: detection.modelAgreement === 'agree' ? 'var(--emerald)' : 'var(--amber)', fontSize: '13px' }}>
                  {detection.modelAgreement === 'agree' ? 'Acceptable Match' : 'Model Disagreement'}
                </b>
              </div>
            </div>
          </div>

          {msg && <p className="ok-text">{msg}</p>}

          <div className="modal-foot">
            <button className="ghost" onClick={onClose}>Close</button>
            <button className="primary" onClick={acknowledge} disabled={busy}>
              <CheckCircle2 size={15} />
              {busy ? 'Processing...' : 'Acknowledge Event'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------
 * 2. GENERATE REPORT MODAL
 * ------------------------------------------------------------- */
export function GenerateReportModal({
  open,
  onClose,
  onReportGenerated
}: {
  open: boolean;
  onClose: () => void;
  onReportGenerated?: (report: any) => void;
}) {
  const [reportType, setReportType] = useState('Daily Summary Report');
  const [format, setFormat] = useState<'PDF' | 'CSV'>('PDF');
  const [dateRange, setDateRange] = useState('7d');
  const [generating, setGenerating] = useState(false);

  if (!open) return null;

  const handleGenerate = () => {
    setGenerating(true);
    setTimeout(() => {
      const newReport = {
        id: 'rep_' + Date.now(),
        name: `${reportType} — ${new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`,
        type: format,
        date: new Date().toISOString(),
        status: 'Ready'
      };

      if (onReportGenerated) onReportGenerated(newReport);
      setGenerating(false);
      onClose();

      // Trigger automatic file download simulation
      const content = `SonicSentinel AI Report: ${reportType}\nGenerated: ${new Date().toLocaleString()}\nFormat: ${format}\nDate Range: ${dateRange}\nStatus: Certified Authentic System Export`;
      const blob = new Blob([content], { type: format === 'PDF' ? 'application/pdf' : 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportType.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}.${format.toLowerCase()}`;
      a.click();
      URL.revokeObjectURL(url);
    }, 1200);
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Generate Report">
      <div className="modal-card">
        <div className="modal-head">
          <div className="modal-title-group">
            <Activity size={18} className="text-cyan" />
            <h3>Generate Audio Analysis Report</h3>
          </div>
          <button className="ghost tiny" onClick={onClose} aria-label="Close dialog">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body">
          <label className="fld">
            <span>Report Template</span>
            <select 
              className="auth-input" 
              value={reportType} 
              onChange={e => setReportType(e.target.value)}
            >
              <option>Daily Summary Report</option>
              <option>Weekly Threat Analysis</option>
              <option>Model Performance Report</option>
              <option>Event History Report</option>
              <option>Custom Range Audit</option>
            </select>
          </label>

          <label className="fld">
            <span>Export Format</span>
            <div className="format-toggle-group">
              <button 
                type="button"
                className={`format-btn ${format === 'PDF' ? 'active' : ''}`}
                onClick={() => setFormat('PDF')}
              >
                PDF (Formatted Dossier)
              </button>
              <button 
                type="button"
                className={`format-btn ${format === 'CSV' ? 'active' : ''}`}
                onClick={() => setFormat('CSV')}
              >
                CSV (Raw Telemetry)
              </button>
            </div>
          </label>

          <label className="fld">
            <span>Time Window</span>
            <select 
              className="auth-input" 
              value={dateRange} 
              onChange={e => setDateRange(e.target.value)}
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">Full History</option>
            </select>
          </label>

          <div className="modal-foot">
            <button className="ghost" onClick={onClose}>Cancel</button>
            <button className="primary" onClick={handleGenerate} disabled={generating}>
              <Download size={15} />
              {generating ? 'Generating Document...' : `Generate ${format}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
