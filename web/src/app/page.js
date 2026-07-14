import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { Search, Users, Network, GraduationCap, Briefcase, Globe } from 'lucide-react';

export const dynamic = 'force-dynamic';

function getStats() {
  try {
    const indexPath = path.join(process.cwd(), '../data/index.json');
    const edgesPath = path.join(process.cwd(), '../data/edges.json');
    const index = fs.existsSync(indexPath) ? JSON.parse(fs.readFileSync(indexPath, 'utf8')) : [];
    const edges = fs.existsSync(edgesPath) ? JSON.parse(fs.readFileSync(edgesPath, 'utf8')) : [];
    const departments = new Set(index.map((p) => p.department).filter(Boolean));

    // A few random faculty with photos + keywords, for the featured strip
    const withPhoto = index.filter((p) => (p.local_image_path || p.photo_url) && p.top_keywords?.length);
    const featured = [...withPhoto].sort(() => Math.random() - 0.5).slice(0, 4);

    return {
      facultyCount: index.length,
      departmentCount: departments.size,
      connectionCount: edges.length,
      featured,
    };
  } catch {
    return { facultyCount: 0, departmentCount: 0, connectionCount: 0, featured: [] };
  }
}

export default function Home() {
  const stats = getStats();

  return (
    <div>
      {/* Hero */}
      <section className="bg-ulab-blue text-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight">
            ULAB Faculty Research Network
          </h1>
          <p className="mt-4 text-lg text-white/80 max-w-2xl mx-auto">
            Discover who works on what across the University of Liberal Arts Bangladesh,
            find collaborators, and explore how research connects across departments.
          </p>

          <form action="/match" className="mt-10 max-w-xl mx-auto flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                name="q"
                placeholder="Describe a research interest, e.g. autonomous drones..."
                className="w-full pl-10 pr-4 py-3 rounded-md text-slate-900 focus:outline-none focus:ring-2 focus:ring-ulab-yellow"
              />
              <Search className="absolute left-3 top-3.5 text-slate-400" size={18} />
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-ulab-yellow text-ulab-blue font-semibold rounded-md hover:bg-ulab-yellow/90 transition-colors"
            >
              Search
            </button>
          </form>

          <div className="mt-12 grid grid-cols-3 gap-6 max-w-lg mx-auto text-center">
            <div>
              <div className="text-3xl font-bold">{stats.facultyCount}</div>
              <div className="text-sm text-white/70">Faculty profiled</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{stats.departmentCount}</div>
              <div className="text-sm text-white/70">Departments</div>
            </div>
            <div>
              <div className="text-3xl font-bold">{stats.connectionCount}</div>
              <div className="text-sm text-white/70">Connections mapped</div>
            </div>
          </div>
        </div>
      </section>

      {/* Entry points */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">
          Where would you like to start?
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Link
            href="/match"
            className="group bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md hover:border-ulab-blue transition-all"
          >
            <GraduationCap className="text-ulab-blue" size={28} />
            <h3 className="mt-4 font-semibold text-slate-900 group-hover:text-ulab-blue">
              I&apos;m a student
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Describe your research interest and find faculty whose expertise matches yours.
            </p>
          </Link>

          <Link
            href="/network"
            className="group bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md hover:border-ulab-blue transition-all"
          >
            <Network className="text-ulab-blue" size={28} />
            <h3 className="mt-4 font-semibold text-slate-900 group-hover:text-ulab-blue">
              I&apos;m faculty
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Explore the research network to find potential collaborators across departments.
            </p>
          </Link>

          <Link
            href="/directory"
            className="group bg-white border border-slate-200 rounded-xl p-6 hover:shadow-md hover:border-ulab-blue transition-all"
          >
            <Globe className="text-ulab-blue" size={28} />
            <h3 className="mt-4 font-semibold text-slate-900 group-hover:text-ulab-blue">
              I&apos;m visiting from outside
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Browse the full faculty directory by name, department, or research area.
            </p>
          </Link>
        </div>
      </section>

      {/* Featured faculty */}
      {stats.featured.length > 0 && (
        <section className="bg-slate-50 border-t border-slate-200">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">
              Featured researchers
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {stats.featured.map((person) => {
                let imgSrc = null;
                if (person.local_image_path) {
                  const filename = person.local_image_path.split(/[\\/]/).pop();
                  imgSrc = `/images/${filename}`;
                } else if (person.photo_url) {
                  imgSrc = person.photo_url;
                }

                return (
                  <Link
                    href={`/faculty/${person.id}`}
                    key={person.id}
                    className="block bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow"
                  >
                    <div className="h-40 w-full bg-slate-100 flex items-center justify-center overflow-hidden">
                      {imgSrc ? (
                        <img src={imgSrc} alt={person.name} className="w-full h-full object-cover" />
                      ) : (
                        <Users size={40} className="text-slate-300" />
                      )}
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-slate-900 text-sm truncate">{person.name}</h3>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{person.department}</p>
                      <div className="mt-3 flex flex-wrap gap-1">
                        {(person.top_keywords || []).slice(0, 2).map((kw, i) => (
                          <span key={i} className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                            {kw}
                          </span>
                        ))}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* Faculty CTA */}
      <section className="border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Briefcase className="text-ulab-red" size={24} />
            <p className="text-slate-700">
              Are you ULAB faculty? Review and correct your auto-extracted keywords.
            </p>
          </div>
          <Link
            href="/edit"
            className="px-5 py-2.5 bg-ulab-blue text-white font-medium rounded-md hover:bg-ulab-blue/90 transition-colors whitespace-nowrap"
          >
            Edit my profile
          </Link>
        </div>
      </section>
    </div>
  );
}
