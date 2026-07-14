'use client';

import dynamic_next from 'next/dynamic';

const CrossDomainGraph = dynamic_next(() => import('@/components/CrossDomainGraph'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] flex items-center justify-center bg-slate-50 border border-slate-200 rounded-lg">
      <div className="text-slate-500 flex flex-col items-center">
        <div className="w-8 h-8 border-4 border-amber-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        Loading cross-disciplinary map...
      </div>
    </div>
  ),
});

export default CrossDomainGraph;
