'use client';

import { useState } from 'react';
import BoardSelector from '@/components/BoardSelector';
import SprintSelector from '@/components/SprintSelector';
import UserUtilizationCard from '@/components/UserUtilizationCard';
import SprintSummaryComponent from '@/components/SprintSummary';
import { SprintSummary } from '@/types';
import { EpicBreakdownComponent } from '@/components/EpicBreakdown';
import SprintReport from '@/components/SprintReport';
import WorklogReport from '@/components/WorklogReport';
import CollapsibleSection from '@/components/CollapsibleSection';
import { SprintReportData } from '@/types';

export default function Home() {
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const [sprintData, setSprintData] = useState<SprintSummary | null>(null);
  const [reportData, setReportData] = useState<SprintReportData | null>(null);
  const [jiraDomain, setJiraDomain] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfAiSummary, setPdfAiSummary] = useState<string | null>(null);

  const handleExportPDF = async () => {
    if (!selectedSprintId) return;
    try {
      setPdfLoading(true);
      const res = await fetch(`/api/report/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sprintId: selectedSprintId, boardId: selectedBoardId, aiSummary: pdfAiSummary })
      });
      if (!res.ok) throw new Error('Failed to generate PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] || 'Sprint_Report.pdf';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export failed:', err);
      alert('Failed to generate PDF. Please try again.');
    } finally {
      setPdfLoading(false);
    }
  };

  const handleBoardChange = (boardId: number | null) => {
    setSelectedBoardId(boardId);
    setSelectedSprintId(null); // Reset sprint when board changes
    setSprintData(null);
    setReportData(null);
    setPdfAiSummary(null);
  };

  const handleSprintChange = async (sprintId: number | null) => {
    setSelectedSprintId(sprintId);

    if (!sprintId) {
      setSprintData(null);
      setReportData(null);
      setPdfAiSummary(null);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Include boardId for team filtering
      const url = selectedBoardId
        ? `/api/sprint/${sprintId}?boardId=${selectedBoardId}`
        : `/api/sprint/${sprintId}`;

      const response = await fetch(url);
      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error);
      }

      setSprintData(data.data);
      setReportData(data.report || null);
      setJiraDomain(data.jiraDomain || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sprint data');
      setSprintData(null);
      setPdfAiSummary(null);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    if (selectedSprintId) {
      handleSprintChange(selectedSprintId);
    }
  };

  return (
    <div className="min-h-screen overflow-x-hidden">

      {/* Header */}
      <header className="border-b border-purple-500/20 bg-gray-900/50 backdrop-blur-xl sticky top-0 z-40">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent truncate">
                  Jira Sprint Report
                </h1>
                <p className="text-gray-400 text-xs truncate">Track team utilization and sprint metrics</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {selectedSprintId && (
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="px-3 py-1.5 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </button>
              )}
              {selectedSprintId && sprintData && !loading && (
                <button
                  onClick={handleExportPDF}
                  disabled={pdfLoading}
                  className="px-3 py-1.5 text-xs text-blue-400 hover:text-blue-300 border border-blue-500/30 hover:border-blue-500/60 bg-blue-500/10 hover:bg-blue-500/20 rounded-lg transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {pdfLoading ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                    </svg>
                  )}
                  {pdfLoading ? 'Generating...' : 'Export PDF'}
                </button>
              )}
              <button
                onClick={async () => {
                  await fetch('/api/auth/logout', { method: 'POST' });
                  window.location.href = '/login';
                }}
                className="px-4 py-2 text-sm text-gray-400 hover:text-white border border-gray-700 hover:border-purple-500/50 rounded-lg transition-all duration-200 flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-3 sm:px-4 md:px-6 py-4 md:py-8 max-w-full">
        {/* Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 print:hidden">
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              Select Board
            </label>
            <BoardSelector
              onBoardChange={handleBoardChange}
              selectedBoardId={selectedBoardId}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-300 mb-3">
              Select Sprint
            </label>
            <SprintSelector
              onSprintChange={handleSprintChange}
              selectedSprintId={selectedSprintId}
              boardId={selectedBoardId}
            />
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="p-6 bg-red-500/10 border border-red-500/30 rounded-2xl backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 rounded-full flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-red-400 mb-1">Error Loading Data</h3>
                <p className="text-sm text-red-300/80">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Sprint Data Display */}
        {sprintData && !loading && (
          <div className="space-y-4 md:space-y-8 animate-fadeIn">
            {/* Sprint Summary */}
            <CollapsibleSection title="Sprint Summary" defaultOpen={true}>
              <SprintSummaryComponent summary={sprintData} reportData={reportData} onAiSummaryGenerate={setPdfAiSummary} />
            </CollapsibleSection>

            {/* User Utilizations */}
            <div className="space-y-12">
              {/* Engineers Section */}
              <CollapsibleSection
                title={
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                    <span className="text-blue-400">Engineers</span>
                    <span className="text-sm font-normal text-gray-400">
                      ({sprintData.userUtilizations.filter(u => u.role !== 'qa').length})
                    </span>
                  </div>
                }
                defaultOpen={true}
              >
                {sprintData.userUtilizations.filter(u => u.role !== 'qa').length === 0 ? (
                  <div className="p-8 bg-blue-900/10 border border-blue-500/20 rounded-2xl text-center">
                    <p className="text-blue-300/60">No engineers assigned</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6">
                    {sprintData.userUtilizations
                      .filter(u => u.role !== 'qa')
                      .map((utilization) => (
                        <UserUtilizationCard
                          key={utilization.user.accountId}
                          utilization={utilization}
                        />
                      ))}
                  </div>
                )}
              </CollapsibleSection>

              {/* QA Section */}
              <CollapsibleSection
                title={
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-pink-400"></span>
                    <span className="text-pink-400">QA</span>
                    <span className="text-sm font-normal text-gray-400">
                      ({sprintData.userUtilizations.filter(u => u.role === 'qa').length})
                    </span>
                  </div>
                }
                defaultOpen={false}
              >
                {sprintData.userUtilizations.filter(u => u.role === 'qa').length === 0 ? (
                  <div className="p-8 bg-pink-900/10 border border-pink-500/20 rounded-2xl text-center">
                    <p className="text-pink-300/60">No QA assigned</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {sprintData.userUtilizations
                      .filter(u => u.role === 'qa')
                      .map((utilization) => (
                        <UserUtilizationCard
                          key={utilization.user.accountId}
                          utilization={utilization}
                        />
                      ))}
                  </div>
                )}
              </CollapsibleSection>
            </div>

            {/* Sprint Completion Report */}
            {reportData && (
              <CollapsibleSection title="Sprint Completion & Regression Report" defaultOpen={false}>
                <SprintReport report={reportData} jiraDomain={jiraDomain} />
              </CollapsibleSection>
            )}

            {/* Epic Breakdown */}
            {selectedBoardId && selectedSprintId && (
              <CollapsibleSection title="Epic Delivery Breakdown" defaultOpen={false}>
                <EpicBreakdownComponent
                  boardId={selectedBoardId}
                  sprintId={selectedSprintId}
                />
              </CollapsibleSection>
            )}

            {/* Daily Worklog Tracking */}
            {selectedBoardId && selectedSprintId && (
              <CollapsibleSection title="Daily Worklog Tracking" defaultOpen={false}>
                <WorklogReport
                  boardId={selectedBoardId}
                  sprintId={selectedSprintId}
                />
              </CollapsibleSection>
            )}
          </div>
        )}

        {/* Empty State */}
        {!selectedSprintId && !loading && (
          <div className="flex flex-col items-center justify-center py-20 print:hidden">
            <div className="w-24 h-24 bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-2xl flex items-center justify-center mb-6 border border-purple-500/20">
              <svg className="w-12 h-12 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">Select a Sprint to Begin</h3>
            <p className="text-gray-400 text-center max-w-md">
              Choose a sprint from the dropdown above to view team utilization metrics and sprint analytics
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-purple-500/20 bg-gray-900/50 backdrop-blur-xl mt-20">
        <div className="px-3 sm:px-4 md:px-6 py-6 text-center text-sm text-gray-500">
          <p>Powered by Jira API and Indonesian Holiday API</p>
        </div>
      </footer>
    </div>
  );
}
