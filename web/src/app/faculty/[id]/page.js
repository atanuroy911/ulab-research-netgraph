import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { ChevronLeft, Mail, MapPin, Building, GraduationCap, BookOpen, User, Link as LinkIcon } from 'lucide-react';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const fac = await getFacultyData(id);
  
  if (!fac) {
    return { title: 'Faculty Not Found | ULAB' };
  }
  
  return {
    title: `${fac.name} | ULAB Research Network`,
  };
}

async function getFacultyData(id) {
  try {
    const filePath = path.join(process.cwd(), `../data/faculty/${id}.json`);
    if (!fs.existsSync(filePath)) return null;
    
    const fileContents = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(fileContents);
  } catch (error) {
    console.error(`Error reading ${id}.json:`, error);
    return null;
  }
}

async function getSimilarFaculty(id) {
  try {
    const edgesPath = path.join(process.cwd(), '../data/edges.json');
    const indexPath = path.join(process.cwd(), '../data/index.json');
    if (!fs.existsSync(edgesPath) || !fs.existsSync(indexPath)) return [];
    
    const edges = JSON.parse(fs.readFileSync(edgesPath, 'utf8'));
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    
    // Find edges connected to this id
    const connections = edges
      .filter(e => e.source === id || e.target === id)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5); // top 5 similar
      
    // map to actual faculty details
    return connections.map(e => {
      const relatedId = e.source === id ? e.target : e.source;
      const relatedPerson = index.find(p => p.id === relatedId) || { id: relatedId, name: relatedId };
      return {
        ...relatedPerson,
        shared_keywords: e.shared_keywords
      };
    });
    
  } catch (error) {
    console.error("Error reading similarities:", error);
    return [];
  }
}

export default async function FacultyProfile({ params }) {
  const { id } = await params;
  const faculty = await getFacultyData(id);
  
  if (!faculty) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 text-center">
        <h1 className="text-3xl font-bold text-slate-900">Faculty Not Found</h1>
        <p className="text-slate-600 mt-4">We couldn't find a profile for "{id}".</p>
        <Link href="/directory" className="mt-8 inline-block text-ulab-blue hover:underline">
          &larr; Back to Directory
        </Link>
      </div>
    );
  }

  const similarFaculty = await getSimilarFaculty(id);

  return (
    <div className="bg-slate-50 min-h-screen pb-20">
      {/* Header Banner */}
      <div className="bg-ulab-blue text-white pt-10 pb-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/directory" className="inline-flex items-center text-ulab-blue-100 hover:text-white transition-colors mb-6 text-sm">
            <ChevronLeft size={16} className="mr-1" />
            Back to Directory
          </Link>
          
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="w-32 h-32 md:w-48 md:h-48 rounded-lg bg-white overflow-hidden shadow-lg border-4 border-white/20 shrink-0">
              {faculty.photo_url ? (
                <img 
                  src={faculty.photo_url} 
                  alt={faculty.name} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-400">
                  <User size={64} />
                </div>
              )}
            </div>
            
            <div className="pt-2 flex-1">
              <h1 className="text-3xl md:text-4xl font-bold">{faculty.name}</h1>
              <p className="text-xl text-ulab-blue-100 font-medium mt-2">{faculty.title}</p>
              
              <div className="flex flex-col sm:flex-row gap-4 mt-6 text-sm">
                <div className="flex items-start gap-2">
                  <Building size={18} className="text-ulab-yellow shrink-0 mt-0.5" />
                  <span>{faculty.department}</span>
                </div>
                {faculty.school && (
                  <div className="flex items-start gap-2">
                    <GraduationCap size={18} className="text-ulab-yellow shrink-0 mt-0.5" />
                    <span>{faculty.school}</span>
                  </div>
                )}
                {faculty.profile_url && (
                  <div className="flex items-center gap-2">
                    <LinkIcon size={18} className="text-ulab-yellow shrink-0" />
                    <a href={faculty.profile_url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                      Official Profile
                    </a>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Main Content Column */}
          <div className="lg:col-span-2 space-y-8">
            
            {/* Research Keywords */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                Research Domains
              </h2>
              {faculty.extracted_keywords && faculty.extracted_keywords.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {faculty.extracted_keywords.map((kw, i) => (
                    <span 
                      key={i} 
                      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                        kw.verified 
                          ? 'bg-ulab-blue/10 text-ulab-blue border border-ulab-blue/20' 
                          : 'bg-slate-100 text-slate-700 border border-slate-200'
                      }`}
                      title={kw.verified ? "Verified by faculty" : "Inferred by AI"}
                    >
                      {kw.canonical}
                      {kw.verified && <span className="ml-1.5 w-1.5 h-1.5 rounded-full bg-ulab-blue"></span>}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 italic">No research domains extracted yet.</p>
              )}
            </div>

            {/* Biography */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8">
              <h2 className="text-xl font-bold text-slate-900 mb-4">Biography</h2>
              {faculty.bio_raw ? (
                <div className="prose prose-slate max-w-none text-slate-700 whitespace-pre-wrap">
                  {faculty.bio_raw}
                </div>
              ) : (
                <p className="text-slate-500 italic">No biography available.</p>
              )}
            </div>

            {/* Education */}
            {faculty.education && faculty.education.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8">
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <GraduationCap className="text-ulab-red" />
                  Education
                </h2>
                <ul className="space-y-4">
                  {faculty.education.map((edu, i) => (
                    <li key={i} className="text-slate-700">
                      {edu.degree ? (
                        <div>
                          <span className="font-semibold">{edu.degree}</span> in {edu.field}
                          <div className="text-sm text-slate-500 mt-1">
                            {edu.institution} {edu.year && `(${edu.year})`}
                          </div>
                        </div>
                      ) : (
                        <div>{edu.raw}</div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Publications */}
            {faculty.publications_raw && faculty.publications_raw.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 sm:p-8">
                <h2 className="text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <BookOpen className="text-ulab-red" />
                  Publications
                </h2>
                <div className="space-y-6">
                  {faculty.publications_raw.map((pubBlock, i) => (
                    <div key={i} className="prose prose-sm prose-slate max-w-none text-slate-700 whitespace-pre-wrap">
                      {pubBlock}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Sidebar Column */}
          <div className="space-y-8">
            {/* Similar Researchers */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
                Similar Researchers
              </h2>
              {similarFaculty.length > 0 ? (
                <div className="space-y-4">
                  {similarFaculty.map((person) => (
                    <div key={person.id} className="pt-4 first:pt-0 border-t first:border-0 border-slate-100">
                      <Link href={`/faculty/${person.id}`} className="block group">
                        <h3 className="font-semibold text-slate-900 group-hover:text-ulab-blue transition-colors">
                          {person.name}
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{person.department}</p>
                      </Link>
                      <div className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded border border-slate-100">
                        <span className="font-medium">Shared interests: </span>
                        {person.shared_keywords && person.shared_keywords.join(', ')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 italic">No similar researchers calculated yet.</p>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
