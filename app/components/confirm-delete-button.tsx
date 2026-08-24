'use client';

import { Trash2, X } from 'lucide-react';
import { useState } from 'react';

type ConfirmDeleteButtonProps = {
  label: string;
  warning: string;
  onConfirm: () => void;
};

export function ConfirmDeleteButton({ label, warning, onConfirm }: ConfirmDeleteButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return <button className="danger" type="button" onClick={() => setConfirming(true)}><Trash2 size={17} />{label}</button>;
  }

  return (
    <div className="delete-confirm" role="alert">
      <p><strong>정말 삭제할까요?</strong><span>{warning}</span></p>
      <button type="button" onClick={() => setConfirming(false)} aria-label="삭제 취소"><X size={16} /></button>
      <button className="danger" type="button" onClick={onConfirm}>삭제</button>
    </div>
  );
}
