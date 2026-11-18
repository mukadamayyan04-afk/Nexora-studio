import React, { useCallback, useEffect, useState } from 'react';
import { Check, Download, X } from 'lucide-react';
import { AssetLibraryView } from './components/AssetLibraryView';
import { BackendMonitorView } from './components/BackendMonitorView';
import { ComputeShaderView } from './components/ComputeShaderView';
import { ContextualInspector } from './components/ContextualInspector';
import { HomeView } from './components/HomeView';
import { ModelHubView } from './components/ModelHubView';
import { MyProjectsView } from './components/MyProjectsView';
import { NodePipelineCanvas } from './components/NodePipelineCanvas';
import { ProfileView } from './components/ProfileView';
import { ProjectWorkspaceView } from './components/ProjectWorkspaceView';
import { SceneHierarchySidebar } from './components/SceneHierarchySidebar';
import { SettingsView } from './components/SettingsView';
import { SpatialViewport } from './components/SpatialViewport';
import { SplashLoader } from './components/SplashLoader';
import { TemplateLibraryView } from './components/TemplateLibraryView';
import { TopBar } from './components/TopBar';
import {
  INITIAL_ASSETS,
  INITIAL_COMPUTE_SCRIPTS,
  INITIAL_LAYERS,
  INITIAL_LIGHTING,
  INITIAL_MATERIAL,
  INITIAL_PIPELINE_EDGES,
  INITIAL_PIPELINE_NODES,
  INITIAL_TRANSFORM,
} from './data/studioData';
import {
  AIProviderConfig,
  FreeFallbackOption,
  ModelCategory,
  NexoraProject,
  ProjectType,
  ReferenceAttachment,
  TopNavSection,
  UserProfile,
  UserSettings,
} from './types/nexora';
import {
  ComputeScript,
  PipelineEdge,
  PipelineNode,
  SceneLayer,
  SceneLighting,
  SceneMaterial,
  SceneTransform,
  StudioAsset,
  StudioScreen,
} from './types/studio';

function parseRoute(
  pathname: string,
  search: string
): { section: TopNavSection; projectId: string | null } {
  const cleanPath = pathname.replace(/\/+$/, '') || '/';
  const params = new URLSearchParams(search);
  const queryProject = params.get('project');

  if (cleanPath === '/' || cleanPath === '/home') {
    if (queryProject) return { section: 'workspace', projectId: queryProject };
    return { section: 'home', projectId: null };
  }
  if (cleanPath === '/models') return { section: 'models', projectId: null };
  if (cleanPath === '/templates') return { section: 'templates', projectId: null };
  if (cleanPath === '/projects') return { section: 'projects', projectId: null };
  if (cleanPath === '/monitor') return { section: 'monitor', projectId: null };
  if (cleanPath === '/settings') return { section: 'settings', projectId: null };
  if (cleanPath === '/profile') return { section: 'profile', projectId: null };
  if (cleanPath === '/studio') return { section: 'studio', projectId: null };
  if (cleanPath === '/workspace') {
    return { section: 'workspace', projectId: queryProject };
  }
  if (cleanPath.startsWith('/workspace/')) {
    const id = decodeURIComponent(cleanPath.slice('/workspace/'.length)).split('/')[0] || null;
    return { section: 'workspace', projectId: id };
  }
  return { section: 'home', projectId: null };
}

function buildPathForRoute(section: TopNavSection, projectId?: string | null): string {
  switch (section) {
    case 'home':
      return '/';
    case 'models':
      return '/models';
    case 'templates':
      return '/templates';
    case 'projects':
      return '/projects';
    case 'monitor':
      return '/monitor';
    case 'settings':
      return '/settings';
    case 'profile':
      return '/profile';
    case 'studio':
      return '/studio';
    case 'workspace':
      return projectId ? `/workspace/${encodeURIComponent(projectId)}` : '/workspace';
  }
}

