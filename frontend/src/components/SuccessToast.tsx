// components/SuccessToast.tsx
import React from 'react';
import { createPortal } from 'react-dom';

interface Props {
  message: string;
  description?: string;
  onClose: () => void;
}

export const SuccessToast: React.FC<Props> = ({ message, description, onClose }) => {
  return createPortal(
    <div className="fixed top-5 right-5 z-80 bg-green-100 border border-green-400 text-green-900 px-6 py-4 rounded-lg shadow-lg flex items-start gap-3 animate-slide-in">
      <div>
        <strong className="block font-semibold">{message}</strong>
        {description && <p className="text-sm">{description}</p>}
      </div>
      <button onClick={onClose} className="ml-auto text-green-900 font-bold">✕</button>
    </div>,
    document.body
  );
};
