import type { Metadata } from 'next';

import { CandidateAnalyzerPage } from '@/views/candidate-analyzer';

export const metadata: Metadata = {
  title: 'Проверка резюме',
};

export default function Page() {
  return <CandidateAnalyzerPage />;
}
