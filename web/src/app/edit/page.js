export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Edit Data | ULAB',
};

export default function EditPage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <h1 className="text-3xl font-bold text-slate-900 mb-6">Manage Data</h1>
      
      <div className="bg-amber-50 border-l-4 border-amber-500 p-4 mb-8 text-amber-800">
        <p className="font-bold">Manual Mode Active</p>
        <p>Because automation has been disabled per user request, data must be regenerated locally using the scraper scripts. You can manually edit the JSON files in the `/data` folder.</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-3xl">
        <h2 className="text-xl font-bold text-slate-900 mb-4">How to Update Data</h2>
        
        <ol className="list-decimal pl-5 space-y-4 text-slate-700">
          <li>
            <strong>Run the Web Scraper:</strong>
            <pre className="mt-2 bg-slate-900 text-slate-50 p-3 rounded text-sm overflow-x-auto">
              python scraper\run_scrape.py
            </pre>
          </li>
          <li>
            <strong>Wait for the Pipeline:</strong>
            <p className="mt-1 text-sm text-slate-500">
              The script will fetch the latest profiles, run the local Ollama LLM to extract keywords, and calculate the sentence embeddings for the network graph.
            </p>
          </li>
          <li>
            <strong>Refresh Website:</strong>
            <p className="mt-1 text-sm text-slate-500">
              Because this app is running dynamically, the updated JSON files will instantly reflect across the site upon refreshing the page.
            </p>
          </li>
        </ol>
      </div>
    </div>
  );
}
