import React, { createContext, useContext } from 'react';
import { SchoolSettings, SchoolProfile } from '../types';
import {
  DEFAULT_SCHOOL_CODE,
  DEFAULT_SCHOOL_NAME,
  DEFAULT_SCHOOL_SLOGAN,
  normalizeActiveSchoolCode,
  isLegacyDefaultSchool,
  getRuntimeActiveSchoolCode,
} from '../utils/schoolTenant';

export interface SchoolTenantContextValue {
  schoolCode: string;
  schoolName: string;
  schoolLogo?: string;
  slogan: string;
  adminEmails: string[];
  isLegacySchool: boolean;
  schoolSettings: SchoolSettings | null;
  schoolProfile: SchoolProfile | null;
}

const SchoolTenantContext = createContext<SchoolTenantContextValue>({
  schoolCode: DEFAULT_SCHOOL_CODE,
  schoolName: DEFAULT_SCHOOL_NAME,
  slogan: DEFAULT_SCHOOL_SLOGAN,
  adminEmails: [],
  isLegacySchool: true,
  schoolSettings: null,
  schoolProfile: null,
});

interface SchoolTenantProviderProps {
  schoolCode?: string | null;
  schoolSettings?: SchoolSettings | null;
  schoolProfile?: SchoolProfile | null;
  children: React.ReactNode;
}

export const SchoolTenantProvider: React.FC<SchoolTenantProviderProps> = ({
  schoolCode,
  schoolSettings = null,
  schoolProfile = null,
  children,
}) => {
  const resolvedCode = normalizeActiveSchoolCode(
    schoolCode || schoolProfile?.schoolCode || schoolSettings?.schoolCode || getRuntimeActiveSchoolCode()
  );
  const resolvedName =
    schoolProfile?.schoolName ||
    schoolSettings?.schoolName ||
    (resolvedCode === DEFAULT_SCHOOL_CODE ? DEFAULT_SCHOOL_NAME : resolvedCode);
  const resolvedLogo = schoolProfile?.logoUrl || schoolSettings?.schoolLogo || schoolSettings?.logoUrl || '';
  const resolvedSlogan = schoolProfile?.slogan || schoolSettings?.slogan || DEFAULT_SCHOOL_SLOGAN;
  const resolvedAdminEmails =
    schoolProfile?.adminEmails ||
    schoolSettings?.adminEmails ||
    (schoolSettings?.principalEmail ? [schoolSettings.principalEmail.toLowerCase().trim()] : []);

  return (
    <SchoolTenantContext.Provider
      value={{
        schoolCode: resolvedCode,
        schoolName: resolvedName,
        schoolLogo: resolvedLogo,
        slogan: resolvedSlogan,
        adminEmails: resolvedAdminEmails,
        isLegacySchool: isLegacyDefaultSchool(resolvedCode),
        schoolSettings,
        schoolProfile,
      }}
    >
      {children}
    </SchoolTenantContext.Provider>
  );
};

export function useSchoolTenant(): SchoolTenantContextValue {
  return useContext(SchoolTenantContext);
}
