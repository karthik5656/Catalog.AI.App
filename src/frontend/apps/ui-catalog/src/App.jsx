import { Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { remoteApps } from './remoteApps.generated';
import ShellLayout from './components/ShellLayout';
import HomePage from './pages/HomePage';
import './App.css';

function App() {
  return (
    <Routes>
      <Route path="/" element={<ShellLayout />}>
        <Route index element={<HomePage />} />
        {remoteApps.map(({ route, Component }) => (
          <Route
            key={route}
            path={`${route}/*`}
            element={
              <Suspense
                fallback={
                  <div style={{ padding: '48px', textAlign: 'center' }}>
                    Loading module...
                  </div>
                }
              >
                <Component />
              </Suspense>
            }
          />
        ))}
      </Route>
    </Routes>
  );
}

export default App;
