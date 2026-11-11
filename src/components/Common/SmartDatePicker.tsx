import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, Clock, Check, Sparkles } from 'lucide-react';

interface SmartDatePickerProps {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  required?: boolean;
  min?: string;
  max?: string;
  accentColor?: 'blue' | 'indigo' | 'emerald' | 'amber' | 'rose';
  helperText?: string;
  showPresets?: boolean;
  className?: string;
}

const MALAY_DAYS = ['Ahad', 'Isnin', 'Selasa', 'Rabu', 'Khamis', 'Jumaat', 'Sabtu'];
const MALAY_MONTHS = [
  'Januari', 'Februari', 'Mac', 'April', 'Mei', 'Jun',
  'Julai', 'Ogos', 'September', 'Oktober', 'November', 'Disember'
];

export const SmartDatePicker: React.FC<SmartDatePickerProps> = ({
  label,
  value,
  onChange,
  required = false,
  min,
  max,
  accentColor = 'blue',
  helperText,
  showPresets = true,
  className = '',
}) => {
  const [showCalendarGrid, setShowCalendarGrid] = useState<boolean>(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const nativeInputRef = useRef<HTMLInputElement>(null);

  // Parse current selected date
  const parsedDate = useMemo(() => {
    if (!value) return new Date();
    const [y, m, d] = value.split('-').map(Number);
    if (!y || !m || !d) return new Date();
    return new Date(y, m - 1, d);
  }, [value]);

  // Calendar View month/year state
  const [viewYear, setViewYear] = useState<number>(parsedDate.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(parsedDate.getMonth()); // 0-11

  useEffect(() => {
    if (value) {
      const [y, m, d] = value.split('-').map(Number);
      if (y && m) {
        setViewYear(y);
        setViewMonth(m - 1);
      }
    }
  }, [value]);

  // Close calendar popover on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowCalendarGrid(false);
      }
    };
    if (showCalendarGrid) {
      document.addEventListener('mousedown', handleOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside);
    };
  }, [showCalendarGrid]);

  // Format display string e.g. "Isnin, 09.11.2026"
  const formattedDisplay = useMemo(() => {
    if (!value) return 'Sila pilih tarikh';
    const [y, m, d] = value.split('-');
    if (!y || !m || !d) return value;
    const dayName = MALAY_DAYS[parsedDate.getDay()] || '';
    return `${dayName}, ${d}.${m}.${y}`;
  }, [value, parsedDate]);

  // Generate calendar days for viewMonth & viewYear
  const calendarCells = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay(); // 0 is Ahad
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();

    const cells: Array<{
      dayNum: number;
      dateStr: string;
      isCurrentMonth: boolean;
      isToday: boolean;
      isSelected: boolean;
    }> = [];

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    // Fill trailing days of previous month
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const d = prevMonthDays - i;
      const prevM = viewMonth === 0 ? 11 : viewMonth - 1;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNum: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === value,
      });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNum: d,
        dateStr,
        isCurrentMonth: true,
        isToday: dateStr === todayStr,
        isSelected: dateStr === value,
      });
    }

    // Fill next month days to complete 35 or 42 grid cells
    const remaining = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remaining; d++) {
      const nextM = viewMonth === 11 ? 0 : viewMonth + 1;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextY}-${String(nextM + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      cells.push({
        dayNum: d,
        dateStr,
        isCurrentMonth: false,
        isToday: dateStr === todayStr,
        isSelected: dateStr === value,
      });
    }

    return cells;
  }, [viewYear, viewMonth, value]);

  // Navigate month
  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  // Quick Preset Handlers
  const handleSetToday = (e: React.MouseEvent) => {
    e.preventDefault();
    const now = new Date();
    const str = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    onChange(str);
  };

  const handleSetTomorrow = (e: React.MouseEvent) => {
    e.preventDefault();
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onChange(str);
  };

  const handleSetNextMonday = (e: React.MouseEvent) => {
    e.preventDefault();
    const d = new Date();
    const day = d.getDay();
    const diff = (8 - day) % 7 || 7; // days until next Monday
    d.setDate(d.getDate() + diff);
    const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    onChange(str);
  };

  // Open native picker if supported or toggle custom grid
  const handleTriggerPicker = () => {
    try {
      if (nativeInputRef.current && typeof (nativeInputRef.current as any).showPicker === 'function') {
        (nativeInputRef.current as any).showPicker();
        return;
      }
    } catch {}
    setShowCalendarGrid((prev) => !prev);
  };

  const colorThemes = {
    blue: {
      border: 'hover:border-blue-500 focus-within:border-blue-500',
      badge: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
      btn: 'bg-blue-600 hover:bg-blue-500 text-white',
      ring: 'focus:ring-blue-500',
    },
    indigo: {
      border: 'hover:border-indigo-500 focus-within:border-indigo-500',
      badge: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
      btn: 'bg-indigo-600 hover:bg-indigo-500 text-white',
      ring: 'focus:ring-indigo-500',
    },
    emerald: {
      border: 'hover:border-emerald-500 focus-within:border-emerald-500',
      badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
      btn: 'bg-emerald-600 hover:bg-emerald-500 text-white',
      ring: 'focus:ring-emerald-500',
    },
    amber: {
      border: 'hover:border-amber-500 focus-within:border-amber-500',
      badge: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
      btn: 'bg-amber-600 hover:bg-amber-500 text-white',
      ring: 'focus:ring-amber-500',
    },
    rose: {
      border: 'hover:border-rose-500 focus-within:border-rose-500',
      badge: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
      btn: 'bg-rose-600 hover:bg-rose-500 text-white',
      ring: 'focus:ring-rose-500',
    },
  };

  const theme = colorThemes[accentColor];

  return (
    <div className={`space-y-1.5 relative ${className}`} ref={containerRef}>
      <div className="flex items-center justify-between">
        <label className="block font-bold text-slate-300 text-xs">
          {label} {required && <span className="text-rose-400">*</span>}
        </label>
        {value && (
          <span className={`px-2 py-0.2 rounded text-[10px] font-bold border ${theme.badge}`}>
            {formattedDisplay}
          </span>
        )}
      </div>

      {/* Main Interactive Input Box */}
      <div
        onClick={handleTriggerPicker}
        className={`w-full bg-slate-950 border border-slate-700 ${theme.border} rounded-xl px-3 py-2 flex items-center justify-between gap-2 cursor-pointer transition shadow-inner group`}
        title="Klik di sini untuk membuka kalendar & memilih tarikh secara visual"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <CalendarIcon className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform shrink-0" />
          <span className="font-mono text-xs font-bold text-white truncate">
            {value ? formattedDisplay : 'Pilih Tarikh...'}
          </span>
        </div>

        {/* Hidden or direct native date picker with showPicker() */}
        <input
          ref={nativeInputRef}
          type="date"
          required={required}
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onClick={(e) => {
            e.stopPropagation();
            try {
              (e.currentTarget as any).showPicker?.();
            } catch {}
          }}
          className="opacity-0 absolute w-0 h-0 pointer-events-none [color-scheme:dark]"
          tabIndex={-1}
        />

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowCalendarGrid((prev) => !prev);
            }}
            className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition"
            title="Buka Paparan Kalendar Penuh"
          >
            <span>Kalendar</span>
          </button>
        </div>
      </div>

      {/* Quick Date Presets */}
      {showPresets && (
        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
          <span className="text-[10px] text-slate-500 font-semibold">Pantas:</span>
          <button
            type="button"
            onClick={handleSetToday}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[10px] font-bold transition cursor-pointer"
          >
            Hari Ini
          </button>
          <button
            type="button"
            onClick={handleSetTomorrow}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[10px] font-bold transition cursor-pointer"
          >
            Esok
          </button>
          <button
            type="button"
            onClick={handleSetNextMonday}
            className="px-2 py-0.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-[10px] font-bold transition cursor-pointer"
          >
            Isnin Depan
          </button>
        </div>
      )}

      {helperText && <p className="text-[10px] text-slate-400">{helperText}</p>}

      {/* ================= INTERACTIVE POPUP CALENDAR GRID ================= */}
      {showCalendarGrid && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-slate-950 border border-slate-700 rounded-2xl p-3.5 shadow-2xl w-72 animate-in fade-in zoom-in-95 duration-100">
          {/* Calendar Header */}
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-800">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
              title="Bulan Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="text-xs font-black text-white font-mono uppercase tracking-wide">
              {MALAY_MONTHS[viewMonth]} {viewYear}
            </div>

            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition cursor-pointer"
              title="Bulan Seterusnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day of week headers */}
          <div className="grid grid-cols-7 gap-1 text-center py-2 text-[10px] font-bold text-slate-500 uppercase">
            <span>Ah</span>
            <span>Is</span>
            <span>Se</span>
            <span>Ra</span>
            <span>Kh</span>
            <span>Ju</span>
            <span>Sa</span>
          </div>

          {/* Day cells */}
          <div className="grid grid-cols-7 gap-1 text-center text-xs">
            {calendarCells.map((cell) => {
              const isSelected = cell.isSelected;
              const isToday = cell.isToday;

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => {
                    onChange(cell.dateStr);
                    setShowCalendarGrid(false);
                  }}
                  className={`h-7 w-7 rounded-lg text-xs font-bold font-mono transition flex items-center justify-center cursor-pointer mx-auto ${
                    isSelected
                      ? `${theme.btn} shadow-md`
                      : isToday
                      ? 'bg-slate-800 text-amber-300 border border-amber-500/40'
                      : cell.isCurrentMonth
                      ? 'text-slate-200 hover:bg-slate-800'
                      : 'text-slate-600 hover:bg-slate-900'
                  }`}
                  title={cell.dateStr}
                >
                  {cell.dayNum}
                </button>
              );
            })}
          </div>

          {/* Calendar Footer */}
          <div className="flex items-center justify-between pt-2.5 border-t border-slate-800 mt-2 text-[10px]">
            <button
              type="button"
              onClick={handleSetToday}
              className="text-blue-400 hover:underline font-bold"
            >
              Pilih Hari Ini
            </button>
            <button
              type="button"
              onClick={() => setShowCalendarGrid(false)}
              className="text-slate-400 hover:text-white font-bold"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
