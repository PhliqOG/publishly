'use client';

import { useVariables } from '@gitroom/react/helpers/variable.context';
import { Analytics as DubAnalyticsIn } from '@dub/analytics/react';
import { getCookie } from 'react-use-cookie';

export const DubAnalytics = () => {
  const { dub, frontEndUrl } = useVariables();
  let refer: string;
  try {
    refer = new URL(frontEndUrl).hostname;
  } catch {
    return null;
  }
  if (!dub || !refer) return null;
  return (
    <DubAnalyticsIn
      domainsConfig={{
        refer,
      }}
    />
  );
};

export const useDubClickId = () => {
  const { dub } = useVariables();
  if (!dub) return undefined;

  const dubCookie = getCookie('dub_partner_data', '{}');
  return JSON.parse(dubCookie)?.clickId || undefined;
};
