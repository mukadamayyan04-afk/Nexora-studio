import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  Cpu,
  Database,
  Play,
  RefreshCw,
  Server,
  ShieldCheck,
  Smartphone,
  Square,
  XCircle,
} from 'lucide-react';
import type { SystemMonitorSnapshot } from '../types/nexora';

interface BackendMonitorViewProps {
  onOpenProjectById: (projectId: string) => void;
}

export const BackendMonitorView: React.FC<BackendMonitorViewProps> = ({
  onOpenProjectById,
}) => {
  const [snapshot, setSnapshot] = useState<SystemMonitorSnapshot | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSnapshot = useCallback(async () => {
    try {
      const res = await fetch('/api/monitor/snapshot');
      if (res.ok) {
        const data = (await res.json()) as { snapshot: SystemMonitorSnapshot };
        setSnapshot(data.snapshot);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSnapshot();
    const timer = window.setInterval(() => {
      void fetchSnapshot();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [fetchSnapshot]);

  const handleStopRunner = async (projectId: string) => {
    await fetch(`/api/projects/${projectId}/runtime/stop`, { method: 'POST' });
    void fetchSnapshot();
  };

  const handleCancelJob = async (jobId: string) => {
    await fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' });
    void fetchSnapshot();
  };

  if (loading && !snapshot) {
    return (
      <div className="flex-1 flex items-center justify-center studio-grid-bg text-xs text-[#958ea0]">
        Loading live Backend Control Center metrics...
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto studio-grid-bg p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-[-0.015em] text-[#e4e1e9]">
              Backend Control Center
            </h1>
            <p className="mt-1 text-sm text-[#958ea0]">
              Real-time server metrics, active isolated sandbox processes, persistent job queue, and API logs.
            </p>
          </div>
          <button
            type="button"
            onClick={fetchSnapshot}
            className="btn-kinetic inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md text-xs text-[#e4e1e9] cursor-pointer w-fit"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh Telemetry</span>
          </button>
        </div>

        {snapshot && (
          <>
            {/* Top Status Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-layer-2 rounded-xl p-4 space-y-1.5 border border-white/[0.08]">
                <div className="flex items-center justify-between text-xs text-[#958ea0]">
                  <span>Host Server</span>
                  <Server className="w-4 h-4 text-[#4cd7f6]" />
                </div>
                <div className="font-display text-lg font-semibold text-[#e4e1e9]">
                  {snapshot.server.status.toUpperCase()} · {snapshot.server.uptimeSeconds}s
                </div>
                <div className="font-mono text-[11px] text-[#cbc3d7]">
                  {snapshot.server.nodeVersion} · RSS {snapshot.server.memoryRssMb} MB
                </div>
              </div>

              <div className="glass-layer-2 rounded-xl p-4 space-y-1.5 border border-white/[0.08]">
                <div className="flex items-center justify-between text-xs text-[#958ea0]">
                  <span>Workspace Database</span>
                  <Database className="w-4 h-4 text-[#d0bcff]" />
                </div>
                <div className="font-display text-lg font-semibold text-[#e4e1e9]">
                  {snapshot.database.projectCount} Projects
                </div>
                <div className="font-mono text-[11px] text-[#cbc3d7] truncate">
                  {snapshot.database.engine}
                </div>
              </div>

              <div className="glass-layer-2 rounded-xl p-4 space-y-1.5 border border-white/[0.08]">
                <div className="flex items-center justify-between text-xs text-[#958ea0]">
                  <span>AI Model Engine</span>
                  <Cpu className="w-4 h-4 text-[#4cd7f6]" />
                </div>
                <div className="font-display text-lg font-semibold text-[#e4e1e9]">
                  {snapshot.ai.connectedProviders}/{snapshot.ai.totalProviders} Providers
                </div>
                <div className="font-mono text-[11px] text-[#cbc3d7]">
                  {snapshot.ai.availableFreeModels} live free models ready
                </div>
              </div>

              <div className="glass-layer-2 rounded-xl p-4 space-y-1.5 border border-white/[0.08]">
                <div className="flex items-center justify-between text-xs text-[#958ea0]">
                  <span>GitHub Integration</span>
                  <ShieldCheck className="w-4 h-4 text-[#d0bcff]" />
                </div>
                <div className="font-display text-lg font-semibold text-[#e4e1e9]">
                  {snapshot.auth.githubConnected ? 'Connected' : 'Not Connected'}
                </div>
                <div className="font-mono text-[11px] text-[#cbc3d7]">
                  OAuth Config:{' '}
                  {snapshot.auth.githubOAuthConfigured ? 'Configured' : 'Not Configured (Optional)'}
                </div>
              </div>
            </div>

            {/* Android Build Service Optional Status Banner */}
            <div className="glass-layer-2 rounded-xl px-4 py-3 border border-white/[0.08] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <Smartphone className="w-4 h-4 text-[#4cd7f6] shrink-0" />
                <div>
                  <span className="font-display font-semibold text-[#e4e1e9]">
                    Android Build Service:{' '}
                  </span>
                  <span className="font-mono text-[#cbc3d7]">
                    {snapshot.androidBuild.serviceConfigured
                      ? 'Configured'
                      : snapshot.androidBuild.localToolchainReady
                      ? 'Local SDK Ready'
                      : 'Not Configured'}
                  </span>
                </div>
              </div>
              <div className="font-mono text-[11px] text-[#958ea0]">
                Optional · JDK={snapshot.androidBuild.java ? 'ready' : 'missing'} · Gradle=
                {snapshot.androidBuild.gradle ? 'ready' : 'missing'} · SDK=
                {snapshot.androidBuild.androidSdk ? 'ready' : 'missing'} · Export Source ZIP
                available anytime
              </div>
            </div>

            {/* Active Isolated Preview Runners & Background Job Queue */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <section className="glass-layer-2 rounded-xl p-4 space-y-3 border border-white/[0.08]">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-sm font-semibold text-[#e4e1e9] flex items-center gap-2">
                    <Play className="w-4 h-4 text-[#4cd7f6]" />
                    <span>Isolated Project Runners ({snapshot.runners.length})</span>
                  </h2>
                </div>
                {snapshot.runners.length === 0 ? (
                  <p className="text-xs text-[#958ea0] py-4">
                    No isolated user servers are currently running. Start a Website backend server inside any Project Workspace.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {snapshot.runners.map((r) => (
                      <div
                        key={r.projectId}
                        className="p-3 rounded-lg bg-[#0a0a0f]/80 border border-white/[0.06] flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => onOpenProjectById(r.projectId)}
                            className="font-mono text-[#4cd7f6] hover:underline cursor-pointer truncate block"
                          >
                            {r.projectId}
                          </button>
                          <div className="text-[11px] text-[#958ea0] font-mono">
                            Status: {r.status} {r.port ? `· Port ${r.port}` : '· Static'}
                            {r.pid ? ` · PID ${r.pid}` : ''}
                          </div>
                        </div>
                        {r.status === 'running' && (
                          <button
                            type="button"
                            onClick={() => handleStopRunner(r.projectId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#93000a]/30 text-[#ffb4ab] cursor-pointer"
                          >
                            <Square className="w-3 h-3" />
                            <span>Stop</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className="glass-layer-2 rounded-xl p-4 space-y-3 border border-white/[0.08]">
                <h2 className="font-display text-sm font-semibold text-[#e4e1e9] flex items-center gap-2">
                  <Activity className="w-4 h-4 text-[#d0bcff]" />
                  <span>Background Jobs ({snapshot.jobs.length})</span>
                </h2>
                {snapshot.jobs.length === 0 ? (
                  <p className="text-xs text-[#958ea0] py-4">No background jobs recorded yet.</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {snapshot.jobs.map((job) => (
                      <div
                        key={job.id}
                        className="p-3 rounded-lg bg-[#0a0a0f]/80 border border-white/[0.06] space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[#e4e1e9]">
                            {job.type} · {job.projectName || job.projectId || 'Workspace'}
                          </span>
                          <div className="flex items-center gap-2">
                            <span
                              className={`font-mono text-[11px] ${
                                job.status === 'completed'
                                  ? 'text-[#4cd7f6]'
                                  : job.status === 'failed'
                                  ? 'text-[#ffb4ab]'
                                  : 'text-[#d0bcff]'
                              }`}
                            >
                              {job.status} ({job.progress}%)
                            </span>
                            {(job.status === 'queued' || job.status === 'running') && (
                              <button
                                type="button"
                                onClick={() => handleCancelJob(job.id)}
                                aria-label="Cancel job"
                                className="text-[#ffb4ab] cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="text-[11px] text-[#958ea0]">{job.step}</div>
                        {job.error && <div className="text-[11px] text-[#ffb4ab]">{job.error}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>

            {/* Live Server Request Ring Buffer */}
            <section className="glass-layer-2 rounded-xl p-4 space-y-3 border border-white/[0.08]">
              <h2 className="font-display text-sm font-semibold text-[#e4e1e9]">
                Recent Server &amp; API Request Logs
              </h2>
              <div className="max-h-64 overflow-y-auto font-mono text-[11.5px] space-y-1 bg-[#0a0a0f]/80 rounded-lg p-3 border border-white/[0.05]">
                {snapshot.apiLogs.map((log) => (
                  <div key={log.id} className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={
                          log.statusCode >= 400 ? 'text-[#ffb4ab]' : 'text-[#4cd7f6]'
                        }
                      >
                        {log.statusCode}
                      </span>
                      <span className="text-[#d0bcff] w-12 shrink-0">{log.method}</span>
                      <span className="text-[#e4e1e9] truncate">{log.path}</span>
                    </div>
                    <span className="text-[#958ea0] shrink-0 tabular-nums">
                      {log.durationMs}ms · {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                ))}
                {snapshot.apiLogs.length === 0 && (
                  <div className="text-[#958ea0]">No API requests logged yet.</div>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
};
