# Implementation Plan: Shell Micro Frontend (React 18 + Vite)

## 1. Overview
The Shell MFE is the host container application. Built with React 18, Vite, and Module Federation, it provides the main layout, top navigation bar, authentication context (`AuthProvider`), and dynamically loads remote MFEs based on active routes.

---

## 2. Component Directory Structure
```
Catalog.AI.App/src/frontend/shell/
├── vite.config.ts                   # Module Federation Host configuration
├── package.json
├── src/
│   ├── App.tsx                      # Root component with Route definitions
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── Sidebar.tsx
│   │   └── ProtectedRoute.tsx       # Auth & Role-based route guard
│   ├── context/
│   │   └── AuthContext.tsx          # Shares JWT & User details across MFEs
│   └── main.tsx
```

---

## 3. Implementation Steps

### Step 1: Vite Module Federation Setup (`vite.config.ts`)
```typescript
import { defineConfig } from 'vite';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    federation({
      name: 'shell',
      remotes: {
        catalogMfe: 'http://localhost:3001/assets/remoteEntry.js',
        copilotMfe: 'http://localhost:3002/assets/remoteEntry.js',
        assistantMfe: 'http://localhost:3003/assets/remoteEntry.js',
      },
      shared: ['react', 'react-dom', 'react-router-dom'],
    }),
  ],
});
```

### Step 2: Dynamic Remote Route Loading
```tsx
const CatalogApp = React.lazy(() => import('catalogMfe/CatalogApp'));
const CopilotApp = React.lazy(() => import('copilotMfe/CopilotApp'));

<Routes>
  <Route path="/vendor/products/*" element={
    <ProtectedRoute requiredRole="Vendor">
      <Suspense fallback={<div>Loading Catalog...</div>}>
        <CatalogApp />
      </Suspense>
    </ProtectedRoute>
  } />
</Routes>
```

---

## 4. Verification & Testing
1. Run `npm run dev` for Shell MFE on port `3000`.
2. Verify remote entry modules are cleanly loaded without CSS/JS namespace conflicts.
3. Test Auth state propagation to remote MFEs.
