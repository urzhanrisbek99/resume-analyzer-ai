import type { Metadata } from 'next';

import { RecruiterScreeningPage } from '@/views/recruiter-screening';

export const metadata: Metadata = {
  title: 'Скрининг кандидатов',
};

export default function Page() {
  return <RecruiterScreeningPage />;
}
