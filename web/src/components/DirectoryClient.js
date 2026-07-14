'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Search, User } from 'lucide-react';

export default function DirectoryClient({ faculty }) {
  const [search, setSearch] = useState('');

  const filteredFaculty = faculty.filter(person => {
    const q = search.toLowerCase();
    if (!q) return true;
    if (person.name && person.name.toLowerCase().includes(q)) return true;
    if (person.department && person.department.toLowerCase().includes(q)) return true;
    if (person.top_keywords && person.top_keywords.some(kw => kw.toLowerCase().includes(q))) return true;
    return false;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Faculty Directory</h1>
          <p className="text-slate-600 mt-2">
            Explore {faculty.length} ULAB researchers and their fields of expertise.
          </p>
        </div>
        
        <div className="relative w-full md:w-80">
          <input 
            type="text" 
            placeholder="Search by name, department, or keyword..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-ulab-blue focus:border-ulab-blue text-slate-900"
          />
          <Search className="absolute left-3 top-2.5 text-slate-400" size={18} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredFaculty.map((person) => {
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
              className="block group bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow flex flex-col"
            >
              <div className="h-48 w-full bg-slate-100 flex items-center justify-center overflow-hidden shrink-0">
                {imgSrc ? (
                  <img src={imgSrc} alt={person.name} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                ) : (
                  <User size={48} className="text-slate-300" />
                )}
              </div>
              <div className="p-5 flex-1 flex flex-col">
                <h3 className="text-lg font-semibold text-slate-900 group-hover:text-ulab-blue transition-colors">
                  {person.name}
                </h3>
                <p className="text-sm font-medium text-ulab-red mt-1">
                  {person.title}
                </p>
                <p className="text-sm text-slate-600 mt-1 line-clamp-1">
                  {person.department}
                </p>
                
                <div className="mt-4 flex flex-wrap gap-2 mt-auto pt-4">
                  {person.top_keywords && person.top_keywords.map((kw, i) => (
                    <span 
                      key={i} 
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800"
                    >
                      {kw}
                    </span>
                  ))}
                  {(!person.top_keywords || person.top_keywords.length === 0) && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-50 text-slate-400 italic">
                      Keywords pending
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
      
      {faculty.length > 0 && filteredFaculty.length === 0 && (
        <div className="text-center py-20 bg-slate-50 rounded-lg border border-dashed border-slate-300">
          <p className="text-slate-500">No faculty match your search.</p>
        </div>
      )}

      {faculty.length === 0 && (
        <div className="text-center py-20 bg-slate-50 rounded-lg border border-dashed border-slate-300">
          <p className="text-slate-500">No faculty data available. Scraper is running.</p>
        </div>
      )}
    </div>
  );
}
