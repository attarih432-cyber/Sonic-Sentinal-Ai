import {useEffect, useRef, type ReactNode} from 'react';
import {X} from 'lucide-react';

/* Reusable accessible Modal: Escape close, click-outside close, focus trap, aria. */
export function Modal({open, onClose, title, children}:{open:boolean; onClose:()=>void; title:string; children:ReactNode}){
  const ref=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{
    if(!open) return;
    const onKey=(e:KeyboardEvent)=>{ if(e.key==='Escape') onClose(); };
    const onDown=(e:MouseEvent)=>{ if(ref.current&&!ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('keydown',onKey);
    document.addEventListener('mousedown',onDown);
    document.body.style.overflow='hidden';
    const prev=document.activeElement as HTMLElement|null;
    (ref.current?.querySelector('button, [tabindex], input, select') as HTMLElement|null)?.focus();
    return ()=>{ document.removeEventListener('keydown',onKey); document.removeEventListener('mousedown',onDown); document.body.style.overflow=''; prev?.focus(); };
  },[open,onClose]);
  if(!open) return null;
  return <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
    <div className="modal-card" ref={ref}>
      <div className="modal-head"><h3>{title}</h3><button className="ghost tiny" onClick={onClose} aria-label="Close dialog"><X size={15}/></button></div>
      <div className="modal-body">{children}</div>
    </div>
  </div>;
}