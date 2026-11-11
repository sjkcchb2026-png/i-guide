import React, { useState } from 'react';
import { AlertCircle, Clock, CheckCircle, X } from 'lucide-react';

interface EarlyCheckoutModalProps {
  isOpen: boolean;
  ruleDescription: string;
  category: string;
  slot: number;
  onConfirm: (reason: string) => void;
  onClose: () => void;
  isProcessing: boolean;
}

export const EarlyCheckoutModal: React.FC<EarlyCheckoutModalProps> = ({
  isOpen,
  ruleDescription,
  category,
  slot,
  onConfirm,
  onClose,
  isProcessing,
}) => {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const quickTags = category === 'AKP'
    ? [
        '午休离校 (Keluar Rehat Tengah Hari)',
        '因公外出 (Urusan Rasmi Pejabat)',
        '身体不适/就医 (Rawatan Klinik/Hospital)',
        '紧急家庭事宜 (Kecemasan Keluarga)',
      ]
    : [
        '因公外出/开会 (Urusan Rasmi/Mesyuarat)',
        '身体不适/就医 (Rawatan Klinik/Hospital)',
        '紧急家庭事宜 (Kecemasan Keluarga)',
        '监考/课外活动公干 (Tugas Rasmi Kokurikulum)',
      ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError('请填写或选择离校理由 (Sila nyatakan alasan anda)');
      return;
    }
    setError('');
    onConfirm(reason.trim());
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-amber-500/40 rounded-3xl p-6 sm:p-7 max-w-lg w-full text-white shadow-2xl relative animate-in fade-in zoom-in duration-200">
        <button
          onClick={onClose}
          disabled={isProcessing}
          className="absolute top-5 right-5 p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-4">
          <div className="w-10 h-10 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <AlertCircle className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">提前离校理由登记</h3>
            <p className="text-xs text-amber-300 font-medium">Alasan Pulang Awal / Kurang Jam Kerja</p>
          </div>
        </div>

        {/* Rule explanation alert */}
        <div className="bg-amber-950/40 border border-amber-500/30 rounded-2xl p-4 mb-4 text-xs text-amber-200 space-y-1">
          <div className="font-semibold flex items-center gap-1.5 text-amber-300">
            <Clock className="w-3.5 h-3.5" />
            <span>考勤时间核验提示：</span>
          </div>
          <p className="leading-relaxed">{ruleDescription}</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              快速选择常见理由 (Pilihan Pantas)：
            </label>
            <div className="flex flex-wrap gap-1.5">
              {quickTags.map((tag) => (
                <button
                  type="button"
                  key={tag}
                  onClick={() => {
                    setReason(tag);
                    setError('');
                  }}
                  className={`text-xs px-2.5 py-1.5 rounded-xl border transition ${
                    reason === tag
                      ? 'bg-amber-500/30 border-amber-400 text-amber-200 font-medium'
                      : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:border-slate-500'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              详细离校理由 (Sebab / Catatan)：
            </label>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (e.target.value.trim()) setError('');
              }}
              rows={3}
              placeholder="请输入您提前离校的原因或说明..."
              className="w-full bg-slate-950 border border-slate-700 focus:border-amber-400 rounded-2xl p-3 text-sm text-white placeholder-slate-500 outline-hidden transition"
            />
            {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
          </div>

          <div className="flex items-center justify-end space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-medium transition"
            >
              取消 (Batal)
            </button>
            <button
              type="submit"
              disabled={isProcessing}
              className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-1.5 shadow-lg shadow-amber-500/20 transition disabled:opacity-50"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isProcessing ? '正在提交...' : '确认并 Check Out'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
