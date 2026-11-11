import React, { useState, useEffect } from 'react';
import { School } from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

interface SchoolLogoProps {
  src?: string;
  className?: string;
  p?: string;
  alt?: string;
}

export const SchoolLogo: React.FC<SchoolLogoProps> = ({
  src: propSrc,
  className = 'w-10 h-10',
  p = '',
  alt = 'Logo Sekolah',
}) => {
  const [logoSrc, setLogoSrc] = useState<string>(() => {
    if (propSrc) return propSrc;
    if (typeof window !== 'undefined') {
      return localStorage.getItem('isepadu_school_logo') || '';
    }
    return '';
  });
  const [imgError, setImgError] = useState<boolean>(false);

  useEffect(() => {
    if (propSrc !== undefined) {
      setLogoSrc(propSrc || '');
      setImgError(false);
      if (propSrc && typeof window !== 'undefined') {
        localStorage.setItem('isepadu_school_logo', propSrc);
      }
    }
  }, [propSrc]);

  useEffect(() => {
    // If no explicit propSrc provided, subscribe to school_settings/general
    if (propSrc === undefined) {
      const unsub = onSnapshot(
        doc(db, 'school_settings', 'general'),
        (snap) => {
          if (snap.exists()) {
            const data = snap.data();
            const fetchedLogo = data?.schoolLogo || '';
            setLogoSrc(fetchedLogo);
            setImgError(false);
            if (fetchedLogo && typeof window !== 'undefined') {
              localStorage.setItem('isepadu_school_logo', fetchedLogo);
            } else if (!fetchedLogo && typeof window !== 'undefined') {
              localStorage.removeItem('isepadu_school_logo');
            }
          }
        },
        () => {
          // Graceful fallback to cached or default
        }
      );
      return () => unsub();
    }
  }, [propSrc]);

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

  // Default fallback: Official iSEPADU School Badge
  return (
    <div
      className={`relative flex items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-900 text-white shadow-md border border-white/20 shrink-0 ${p} ${className}`}
    >
      <School className="w-2/3 h-2/3 text-white drop-shadow" />
      <span className="absolute -bottom-1 -right-1 px-1 py-0.2 bg-amber-400 text-slate-950 font-black text-[8px] rounded uppercase tracking-tighter leading-none shadow">
        CHB
      </span>
    </div>
  );
};

export default SchoolLogo;
