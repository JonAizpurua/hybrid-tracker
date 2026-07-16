import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';

export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  return createPortal(
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`modal-sheet ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="Close" onClick={onClose}><X size={21} /></button>
        </div>
        <div className="modal-content">{children}</div>
      </section>
    </div>, document.body
  );
}
