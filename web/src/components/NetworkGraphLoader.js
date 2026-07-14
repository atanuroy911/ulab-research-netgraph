'use client';

import dynamic_next from 'next/dynamic';

const NetworkGraph = dynamic_next(() => import('@/components/NetworkGraph'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[600px] flex items-center justify-center bg-slate-50 border border-slate-200 rounded-lg">
      <div className="text-slate-500 flex flex-col items-center">
        <div className="w-8 h-8 border-4 border-ulab-blue border-t-transparent rounded-full animate-spin mb-4"></div>
        Loading network graph...
      </div>
    </div>
  ),
});

export default NetworkGraph;
