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
import { SprintReportData } from '@/types';

export default function Home() {
  const [selectedBoardId, setSelectedBoardId] = useState<number | null>(null);
  const [selectedSprintId, setSelectedSprintId] = useState<number | null>(null);
  const [sprintData, setSprintData] = useState<SprintSummary | null>(null);
  const [reportData, setReportData] = useState<SprintReportData | null>(null);
  const [jiraDomain, setJiraDomain] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleBoardChange = (boardId: number | null) => {
    setSelectedBoardId(boardId);
    setSelectedSprintId(null); // Reset sprint when board changes
    setSprintData(null);
    setReportData(null);
  };

  const handleSprintChange = async (sprintId: number | null) => {
    setSelectedSprintId(sprintId);

    if (!sprintId) {
      setSprintData(null);
      setReportData(null);
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
    <div className="min-h-screen">

      {/* Header */}
      <header className="border-b border-purple-500/20 bg-gray-900/50 backdrop-blur-xl sticky top-0 z-40">
        <div className="container mx-auto px-6 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                  Jira Sprint Report
                </h1>
                <p className="text-gray-400 text-sm">Track team utilization and sprint metrics</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {selectedSprintId && (
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="px-4 py-2 text-sm text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 hover:border-emerald-500/60 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-lg transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {loading ? 'Refreshing...' : 'Refresh'}
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
      <main className="container mx-auto px-6 py-8">
        {/* Selectors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
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
          <div className="space-y-8 animate-fadeIn">
            {/* Sprint Summary */}
            <SprintSummaryComponent summary={sprintData} />

            {/* User Utilizations */}
            <div className="space-y-12">
              {/* Engineers Section */}
              <div>
                <h2 className="text-xl font-bold text-blue-400 mb-6 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                  <span>Engineers</span>
                  <span className="text-sm font-normal text-gray-400">
                    ({sprintData.userUtilizations.filter(u => u.role !== 'qa').length})
                  </span>
                </h2>

                {sprintData.userUtilizations.filter(u => u.role !== 'qa').length === 0 ? (
                  <div className="p-8 bg-blue-900/10 border border-blue-500/20 rounded-2xl text-center">
                    <p className="text-blue-300/60">No engineers assigned</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
              </div>

              {/* QA Section */}
              <div>
                <h2 className="text-xl font-bold text-pink-400 mb-6 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-pink-400"></span>
                  <span>QA</span>
                  <span className="text-sm font-normal text-gray-400">
                    ({sprintData.userUtilizations.filter(u => u.role === 'qa').length})
                  </span>
                </h2>

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
              </div>
            </div>

            {/* Sprint Completion Report */}
            {reportData && (
              <SprintReport report={reportData} jiraDomain={jiraDomain} />
            )}

            {/* Epic Breakdown */}
            {selectedBoardId && selectedSprintId && (
              <EpicBreakdownComponent
                boardId={selectedBoardId}
                sprintId={selectedSprintId}
              />
            )}

            {/* Daily Worklog Tracking */}
            {selectedBoardId && selectedSprintId && (
              <WorklogReport
                boardId={selectedBoardId}
                sprintId={selectedSprintId}
              />
            )}
          </div>
        )}

        {/* Empty State */}
        {!selectedSprintId && !loading && (
          <div className="flex flex-col items-center justify-center py-20">
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
        <div className="container mx-auto px-6 py-6 text-center text-sm text-gray-500">
          <p>Powered by Jira API and Indonesian Holiday API</p>
        </div>
      </footer>
    </div>
  );
}
