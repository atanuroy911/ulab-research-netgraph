import fs from 'fs';
import path from 'path';
import Link from 'next/link';
import { Search } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Faculty Directory | ULAB',
};

async function getFacultyList() {
  try {
    const indexPath = path.join(process.cwd(), '../data/index.json');
    if (!fs.existsSync(indexPath)) return [];
    
    const fileContents = fs.readFileSync(indexPath, 'utf8');
    return JSON.parse(fileContents);
  } catch (error) {
    console.error("Error reading index.json:", error);
    return [];
  }
}

import DirectoryClient from '@/components/DirectoryClient';

export default async function DirectoryPage() {
  const faculty = await getFacultyList();

  return <DirectoryClient faculty={faculty} />;
}

