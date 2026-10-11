import { useState, useEffect } from 'react';
import { Navbar, NavTab } from './components/Navbar';
import { OrchestratorPage } from './pages/OrchestratorPage';
import { ModelsPage } from './pages/ModelsPage';
import { PlanPage } from './pages/PlanPage';
import { BranchesPage } from './pages/BranchesPage';
import { ProjectPage } from './pages/ProjectPage';
import { CanvasPage } from './pages/CanvasPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthModal } from './components/AuthModal';
import { api } from './api';
import { AuthStatus } from './types';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('orchestrator');
  const [serverOk, setServerOk] = useState<boolean | null>(null);
  const [authStatus, setAuthStatus] = useState<AuthStatus>({ enabled: false, authenticated: true });

  const checkAuth = async () => {
    try {
      const auth = await api.getAuthStatus();
      setAuthStatus(auth);
    } catch {}
  };

  useEffect(() => {
    const checkServerHealth = async () => {
      try {
        const res = await api.getHealth();
        setServerOk(res.status === 'ok');
      } catch {
        setServerOk(false);
      }
    };

    checkServerHealth();
    checkAuth();
    const interval = setInterval(checkServerHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = async () => {
    await api.logout();
    setAuthStatus({ enabled: true, authenticated: false });
  };

  const handleAuthSuccess = async () => {
    await checkAuth();
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-emerald-500/30 selection:text-emerald-200">
      {authStatus.enabled && !authStatus.authenticated && (
        <AuthModal onSuccess={handleAuthSuccess} />
      )}

      <Navbar
        currentTab={currentTab}
        onTabChange={setCurrentTab}
        serverOk={serverOk}
        authProtected={authStatus.enabled}
      />

      <main className="flex-1">
        {currentTab === 'orchestrator' && (
          <OrchestratorPage
            onPlanCreated={() => setCurrentTab('plan')}
            onNavigateToModels={() => setCurrentTab('models')}
          />
        )}

        {currentTab === 'models' && <ModelsPage />}

        {currentTab === 'plan' && <PlanPage />}

        {currentTab === 'branches' && <BranchesPage />}

        {currentTab === 'project' && <ProjectPage />}

        {currentTab === 'canvas' && (
          <CanvasPage onNavigateToPlan={() => setCurrentTab('plan')} />
        )}

        {currentTab === 'settings' && (
          <SettingsPage onLogout={handleLogout} />
        )}
      </main>
    </div>
  );
}
