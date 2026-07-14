import Link from 'next/link';
import Image from 'next/image';
import { Network, Users, Search, Info } from 'lucide-react';

export default function Navbar() {
  return (
    <header className="bg-ulab-blue text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16 items-center">
          <div className="flex items-center">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="bg-white p-1 rounded-sm flex items-center justify-center">
                <Image src="/ulab.svg" alt="ULAB Logo" width={100} height={40} className="h-8 w-auto object-contain" />
              </div>
              <span className="font-bold text-xl tracking-tight hidden sm:block">
                Research Network
              </span>
            </Link>
          </div>
          
          <nav className="flex space-x-1 sm:space-x-4">
            <Link href="/directory" className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors">
              <Users size={18} />
              <span className="hidden sm:inline">Directory</span>
            </Link>
            <Link href="/network" className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors">
              <Network size={18} />
              <span className="hidden sm:inline">Graph</span>
            </Link>
            <Link href="/match" className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors">
              <Search size={18} />
              <span className="hidden sm:inline">Find Match</span>
            </Link>
            <Link href="/info" className="flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium hover:bg-white/10 transition-colors">
              <Info size={18} />
              <span className="hidden sm:inline">How It Works</span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
