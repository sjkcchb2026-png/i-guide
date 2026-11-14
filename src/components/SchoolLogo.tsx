import React, { useState, useEffect } from 'react';
import { School } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useSchoolTenant } from '../contexts/SchoolTenantContext';
import { isLegacyDefaultSchool, normalizeActiveSchoolCode } from '../utils/schoolTenant';

interface SchoolLogoProps {
  src?: string;
  schoolCode?: string;
  className?: string;
  p?: string;
  alt?: string;
}

export const SchoolLogo: React.FC<SchoolLogoProps> = ({
  src: propSrc,
  schoolCode: propSchoolCode,
  className = 'w-10 h-10',
  p = '',
  alt = 'Logo Sekolah',
}) => {
  const tenant = useSchoolTenant();
  const activeCode = normalizeActiveSchoolCode(propSchoolCode || tenant.schoolCode);
  const storageKey = `isepadu_school_logo_${activeCode}`;

  const [logoSrc, setLogoSrc] = useState<string>(() => {
    if (propSrc !== undefined) return propSrc || '';
    if (tenant.schoolLogo) return tenant.schoolLogo;
    if (typeof window !== 'undefined') {
      return localStorage.getItem(storageKey) || '';
    }
    return '';
  });
  const [imgError, setImgError] = useState<boolean>(false);

  useEffect(() => {
    if (propSrc !== undefined) {
      setLogoSrc(propSrc || '');
      setImgError(false);
      if (typeof window !== 'undefined') {
        if (propSrc) {
          localStorage.setItem(storageKey, propSrc);
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    }
  }, [propSrc, storageKey]);

  useEffect(() => {
    // If no explicit propSrc provided, subscribe to schools/{activeCode} (and legacy school_settings/general for YCC3404)
    if (propSrc === undefined) {
      const targetRef = isLegacyDefaultSchool(activeCode)
        ? doc(db, 'school_settings', 'general')
        : doc(db, 'schools', activeCode);

      const unsub = onSnapshot(
        targetRef,
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const fetchedLogo = data?.logoUrl || data?.schoolLogo || '';
            setLogoSrc(fetchedLogo);
            setImgError(false);
            if (typeof window !== 'undefined') {
              if (fetchedLogo) {
                localStorage.setItem(storageKey, fetchedLogo);
              } else {
                localStorage.removeItem(storageKey);
              }
            }
          }
        },
        () => {
          // Graceful fallback to cached or default
        }
      );
      return () => unsub();
    }
  }, [propSrc, activeCode, storageKey]);

  // If a valid custom logo is available and hasn't errored out
  if (logoSrc && !imgError) {
    return (
      <div
        className={`relative flex items-center justify-center rounded-2xl bg-slate-900/80 border border-slate-700/60 shadow-md shrink-0 overflow-hidden ${p} ${className}`}
      >
        <img
          src={logoSrc}
          alt={alt}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className="w-full h-full object-contain drop-shadow"
        />
      </div>
    );
  }

  const badgeText = isLegacyDefaultSchool(activeCode) ? 'CHB' : activeCode.slice(0, 7);

  // Default fallback: Dynamic iSEPADU School Badge
  return (
    <div
      className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 text-white shadow-md border border-white/20 shrink-0 ${p} ${className}`}
    >
      <School className="w-2/3 h-2/3 text-white drop-shadow" />
      <span className="absolute -bottom-1 -right-1 px-1 py-0.2 bg-amber-400 text-slate-950 font-black text-[8px] rounded uppercase tracking-tighter leading-none shadow">
        {badgeText}
      </span>
    </div>
  );
};

export default SchoolLogo;
