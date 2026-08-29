# Implementation Plan: Catalog Assistant Micro Frontend (React 18)

## 1. Overview
The Catalog Assistant MFE is an embeddable customer-facing widget. Rendered on product detail pages, it provides shoppers with a chat interface to ask natural language questions about product specifications, consuming real-time streaming RAG responses.

---

## 2. Component Directory Structure
```
/src/frontend/catalog-assistant-mfe/
├── vite.config.ts                   # Remote Entry setup
├── src/
│   ├── components/
│   │   ├── ChatWidget.tsx          # Floating / Embedded chat window
│   │   ├── MessageList.tsx         # Renders chat history + streaming buffer
│   │   └── ChatInput.tsx           # Text input & submit button
│   ├── hooks/
│   │   └── useRagStream.ts         # Handles SSE / ReadableStream reader
│   └── AssistantApp.tsx            # Remote entry export
```

---

## 3. Implementation Steps

### Step 1: ReadableStream Hook (`useRagStream.ts`)
```typescript
export const useRagStream = () => {
  const [streamData, setStreamData] = useState('');

  const askQuestion = async (productId: string, question: string) => {
    setStreamData('');
    const response = await fetch('http://localhost:5000/api/assistant/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId, question }),
    });

    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    while (reader) {
      const { value, done } = await reader.read();
      if (done) break;
      setStreamData((prev) => prev + decoder.decode(value));
    }
  };

  return { askQuestion, streamData };
};
```

---

## 4. Verification & Testing
1. Standalone widget testing on port `3003`.
2. Test streaming text rendering token by token smoothly.
3. Verify accessibility and responsive layout on mobile screens.