const DEFAULT_PROFILE: UserProfile = {
  id: 'studio-owner',
  displayName: 'Nexora Creator',
  handle: 'nexora_architect',
  email: 'creator@nexora.studio',
  role: 'App & Game Architect',
  bio: 'Building Android APKs, interactive games, and web applications in Nexora Studio.',
  avatarInitials: 'NC',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const DEFAULT_SETTINGS: UserSettings = {
  defaultProjectType: 'android-apk',
  smartRouting: true,
  preferredModelId: 'gemini-4-hydrogen',
  editorTabSize: 2,
  autoSaveOnBlur: false,
  compactDensity: false,
  accentPreset: 'violet-cyan',
  updatedAt: new Date().toISOString(),
};

export default function App() {
  const initialRoute = parseRoute(window.location.pathname, window.location.search);

  const [activeSection, setActiveSection] = useState<TopNavSection>(initialRoute.section);
  const [routeProjectId, setRouteProjectId] = useState<string | null>(initialRoute.projectId);

  // Model Hub + Projects + Instant Workspace + Profile/Settings state
  const [providers, setProviders] = useState<AIProviderConfig[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string>('gemini-4-hydrogen');
  const [smartRouting, setSmartRouting] = useState<boolean>(true);
  const [savedProjects, setSavedProjects] = useState<NexoraProject[]>([]);
  const [activeProject, setActiveProject] = useState<NexoraProject | null>(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState<boolean>(
    Boolean(initialRoute.section === 'workspace' && initialRoute.projectId)
  );
  const [missingWorkspaceId, setMissingWorkspaceId] = useState<string | null>(null);
  const [isInitializingProject, setIsInitializingProject] = useState(false);
  const [creationError, setCreationError] = useState<{
    message: string;
    fallbacks?: FreeFallbackOption[];
  } | null>(null);

  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [isBooting, setIsBooting] = useState<boolean>(true);

  // Preserved 3D Studio (Synthetic Hyper-Engine) state
  const [activeScreen, setActiveScreen] = useState<StudioScreen>('viewport');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [inspectorCollapsed, setInspectorCollapsed] = useState(false);

  const [assets, setAssets] = useState<StudioAsset[]>(INITIAL_ASSETS);
  const [activeAsset, setActiveAsset] = useState<StudioAsset>(INITIAL_ASSETS[0]);
  const [transform, setTransform] = useState<SceneTransform>(INITIAL_TRANSFORM);
  const [material, setMaterial] = useState<SceneMaterial>(INITIAL_MATERIAL);
  const [lighting, setLighting] = useState<SceneLighting>(INITIAL_LIGHTING);

  const [layers, setLayers] = useState<SceneLayer[]>(INITIAL_LAYERS);
  const [selectedLayerId, setSelectedLayerId] = useState<string>(INITIAL_LAYERS[0].id);

  const [nodes, setNodes] = useState<PipelineNode[]>(INITIAL_PIPELINE_NODES);
  const [edges, setEdges] = useState<PipelineEdge[]>(INITIAL_PIPELINE_EDGES);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    INITIAL_PIPELINE_NODES[1].id
  );
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);

  const [scripts, setScripts] = useState<ComputeScript[]>(INITIAL_COMPUTE_SCRIPTS);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setStatusToast(msg);
    window.setTimeout(() => {
      setStatusToast((prev) => (prev === msg ? null : prev));
    }, 3200);
  }, []);

  // Apply theme preset attribute cleanly
  useEffect(() => {
    document.documentElement.setAttribute('data-accent', settings.accentPreset);
  }, [settings.accentPreset]);

  const navigateTo = useCallback(
    (section: TopNavSection, targetProjectId?: string | null, replace = false) => {
      const nextProjId =
        section === 'workspace'
          ? targetProjectId !== undefined
            ? targetProjectId
            : activeProject?.id || routeProjectId || null
          : null;

      const nextPath = buildPathForRoute(section, nextProjId);
      const currentFull = `${window.location.pathname}${window.location.search}`;
      if (currentFull !== nextPath) {
        if (replace) {
          window.history.replaceState({ section, projectId: nextProjId }, '', nextPath);
        } else {
          window.history.pushState({ section, projectId: nextProjId }, '', nextPath);
        }
      }

      setActiveSection(section);
      setRouteProjectId(nextProjId);
      setMissingWorkspaceId(null);
      setMobileDrawerOpen(false);
    },
    [activeProject?.id, routeProjectId]
  );

  // Sync browser Back & Forward navigation
  useEffect(() => {
    const onPopState = () => {
      const parsed = parseRoute(window.location.pathname, window.location.search);
      setActiveSection(parsed.section);
      setRouteProjectId(parsed.projectId);
      setMissingWorkspaceId(null);
      setMobileDrawerOpen(false);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Load initial providers, projects, profile, and settings
  useEffect(() => {
    const loadInitial = async () => {
      try {
        const [provRes, projRes, profRes, settRes] = await Promise.all([
          fetch('/api/models/providers'),
          fetch('/api/projects'),
          fetch('/api/user/profile'),
          fetch('/api/user/settings'),
        ]);

        let loadedSettings: UserSettings | null = null;
        if (settRes.ok) {
          const sData = (await settRes.json()) as { settings: UserSettings };
          loadedSettings = sData.settings;
          setSettings(sData.settings);
          setSmartRouting(sData.settings.smartRouting);
          if (sData.settings.preferredModelId) {
            setSelectedModelId(sData.settings.preferredModelId);
          }
        }

        if (profRes.ok) {
          const pData = (await profRes.json()) as { profile: UserProfile };
          setProfile(pData.profile);
        }

        if (provRes.ok) {
          const data = (await provRes.json()) as { providers: AIProviderConfig[] };
          setProviders(data.providers);
          const preferredId = loadedSettings?.preferredModelId || 'gemini-4-hydrogen';
          const allAvail = data.providers
            .filter((p) => p.status === 'connected')
            .flatMap((p) => p.models)
            .filter((m) => m.available && !m.categories.includes('image-gen'));
          const matchedPreferred = allAvail.find((m) => m.id === preferredId);
          if (matchedPreferred) {
            setSelectedModelId(matchedPreferred.id);
          } else if (allAvail[0]) {
            setSelectedModelId(allAvail[0].id);
          }
        }

        if (projRes.ok) {
          const data = (await projRes.json()) as { projects: NexoraProject[] };
          setSavedProjects(data.projects);
          const parsed = parseRoute(window.location.pathname, window.location.search);
          if (parsed.section === 'workspace' && parsed.projectId) {
            const match = data.projects.find((p) => p.id === parsed.projectId);
            if (match) {
              setActiveProject(match);
              setIsLoadingWorkspace(false);
            }
          } else {
            const storedId = window.localStorage.getItem('nexora_active_project_id');
            const restored =
              (storedId && data.projects.find((p) => p.id === storedId)) ||
              data.projects[0] ||
              null;
            if (restored) setActiveProject(restored);
          }
        }
      } catch {
        // Network failures surface gracefully in views
      } finally {
        setIsBooting(false);
      }
    };
    loadInitial();
  }, []);

  // Load workspace directly from API whenever route is /workspace/:projectId
  useEffect(() => {
    if (activeSection !== 'workspace') return;
    if (!routeProjectId) {
      setIsLoadingWorkspace(false);
      setMissingWorkspaceId(null);
      return;
    }

    const fromCache = savedProjects.find((p) => p.id === routeProjectId);
    if (fromCache) {
      setActiveProject(fromCache);
      setIsLoadingWorkspace(false);
      setMissingWorkspaceId(null);
      return;
    }

    let cancelled = false;
    setIsLoadingWorkspace(true);
    setMissingWorkspaceId(null);
    fetch(`/api/projects/${encodeURIComponent(routeProjectId)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setActiveProject(null);
          setMissingWorkspaceId(routeProjectId);
          return;
        }
        const data = (await res.json()) as { project: NexoraProject };
        setActiveProject(data.project);
        setSavedProjects((prev) =>
          prev.some((p) => p.id === data.project.id) ? prev : [data.project, ...prev]
        );
      })
      .catch(() => {
        if (!cancelled) {
          setMissingWorkspaceId(routeProjectId);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingWorkspace(false);
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection, routeProjectId, savedProjects]);

  // Subscribe to real-time SSE generation updates whenever activeProject is queued/generating
  useEffect(() => {
    if (!activeProject) return;
    window.localStorage.setItem('nexora_active_project_id', activeProject.id);

    const needsLiveStream =
      activeProject.generationStatus === 'queued' ||
      activeProject.generationStatus === 'generating';
    if (!needsLiveStream) return;

    const es = new EventSource(`/api/projects/${activeProject.id}/events`);
    es.onmessage = (event) => {
      try {
        const updated = JSON.parse(event.data) as NexoraProject;
        setActiveProject(updated);
        setSavedProjects((prev) =>
          prev.some((p) => p.id === updated.id)
            ? prev.map((p) => (p.id === updated.id ? updated : p))
            : [updated, ...prev]
        );
        if (updated.generationStatus === 'completed') {
          showToast(`Generated ${updated.files.length} files for "${updated.name}"`);
          es.close();
        } else if (updated.generationStatus === 'error') {
          es.close();
        }
      } catch {
        // Ignore malformed SSE event
      }
    };
    es.onerror = () => {
      es.close();
    };
    return () => {
      es.close();
    };
  }, [activeProject?.id, activeProject?.generationStatus, showToast]);

  // Profile & Settings handlers
  const handleSaveProfile = async (
    patch: Partial<Pick<UserProfile, 'displayName' | 'handle' | 'email' | 'role' | 'bio'>>
  ) => {
    const res = await fetch('/api/user/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { profile?: UserProfile; error?: string };
    if (!res.ok || !data.profile) throw new Error(data.error || 'Failed to update profile');
    setProfile(data.profile);
    showToast('Profile saved');
  };

  const handleSaveSettings = async (patch: Partial<Omit<UserSettings, 'updatedAt'>>) => {
    const res = await fetch('/api/user/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    const data = (await res.json()) as { settings?: UserSettings; error?: string };
    if (!res.ok || !data.settings) throw new Error(data.error || 'Failed to save settings');
    setSettings(data.settings);
    setSmartRouting(data.settings.smartRouting);
    if (data.settings.preferredModelId) setSelectedModelId(data.settings.preferredModelId);
    showToast('Settings saved');
  };

  const handleResetSettings = async () => {
    const res = await fetch('/api/user/settings/reset', { method: 'POST' });
    const data = (await res.json()) as { settings?: UserSettings };
    if (res.ok && data.settings) {
      setSettings(data.settings);
      setSmartRouting(data.settings.smartRouting);
      setSelectedModelId(data.settings.preferredModelId);
      showToast('Settings reset to defaults');
    }
  };

  // AI Model Hub handlers
  const handleSaveProviderKey = async (providerId: string, apiKey: string) => {
    const res = await fetch('/api/models/providers/key', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, apiKey }),
    });
    const data = (await res.json()) as { providers?: AIProviderConfig[]; error?: string };
    if (!res.ok) throw new Error(data.error || 'Failed to save key');
    if (data.providers) setProviders(data.providers);
  };

  const handleTestProvider = async (providerId: string) => {
    const res = await fetch(`/api/models/providers/${providerId}/test`, {
      method: 'POST',
    });
    const data = (await res.json()) as {
      provider?: AIProviderConfig;
      providers?: AIProviderConfig[];
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || 'Connection test failed');
    if (data.providers) setProviders(data.providers);
    if (data.provider) {
      showToast(`${data.provider.name}: ${data.provider.status}`);
    }
  };

  const handleRefreshAllAvailability = async () => {
    const res = await fetch('/api/models/availability/refresh', { method: 'POST' });
    if (res.ok) {
      const data = (await res.json()) as { providers: AIProviderConfig[] };
      setProviders(data.providers);
    }
  };

  const handleAddCustomProvider = async (input: {
    name: string;
    baseUrl: string;
    apiKey?: string;
    modelId: string;
    modelName: string;
    category: ModelCategory;
    freeAccessConfirmed: boolean;
  }) => {
    const res = await fetch('/api/models/providers/custom', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as { providers?: AIProviderConfig[]; error?: string };
    if (!res.ok) throw new Error(data.error || 'Failed to add provider');
    if (data.providers) setProviders(data.providers);
    showToast(`Added free provider "${input.name}"`);
  };

  const handleAddModelToProvider = async (input: {
    providerId: string;
    modelId: string;
    modelName: string;
    contextWindow?: string;
    category: ModelCategory;
    freeAccessConfirmed: boolean;
  }) => {
    const res = await fetch('/api/models/providers/model', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) throw new Error(data.error || 'Failed to add model');
    const provRes = await fetch('/api/models/providers');
    if (provRes.ok) {
      const provData = (await provRes.json()) as { providers: AIProviderConfig[] };
      setProviders(provData.providers);
    }
    showToast(`Added model "${input.modelName}"`);
  };

  // Instant Workspace Navigation + Project Creation
  const handleStartCreating = async (input: {
    prompt: string;
    type: ProjectType;
    gameGenre?: string;
    attachments: ReferenceAttachment[];
  }) => {
    if (isInitializingProject) return;
    setIsInitializingProject(true);
    setCreationError(null);
    try {
      const res = await fetch('/api/projects/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...input,
          selectedModelId,
          smartRouting,
        }),
      });
      const data = (await res.json()) as {
        project?: NexoraProject;
        error?: string;
        fallbackSuggestions?: FreeFallbackOption[];
      };
      if (!res.ok || !data.project) {
        setCreationError({
          message: data.error || 'Unable to start project.',
          fallbacks: data.fallbackSuggestions,
        });
        return;
      }

      setActiveProject(data.project);
      setSavedProjects((prev) => [
        data.project!,
        ...prev.filter((p) => p.id !== data.project!.id),
      ]);
      navigateTo('workspace', data.project.id);
    } catch (err) {
      setCreationError({
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsInitializingProject(false);
    }
  };

  const syncUpdatedProject = (updated: NexoraProject) => {
    setActiveProject(updated);
    setSavedProjects((prev) =>
      prev.some((p) => p.id === updated.id)
        ? prev.map((p) => (p.id === updated.id ? updated : p))
        : [updated, ...prev]
    );
  };

  const handleRetryGeneration = async (projectId: string, modelId?: string) => {
    const res = await fetch(`/api/projects/${projectId}/retry`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId }),
    });
    const data = (await res.json()) as { project?: NexoraProject; error?: string };
    if (res.ok && data.project) {
      syncUpdatedProject(data.project);
    }
  };

  const handleRenameProject = async (projectId: string, name: string) => {
    const res = await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const data = (await res.json()) as { project?: NexoraProject; error?: string };
    if (res.ok && data.project) {
      syncUpdatedProject(data.project);
      showToast(`Renamed to "${data.project.name}"`);
    }
  };

  const handleDuplicateProject = async (projectId: string) => {
    const res = await fetch(`/api/projects/${projectId}/duplicate`, { method: 'POST' });
    const data = (await res.json()) as { project?: NexoraProject };
    if (res.ok && data.project) {
      setSavedProjects((prev) => [data.project!, ...prev]);
      setActiveProject(data.project);
      navigateTo('workspace', data.project.id);
      showToast(`Duplicated "${data.project.name}"`);
    }
  };

  const handleSaveProjectFile = async (projectId: string, path: string, content: string) => {
    const res = await fetch(`/api/projects/${projectId}/files`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, content }),
    });
    const data = (await res.json()) as { project?: NexoraProject; error?: string };
    if (!res.ok || !data.project) throw new Error(data.error || 'Failed to save file');
    syncUpdatedProject(data.project);
    showToast(`Saved ${path}`);
  };

  const handleSaveProjectSnapshot = async (projectId: string) => {
    const res = await fetch(`/api/projects/${projectId}/save`, { method: 'POST' });
    const data = (await res.json()) as { project?: NexoraProject; error?: string };
    if (!res.ok || !data.project) throw new Error(data.error || 'Failed to save project');
    syncUpdatedProject(data.project);
    showToast('Workspace snapshot saved');
  };

  const handleApproveAsset = async (projectId: string, assetId: string) => {
    const res = await fetch(`/api/projects/${projectId}/assets/${assetId}/approve`, {
      method: 'POST',
    });
    const data = (await res.json()) as { project?: NexoraProject; error?: string };
    if (!res.ok || !data.project) throw new Error(data.error || 'Failed to approve asset');
    syncUpdatedProject(data.project);
    showToast('Asset approved and added to project');
  };

  const handleSendChat = async (
    projectId: string,
    message: string,
    activeFilePath?: string,
    modelId?: string,
    useSmart?: boolean
  ) => {
    const res = await fetch(`/api/projects/${projectId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        activeFilePath,
        selectedModelId: modelId,
        smartRouting: useSmart,
      }),
    });
    const data = (await res.json()) as {
      project?: NexoraProject;
      error?: string;
      fallbackSuggestions?: FreeFallbackOption[];
    };
    if (!res.ok || !data.project) {
      const err = new Error(data.error || 'AI chat request failed') as Error & {
        fallbacks?: FreeFallbackOption[];
      };
      err.fallbacks = data.fallbackSuggestions;
      throw err;
    }
    syncUpdatedProject(data.project);
  };

  const handleRunBuild = async (projectId: string) => {
    const res = await fetch(`/api/projects/${projectId}/build`, {
      method: 'POST',
    });
    const data = (await res.json()) as { project?: NexoraProject; error?: string };
    if (!res.ok || !data.project) throw new Error(data.error || 'Build request failed');
    syncUpdatedProject(data.project);
    showToast(`Build status: ${data.project.build.status}`);
  };

  const handleDeleteProject = async (projectId: string) => {
    await fetch(`/api/projects/${projectId}`, { method: 'DELETE' });
    setSavedProjects((prev) => prev.filter((p) => p.id !== projectId));
    if (activeProject?.id === projectId) {
      setActiveProject(null);
      window.localStorage.removeItem('nexora_active_project_id');
    }
    if (routeProjectId === projectId) {
      setRouteProjectId(null);
    }
    showToast('Project removed');
  };

  // Preserved 3D Studio handlers
  const handleLoadAsset = (asset: StudioAsset) => {
    setActiveAsset(asset);
    setMaterial(asset.defaultMaterial);
    setTransform(INITIAL_TRANSFORM);
    setActiveScreen('viewport');
    setMobileDrawerOpen(false);
    showToast(`Loaded "${asset.title}" into Spatial Viewport`);
  };

  const handleDuplicateAsset = (asset: StudioAsset) => {
    const copy: StudioAsset = {
      ...asset,
      id: `${asset.id}-${Date.now()}`,
      title: `${asset.title} Variant`,
      updatedAt: 'Created just now',
    };
    setAssets((prev) => [copy, ...prev]);
    showToast(`Duplicated "${asset.title}"`);
  };

  const handleToggleLayerVisibility = (id: string) => {
    setLayers((prev) =>
      prev.map((layer) => (layer.id === id ? { ...layer, visible: !layer.visible } : layer))
    );
  };

  const handleToggleLayerLock = (id: string) => {
    setLayers((prev) =>
      prev.map((layer) => (layer.id === id ? { ...layer, locked: !layer.locked } : layer))
    );
  };

  const handleMoveNode = (id: string, x: number, y: number) => {
    setNodes((prev) => prev.map((n) => (n.id === id ? { ...n, x, y } : n)));
  };

  const handleUpdateNodeParam = (nodeId: string, paramKey: string, value: number) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              params: n.params.map((p) => (p.key === paramKey ? { ...p, value } : p)),
            }
          : n
      )
    );
  };

  const handleToggleNodeEnabled = (nodeId: string) => {
    setNodes((prev) =>
      prev.map((n) => (n.id === nodeId ? { ...n, enabled: !n.enabled } : n))
    );
  };

  const handleAddNode = (category: PipelineNode['category']) => {
    const id = `node-${Date.now()}`;
    const titleMap: Record<PipelineNode['category'], string> = {
      generator: 'Volumetric Field Synth',
      modifier: 'Subdivision Smooth Pass',
      shader: 'Chromatic Fresnel Node',
      output: 'Render Stage Output',
    };
    const newNode: PipelineNode = {
      id,
      title: titleMap[category],
      category,
      x: 190 + (nodes.length % 4) * 36,
      y: 180 + (nodes.length % 3) * 44,
      enabled: true,
      inputs: [{ id: `${id}-in`, label: 'Input Stream', type: 'stream' }],
      outputs: [{ id: `${id}-out`, label: 'Output Stream', type: 'transform' }],
      params: [
        { key: 'strength', label: 'Intensity', value: 0.72, min: 0, max: 1, step: 0.02 },
      ],
      status: 'idle',
    };
    setNodes((prev) => [...prev, newNode]);
    setSelectedNodeId(id);
    showToast(`Added ${titleMap[category]}`);
  };

  const handleRunPipeline = () => {
    if (isPipelineRunning) return;
    setIsPipelineRunning(true);
    setNodes((prev) => prev.map((n) => ({ ...n, status: n.enabled ? 'running' : 'idle' })));
    window.setTimeout(() => {
      setNodes((prev) =>
        prev.map((n) => ({ ...n, status: n.enabled ? 'compiled' : 'idle' }))
      );
      setIsPipelineRunning(false);
      showToast('Pipeline execution compiled cleanly');
    }, 1100);
  };

  const handleResetPipelineLayout = () => {
    setNodes(INITIAL_PIPELINE_NODES);
    setEdges(INITIAL_PIPELINE_EDGES);
    setSelectedNodeId(INITIAL_PIPELINE_NODES[1].id);
  };

  const handleSynthesizePrompt = (promptText: string, modelName: string) => {
    setIsSynthesizing(true);
    window.setTimeout(() => {
      const targetTemplate =
        modelName === 'Shader-Core'
          ? INITIAL_ASSETS[1]
          : modelName === 'Terrain-Gen'
          ? INITIAL_ASSETS[3]
          : INITIAL_ASSETS[2];

      const shortTitle =
        promptText.length > 32 ? `${promptText.slice(0, 32).trim()}...` : promptText;

      const generatedAsset: StudioAsset = {
        ...targetTemplate,
        id: `synth-${Date.now()}`,
        title: shortTitle,
        promptUsed: promptText,
        updatedAt: 'Synthesized just now',
        author: 'Studio Session',
        defaultMaterial: {
          ...targetTemplate.defaultMaterial,
          rimTint: modelName === 'Shader-Core' ? 'dual' : 'cyan',
          emissiveIntensity: 0.75,
        },
      };

      setAssets((prev) => [generatedAsset, ...prev]);
      setActiveAsset(generatedAsset);
      setMaterial(generatedAsset.defaultMaterial);
      setIsSynthesizing(false);
      showToast(`Synthesized pass with ${modelName}`);
    }, 950);
  };

  const handleUpdateScript = (updated: ComputeScript) => {
    setScripts((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  };

  const sceneManifest = JSON.stringify(
    {
      engine: 'Nexora Studio · Synthetic Hyper-Engine',
      activeAsset: {
        id: activeAsset.id,
        title: activeAsset.title,
        polyCount: activeAsset.polyCount,
        resolution: activeAsset.resolution,
      },
      transform,
      material,
      lighting,
      pipelineNodes: nodes.map((n) => ({
        id: n.id,
        title: n.title,
        enabled: n.enabled,
        params: n.params,
      })),
    },
    null,
    2
  );

  const handleDownloadJson = () => {
    const blob = new Blob([sceneManifest], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${activeAsset.id}-scene.json`;
    link.click();
    URL.revokeObjectURL(url);
    setExportOpen(false);
    showToast('Exported scene manifest JSON');
  };

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const showRightInspector = activeScreen === 'viewport' || activeScreen === 'pipeline';

  return (
    <div className="min-h-screen h-screen flex flex-col bg-[#0a0a0f] text-[#e4e1e9] overflow-hidden">
      {isBooting && <SplashLoader message="Connecting Nexora Studio workspace..." />}
      <TopBar
        activeSection={activeSection}
        onSelectSection={(sec) => navigateTo(sec)}
        onPrimaryAction={() => {
          if (activeSection === 'studio') {
            setExportOpen(true);
          } else {
            navigateTo('home');
          }
        }}
        onToggleSidebar={() => setMobileDrawerOpen((prev) => !prev)}
        showSidebarToggle={activeSection === 'studio'}
        userInitials={profile.avatarInitials}
      />

      {/* Mobile Secondary Nav Bar (< md) */}
      <div className="md:hidden glass-layer-1 border-b border-white/[0.06] px-3 py-1.5 flex items-center gap-1 overflow-x-auto shrink-0">
        {(
          [
            { id: 'home', label: 'Home' },
            { id: 'models', label: 'AI Models' },
            { id: 'templates', label: 'Templates' },
            { id: 'projects', label: 'My Projects' },
            { id: 'workspace', label: 'Workspace' },
            { id: 'monitor', label: 'Monitor' },
            { id: 'settings', label: 'Settings' },
            { id: 'profile', label: 'Profile' },
            { id: 'studio', label: '3D Studio' },
          ] as { id: TopNavSection; label: string }[]
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => navigateTo(item.id)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 ${
              activeSection === item.id
                ? 'bg-[#8b5cf6]/25 text-[#e4e1e9] border border-[#8b5cf6]/45'
                : 'text-[#958ea0]'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* SECTION 1: HOME */}
      {activeSection === 'home' && (
        <HomeView
          providers={providers}
          selectedModelId={selectedModelId}
          onSelectModelId={setSelectedModelId}
          smartRouting={smartRouting}
          onToggleSmartRouting={setSmartRouting}
          onStartCreating={handleStartCreating}
          isInitializing={isInitializingProject}
          creationError={creationError}
          savedProjects={savedProjects}
          defaultProjectType={settings.defaultProjectType}
          onOpenProject={(proj) => {
            setActiveProject(proj);
            navigateTo('workspace', proj.id);
          }}
          onRenameProject={handleRenameProject}
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
          onOpenModelHub={() => navigateTo('models')}
          onViewAllProjects={() => navigateTo('projects')}
          onOpenTemplates={() => navigateTo('templates')}
        />
      )}

      {/* SECTION 2: AI MODELS HUB */}
      {activeSection === 'models' && (
        <ModelHubView
          providers={providers}
          selectedModelId={selectedModelId}
          onSelectModel={setSelectedModelId}
          smartRouting={smartRouting}
          onToggleSmartRouting={setSmartRouting}
          onSaveProviderKey={handleSaveProviderKey}
          onTestProvider={handleTestProvider}
          onRefreshAllAvailability={handleRefreshAllAvailability}
          onAddCustomProvider={handleAddCustomProvider}
          onAddModelToProvider={handleAddModelToProvider}
        />
      )}

      {/* SECTION 2B: STARTER TEMPLATES & IMPORTER */}
      {activeSection === 'templates' && (
        <TemplateLibraryView
          onProjectCreated={(proj) => {
            syncUpdatedProject(proj);
            navigateTo('workspace', proj.id);
            showToast(`Opened "${proj.name}" in workspace`);
          }}
          onOpenSettings={() => navigateTo('settings')}
        />
      )}

      {/* SECTION 3: MY PROJECTS */}
      {activeSection === 'projects' && (
        <MyProjectsView
          projects={savedProjects}
          onOpenProject={(proj) => {
            setActiveProject(proj);
            navigateTo('workspace', proj.id);
          }}
          onRenameProject={handleRenameProject}
          onDuplicateProject={handleDuplicateProject}
          onDeleteProject={handleDeleteProject}
          onCreateNew={() => navigateTo('home')}
          onOpenTemplates={() => navigateTo('templates')}
        />
      )}

      {/* SECTION 4: DEDICATED PROJECT WORKSPACE (/workspace/:projectId) */}
      {activeSection === 'workspace' && (
        <ProjectWorkspaceView
          project={activeProject}
          isLoadingProject={isLoadingWorkspace}
          missingProjectId={missingWorkspaceId}
          providers={providers}
          editorTabSize={settings.editorTabSize}
          autoSaveOnBlur={settings.autoSaveOnBlur}
          compactDensity={settings.compactDensity}
          onProjectUpdated={syncUpdatedProject}
          onSaveFile={handleSaveProjectFile}
          onSaveProjectSnapshot={handleSaveProjectSnapshot}
          onApproveAsset={handleApproveAsset}
          onSendChat={handleSendChat}
          onRetryGeneration={handleRetryGeneration}
          onRenameProject={handleRenameProject}
          onDuplicateProject={handleDuplicateProject}
          onRunBuild={handleRunBuild}
          onGoHome={() => navigateTo('home')}
          onGoProjects={() => navigateTo('projects')}
          onOpenModelHub={() => navigateTo('models')}
          onOpenSettings={() => navigateTo('settings')}
          onToast={showToast}
        />
      )}

      {/* SECTION 4B: BACKEND CONTROL CENTER */}
      {activeSection === 'monitor' && (
        <BackendMonitorView
          onOpenProjectById={(id) => {
            navigateTo('workspace', id);
          }}
        />
      )}

      {/* SECTION 5: SETTINGS */}
      {activeSection === 'settings' && (
        <SettingsView
          settings={settings}
          providers={providers}
          onSaveSettings={handleSaveSettings}
          onResetSettings={handleResetSettings}
          onOpenModelHub={() => navigateTo('models')}
        />
      )}

      {/* SECTION 6: PROFILE */}
      {activeSection === 'profile' && (
        <ProfileView
          profile={profile}
          projects={savedProjects}
          providers={providers}
          onSaveProfile={handleSaveProfile}
          onOpenProjects={() => navigateTo('projects')}
        />
      )}

      {/* PRESERVED SECTION 7: 3D STUDIO */}
      {activeSection === 'studio' && (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="glass-layer-1 px-4 py-1.5 border-b border-white/[0.06] flex items-center gap-2 overflow-x-auto shrink-0">
            {(
              [
                { id: 'viewport', label: 'Viewport' },
                { id: 'pipeline', label: 'Node Graph' },
                { id: 'assets', label: 'Asset Library' },
                { id: 'compute', label: 'Compute' },
              ] as { id: StudioScreen; label: string }[]
            ).map((scr) => (
              <button
                key={scr.id}
                type="button"
                onClick={() => setActiveScreen(scr.id)}
                className={`px-3 py-1 rounded-md text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                  activeScreen === scr.id
                    ? 'bg-[#8b5cf6]/25 text-[#e4e1e9] border border-[#8b5cf6]/50'
                    : 'text-[#958ea0] hover:text-[#e4e1e9] border border-transparent'
                }`}
              >
                {scr.label}
              </button>
            ))}
          </div>

          <div className="flex-1 flex min-h-0 relative overflow-hidden">
            <div className="hidden lg:flex h-full">
              <SceneHierarchySidebar
                collapsed={sidebarCollapsed}
                onToggleCollapse={() => setSidebarCollapsed((prev) => !prev)}
                layers={layers}
                selectedLayerId={selectedLayerId}
                onSelectLayer={setSelectedLayerId}
                onToggleVisibility={handleToggleLayerVisibility}
                onToggleLock={handleToggleLayerLock}
                activeAsset={activeAsset}
                recentAssets={assets.slice(0, 4)}
                onLoadAsset={handleLoadAsset}
                activeScreen={activeScreen}
                onSelectScreen={setActiveScreen}
              />
            </div>

            {mobileDrawerOpen && (
              <div className="fixed inset-0 z-50 lg:hidden flex">
                <div
                  className="fixed inset-0 bg-black/65 backdrop-blur-sm"
                  onClick={() => setMobileDrawerOpen(false)}
                />
                <div className="relative z-10 h-full">
                  <SceneHierarchySidebar
                    collapsed={false}
                    onToggleCollapse={() => setMobileDrawerOpen(false)}
                    layers={layers}
                    selectedLayerId={selectedLayerId}
                    onSelectLayer={setSelectedLayerId}
                    onToggleVisibility={handleToggleLayerVisibility}
                    onToggleLock={handleToggleLayerLock}
                    activeAsset={activeAsset}
                    recentAssets={assets.slice(0, 4)}
                    onLoadAsset={handleLoadAsset}
                    activeScreen={activeScreen}
                    onSelectScreen={(s) => {
                      setActiveScreen(s);
                      setMobileDrawerOpen(false);
                    }}
                  />
                </div>
              </div>
            )}

            <main className="flex-1 flex flex-col xl:flex-row min-w-0 min-h-0 overflow-y-auto xl:overflow-hidden">
              {activeScreen === 'viewport' && (
                <SpatialViewport
                  activeAsset={activeAsset}
                  transform={transform}
                  onChangeTransform={setTransform}
                  onResetTransform={() => setTransform(INITIAL_TRANSFORM)}
                  material={material}
                  lighting={lighting}
                  onChangeLighting={setLighting}
                  layers={layers}
                  onSynthesizePrompt={handleSynthesizePrompt}
                  isSynthesizing={isSynthesizing}
                />
              )}

              {activeScreen === 'pipeline' && (
                <NodePipelineCanvas
                  nodes={nodes}
                  edges={edges}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={setSelectedNodeId}
                  onMoveNode={handleMoveNode}
                  onAddNode={handleAddNode}
                  onRunPipeline={handleRunPipeline}
                  onResetLayout={handleResetPipelineLayout}
                  isPipelineRunning={isPipelineRunning}
                />
              )}

              {activeScreen === 'assets' && (
                <AssetLibraryView
                  assets={assets}
                  activeAssetId={activeAsset.id}
                  onLoadInViewport={handleLoadAsset}
                  onDuplicateAsset={handleDuplicateAsset}
                />
              )}

              {activeScreen === 'compute' && (
                <ComputeShaderView scripts={scripts} onUpdateScript={handleUpdateScript} />
              )}

              {showRightInspector && (
                <ContextualInspector
                  activeScreen={activeScreen}
                  activeAsset={activeAsset}
                  transform={transform}
                  onChangeTransform={setTransform}
                  onResetTransform={() => setTransform(INITIAL_TRANSFORM)}
                  material={material}
                  onChangeMaterial={setMaterial}
                  lighting={lighting}
                  onChangeLighting={setLighting}
                  selectedNode={selectedNode}
                  onUpdateNodeParam={handleUpdateNodeParam}
                  onToggleNodeEnabled={handleToggleNodeEnabled}
                  collapsed={inspectorCollapsed}
                  onToggleCollapse={() => setInspectorCollapsed((prev) => !prev)}
                />
              )}
            </main>
          </div>
        </div>
      )}

      {exportOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="export-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
        >
          <div className="glass-layer-3 spectral-top-edge w-full max-w-lg rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/[0.08] flex items-center justify-between">
              <h2
                id="export-modal-title"
                className="font-display text-base font-semibold text-[#e4e1e9]"
              >
                Export Scene Manifest
              </h2>
              <button
                type="button"
                onClick={() => setExportOpen(false)}
                aria-label="Close export modal"
                className="p-1.5 rounded-md text-[#958ea0] hover:text-[#e4e1e9] hover:bg-white/[0.06] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-[#cbc3d7]">
                Includes active 3D assembly coordinates, PBR shader parameters, lighting rig values,
                and compiled node pipeline state.
              </p>

              <pre className="max-h-64 overflow-auto rounded-lg bg-[#0a0a0f]/90 border border-white/[0.08] p-3.5 font-mono text-xs text-[#adc6ff] tabular-nums">
                {sceneManifest}
              </pre>

              <div className="flex items-center justify-end gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setExportOpen(false)}
                  className="btn-kinetic px-4 py-2 rounded-md text-xs font-medium text-[#cbc3d7] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDownloadJson}
                  className="btn-synthetic inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium text-white cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download JSON</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {statusToast && (
        <div className="fixed top-16 right-6 z-50 glass-layer-3 rounded-lg px-4 py-2.5 flex items-center gap-2 text-xs text-[#e4e1e9] pointer-events-none">
          <Check className="w-3.5 h-3.5 text-[#4cd7f6]" />
          <span>{statusToast}</span>
        </div>
      )}
    </div>
  );
}
