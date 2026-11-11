import React, { useState } from 'react';
import { auth } from '../firebase';
import { StaffCategory } from '../types';
import { 
  Users, 
  X, 
  AlertCircle, 
  CheckCircle2, 
  FileText, 
  Copy, 
  Printer, 
  HelpCircle,
  Plus
} from 'lucide-react';

interface ParsedStaffRow {
  name: string;
  email: string;
  category: StaffCategory;
  password: string;
  hasClerkAccess: boolean;
  isValid: boolean;
  error?: string;
}

interface BatchAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const BatchAccountModal: React.FC<BatchAccountModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [rawText, setRawText] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedStaffRow[]>([]);
  const [step, setStep] = useState<'input' | 'preview' | 'creating' | 'completed'>('input');
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ name: string; email: string; success: boolean; message: string; password?: string }[]>([]);

  if (!isOpen) return null;

  // Auto classify according to rule:
  // "email 以 @moe-dl.edu.my 结尾的员工归类为 GURU，其他归类为 AKP；不要求 g- 开头。"
  const determineCategory = (email: string): StaffCategory => {
    return email.trim().toLowerCase().endsWith('@moe-dl.edu.my') ? 'GURU' : 'AKP';
  };

  const handleParse = () => {
    const lines = rawText.split('\n');
    const list: ParsedStaffRow[] = [];

    for (let line of lines) {
      line = line.trim();
      if (!line || line.startsWith('#')) continue;

      // Format: Name, Email, Password, [hasClerk: true/false]
      const parts = line.split(/[,，\t]/).map((p) => p.trim());
      const name = parts[0] || '';
      const email = (parts[1] || '').toLowerCase();
      const password = parts[2] || 'Pass1234'; // default initial password if blank
      const clerkToken = parts[3] ? parts[3].toLowerCase() : '';
      const hasClerkAccess = clerkToken === 'clerk' || clerkToken === 'kerani' || clerkToken === 'true' || clerkToken === '书记';

      let isValid = true;
      let error = '';

      if (!name) {
        isValid = false;
        error = '缺少姓名';
      } else if (!email || !email.includes('@')) {
        isValid = false;
        error = '邮箱格式不正确';
      } else if (password.length < 6) {
        isValid = false;
        error = '密码不足6位';
      }

      list.push({
        name,
        email,
        category: determineCategory(email),
        password,
        hasClerkAccess,
        isValid,
        error,
      });
    }

    setParsedRows(list);
    setStep('preview');
  };

  const handleStartCreation = async () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) return;

    setStep('creating');
    setProgress({ current: 0, total: validRows.length });

    try {
      const idToken = await auth.currentUser?.getIdToken();
      if (!idToken) {
        throw new Error('未检测到有效的管理员会话，请重新登录。');
      }

      // Execute through trusted backend with Principal verification
      const res = await fetch('/api/staff/batch-create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          staffList: validRows.map((r) => ({
            name: r.name,
            email: r.email,
            password: r.password,
            hasClerkAccess: r.hasClerkAccess,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || '批量建立账号失败');
      }

      setResults(data.results || []);
      setStep('completed');
      onSuccess();
    } catch (err: any) {
      console.error('Batch creation error:', err);
      alert(`批量建立失败: ${err.message || '请重试'}`);
      setStep('preview');
    }
  };

  const loadSampleData = () => {
    setRawText(
      `陈美玲, g-12345678@moe-dl.edu.my, GuruPass2026\n` +
      `黄立威, g-87654321@moe-dl.edu.my, GuruPass2026\n` +
      `Ahmad bin Razak, ahmad.razak@moe-dl.edu.my, GuruPass2026\n` +
      `Siti Fatimah, siti.kerani@gmail.com, AkpPass2026, kerani\n` +
      `Rajesh Kumar, rajesh.lab@gmail.com, AkpPass2026`
    );
  };

  const copyCredentialsTable = () => {
    const text = results
      .filter((r) => r.success)
      .map((r) => `姓名: ${r.name} | DELIMa账号: ${r.email} | 初始密码: ${r.password}`)
      .join('\n');
    navigator.clipboard.writeText(text);
    alert('已复制所有开通成功的员工账号与初始密码！可直接粘贴发送给教职员。');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl max-w-3xl w-full p-6 text-slate-100 shadow-2xl relative max-h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">批量建立员工账号 (Pendaftaran Pukal)</h3>
              <p className="text-xs text-slate-400">
                支持批量录入教师 (GURU) 与实行组职员 (AKP) 账号并自动分类
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-4 overflow-y-auto flex-1 space-y-4">
          
          {step === 'input' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">
                  请输入或粘贴员工资料列表（每行一人）
                </label>
                <button
                  type="button"
                  onClick={loadSampleData}
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                >
                  填入示例数据 (Contoh)
                </button>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-1">
                <div className="font-semibold text-slate-200">格式规则：</div>
                <div>格式：<span className="text-indigo-300 font-mono">姓名, 登录邮箱, 初始密码, [可选: 书记]</span></div>
                <div className="text-slate-400">
                  • 邮箱以 <span className="text-blue-300 font-mono">@moe-dl.edu.my</span> 结尾自动归类为 <strong>GURU</strong>；其他自动归类为 <strong>AKP</strong>。<br />
                  • 密码最少 6 位；系统不会索取员工 Google 密码。
                </div>
              </div>

              <textarea
                rows={8}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="陈美玲, g-12345678@moe-dl.edu.my, Pass1234&#10;张伟强, g-87654321@moe-dl.edu.my, Pass1234&#10;Ahmad, ahmad.ali@gmail.com, Pass1234"
                className="w-full p-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-300">
                  共解析 {parsedRows.length} 位员工资料（合格: {parsedRows.filter((r) => r.isValid).length} 位）
                </span>
                <button
                  onClick={() => setStep('input')}
                  className="text-xs text-slate-400 hover:text-white underline"
                >
                  返回修改列表
                </button>
              </div>

              <div className="overflow-x-auto max-h-72 border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                    <tr>
                      <th className="p-2.5">姓名</th>
                      <th className="p-2.5">邮箱账号</th>
                      <th className="p-2.5">自动分类</th>
                      <th className="p-2.5">初始密码</th>
                      <th className="p-2.5">权限</th>
                      <th className="p-2.5">验证状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60 font-mono">
                    {parsedRows.map((row, idx) => (
                      <tr key={idx} className={row.isValid ? '' : 'bg-rose-950/20'}>
                        <td className="p-2.5 text-slate-200 font-sans">{row.name}</td>
                        <td className="p-2.5 text-slate-300">{row.email}</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold ${
                            row.category === 'GURU' 
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                              : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          }`}>
                            {row.category}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-400">{row.password}</td>
                        <td className="p-2.5 font-sans">
                          {row.hasClerkAccess ? (
                            <span className="px-1.5 py-0.5 bg-purple-500/20 text-purple-300 rounded text-[10px]">
                              书记假期权限
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[11px]">普通员工</span>
                          )}
                        </td>
                        <td className="p-2.5 font-sans">
                          {row.isValid ? (
                            <span className="text-emerald-400 text-xs flex items-center gap-1">
                              <CheckCircle2 className="w-3.5 h-3.5" /> 正常
                            </span>
                          ) : (
                            <span className="text-rose-400 text-xs flex items-center gap-1">
                              <AlertCircle className="w-3.5 h-3.5" /> {row.error}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 'creating' && (
            <div className="py-12 text-center space-y-4">
              <div className="w-12 h-12 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
              <div>
                <h4 className="font-bold text-white text-base">正在建立 Firebase 真实云端账号...</h4>
                <p className="text-xs text-slate-400 mt-1">
                  正在处理第 {progress.current} / {progress.total} 个账号，请稍候勿关闭视窗
                </p>
              </div>
              <div className="w-full bg-slate-950 rounded-full h-2 max-w-md mx-auto overflow-hidden">
                <div
                  className="bg-indigo-600 h-full transition-all duration-300"
                  style={{ width: `${(progress.current / progress.total) * 100}%` }}
                ></div>
              </div>
            </div>
          )}

          {step === 'completed' && (
            <div className="space-y-4">
              <div className="p-3 bg-emerald-950/50 border border-emerald-700/50 rounded-xl text-emerald-200 text-xs flex items-center justify-between">
                <span>批量开通完毕！成功: {results.filter((r) => r.success).length} 位，失败: {results.filter((r) => !r.success).length} 位。</span>
                <button
                  onClick={copyCredentialsTable}
                  className="px-2.5 py-1 bg-emerald-800 hover:bg-emerald-700 text-white rounded text-xs flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>复制账号清单</span>
                </button>
              </div>

              <div className="overflow-x-auto max-h-64 border border-slate-800 rounded-xl">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-slate-950 text-slate-400 border-b border-slate-800 font-sans">
                    <tr>
                      <th className="p-2.5">姓名</th>
                      <th className="p-2.5">账号</th>
                      <th className="p-2.5">初始密码</th>
                      <th className="p-2.5">结果</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800 bg-slate-900/60">
                    {results.map((r, i) => (
                      <tr key={i}>
                        <td className="p-2.5 font-sans text-slate-200">{r.name}</td>
                        <td className="p-2.5 text-slate-300">{r.email}</td>
                        <td className="p-2.5 text-indigo-300">{r.password}</td>
                        <td className="p-2.5 font-sans">
                          {r.success ? (
                            <span className="text-emerald-400">开通成功</span>
                          ) : (
                            <span className="text-rose-400">{r.message}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="pt-4 border-t border-slate-800 flex justify-end space-x-3 shrink-0">
          {step === 'input' && (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition"
              >
                取消
              </button>
              <button
                type="button"
                disabled={!rawText.trim()}
                onClick={handleParse}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition"
              >
                解析与预览 (Seterusnya)
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button
                type="button"
                onClick={() => setStep('input')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs transition"
              >
                上一步
              </button>
              <button
                type="button"
                disabled={parsedRows.filter((r) => r.isValid).length === 0}
                onClick={handleStartCreation}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-medium transition flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>立即批量建立 ({parsedRows.filter((r) => r.isValid).length} 个账号)</span>
              </button>
            </>
          )}

          {step === 'completed' && (
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-medium transition"
            >
              完成并关闭
            </button>
          )}
        </div>

      </div>
    </div>
  );
};
