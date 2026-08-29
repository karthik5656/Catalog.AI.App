# Implementation Plan: Vendor Catalog Micro Frontend (React 18 + Vite)

## 1. Overview
The Vendor Catalog MFE is dedicated to product lifecycle management. Vendors can create raw product entries, view real-time inventory tables, assign categories, and monitor product statuses (`Draft` → `Enriching` → `Pending Review` → `Published`).

---

## 2. Component Directory Structure
```
/src/frontend/catalog-mfe/
├── vite.config.ts                   # Module Federation Remote configuration
├── src/
│   ├── components/
│   │   ├── ProductTable.tsx        # Product inventory list
│   │   ├── CreateProductForm.tsx   # Raw product input form
│   │   └── StatusBadge.tsx         # Status indicator chip
│   ├── api/
│   │   └── catalogApi.ts           # TanStack Query hooks for Gateway API
│   └── CatalogApp.tsx              # Remote entry root component
```

---

## 3. Implementation Steps

### Step 1: Vite Remote Config (`vite.config.ts`)
```typescript
federation({
  name: 'catalogMfe',
  filename: 'remoteEntry.js',
  exposes: {
    './CatalogApp': './src/CatalogApp.tsx',
  },
  shared: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'],
})
```

### Step 2: Form & TanStack Mutation
```tsx
export const useCreateProduct = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (newProduct: ProductInput) => api.post('/api/catalog/products', newProduct),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['products'] }),
  });
};
```

---

## 4. Verification & Testing
1. Test isolated rendering on dev port `3001`.
2. Form validation tests using Vitest + React Testing Library.
3. E2E creation test: submit raw product form and check table status updates to `Draft`/`Enriching`.
