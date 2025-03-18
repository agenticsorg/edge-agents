# Vector Agent: AI-Powered Document Intelligence

😎 Vector Agent: Built with OpenAI's new Vector & Web Search, this autonomous agent turns static docs into auto updating knowledge hubs.

I built this in under an hour on today's Ai Hacker League live Coding session. Crazy. 

Imagine uploading thousands of PDFs, docs, and markdown files, then asking complex questions and getting precise, ranked responses, not just from your stored documents but fused with real-time web data for a complete answer.

## How It Works

At its core, this is a vector search agent that transforms unstructured files into a dynamic knowledge base. Instead of dumping files into a blob of data, you create vector stores, self-contained repositories with expiration rules to keep information relevant. 

You then upload text, PDFs, code (entire repositories), or documents, and the system chunks them into searchable contextual segments, enabling deep, context-aware retrieval rather than just surface-level keyword matching. 

Think not just saving your documents or code, but enabling real time & continuous updates to contextually related information. This could include related news, code vulnerabilities, case law, competitors, basically things that change over time.

The hybrid search blends vector-based embeddings with keyword ranking, giving you the best of both worlds, semantic understanding with precision tuning. The agent automatically handles this. 

The Web search integration pulls in real-time updates, ensuring responses stay accurate and relevant, eliminating AI hallucinations.

You can chat with your data. 

Ask questions, get responses grounded in your documents, and refine results dynamically, turning traditional search into something that feels as natural as messaging a deep research assistant. 

Plus, real-time indexing ensures that newly added files become immediately searchable within seconds.

### Real World Example: Law Firm Knowledge Management Agent

A legal team needs to find key precedents for intellectual property disputes. Instead of manually searching through case files, they ask: "What are the most relevant rulings in the last five years?" 

The system:
1. Searches stored case law in their vector database.
2. Cross-checks recent court decisions using OpenAI's web search capability.
3. Returns a ranked, high-confidence answer, ensuring compliance with legal and ethical/legal guardrails.

## Features

- Create and manage vector stores with expiration policies
- Upload and index files with customizable chunking
- Direct semantic search with filters and ranking options
- Conversational search with context
- Question answering with context
- Web search integration with result fusion
- Hybrid search combining vector and keyword matching
- Real-time content updates and reindexing
- Customizable result ranking and scoring

## Prerequisites

- Supabase project
- OpenAI API key
- Environment variable: `OPENAI_API_KEY`

## Endpoints

### Create Vector Store

Creates a new vector store for indexing files.

```bash
curl -X POST "https://[PROJECT_REF].supabase.co/functions/v1/vector-file/create-store" \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "my-documents",
    "expiresAfter": {
      "anchor": "last_active_at",
      "days": 7
    }
  }'
```

Response:
```json
{
  "id": "vs_..."
}
```

### Upload File

Upload a file to be indexed. Supports both local files and URLs.

```bash
# Local file
curl -X POST "https://[PROJECT_REF].supabase.co/functions/v1/vector-file/upload-file" \
  -H "Authorization: Bearer [ANON_KEY]" \
  -F "file=@/path/to/file.pdf"

# URL
curl -X POST "https://[PROJECT_REF].supabase.co/functions/v1/vector-file/upload-file" \
  -H "Authorization: Bearer [ANON_KEY]" \
  -F "file=https://example.com/document.pdf"
```

Response:
```json
{
  "id": "file-..."
}
```

### Add File to Vector Store

Index an uploaded file in a vector store with custom chunking options.

```bash
curl -X POST "https://[PROJECT_REF].supabase.co/functions/v1/vector-file/add-file" \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{
    "vectorStoreId": "vs_...",
    "fileId": "file-...",
    "chunkingStrategy": {
      "max_chunk_size_tokens": 1000,
      "chunk_overlap_tokens": 200
    }
  }'
```

Response:
```json
{
  "success": true
}
```

### Check Processing Status

Check the status of file processing in a vector store.

```bash
curl -X POST "https://[PROJECT_REF].supabase.co/functions/v1/vector-file/check-status" \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{
    "vectorStoreId": "vs_..."
  }'
```

### Search

Direct semantic search with filters and ranking options.

```bash
curl -X POST "https://[PROJECT_REF].supabase.co/functions/v1/vector-file/search" \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{
    "vectorStoreId": "vs_...",
    "query": "What are the key features?",
    "maxResults": 5,
    "filters": {
      "type": "eq",
      "key": "type",
      "value": "blog"
    },
    "webSearch": {
      "enabled": true,
      "maxResults": 3,
      "recentOnly": true
    }
  }'
```

### Chat

Conversational interface that uses vector search results as context.

```bash
curl -X POST "https://[PROJECT_REF].supabase.co/functions/v1/vector-file/chat" \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{
    "vectorStoreId": "vs_...",
    "messages": [
      {
        "role": "user",
        "content": "What are the key features?"
      }
    ],
    "maxResults": 5,
    "filters": {
      "type": "eq",
      "key": "type", 
      "value": "blog"
    },
    "webSearch": {
      "enabled": true,
      "maxResults": 3
    }
  }'
```

### Query

Single question answering that uses vector search results as context.

```bash
curl -X POST "https://[PROJECT_REF].supabase.co/functions/v1/vector-file/query" \
  -H "Authorization: Bearer [ANON_KEY]" \
  -H "Content-Type: application/json" \
  -d '{
    "vectorStoreId": "vs_...",
    "question": "What are the key features?",
    "maxResults": 5,
    "filters": {
      "type": "eq",
      "key": "type",
      "value": "blog"
    },
    "rankingOptions": {
      "ranker": "default_2024_08_21",
      "score_threshold": 0.8
    },
    "webSearch": {
      "enabled": true,
      "maxResults": 3,
      "recentOnly": true,
      "domains": ["docs.example.com", "blog.example.com"]
    }
  }'
```

## Advanced Features

### Web Search Integration

Enhance vector search with real-time web results:

```json
{
  "webSearch": {
    "enabled": true,           // Enable web search
    "maxResults": 3,          // Number of web results
    "recentOnly": true,       // Only recent content
    "domains": [              // Restrict to domains
      "docs.example.com",
      "blog.example.com"
    ]
  }
}
```

### Hybrid Search

Combine vector and keyword search capabilities:

```json
{
  "hybridSearch": {
    "enabled": true,
    "keywordWeight": 0.3,    // Weight for keyword matches
    "vectorWeight": 0.7      // Weight for semantic matches
  }
}
```

### Chunking Strategy

Control how files are split into chunks for indexing:

```json
{
  "chunkingStrategy": {
    "max_chunk_size_tokens": 1000,  // Between 100-4096
    "chunk_overlap_tokens": 200     // Non-negative, <= max_chunk_size_tokens/2
  }
}
```

### Ranking Options

Improve result relevance with ranking configuration:

```json
{
  "rankingOptions": {
    "ranker": "default_2024_08_21", // or "auto" for latest
    "score_threshold": 0.8          // 0.0 to 1.0
  }
}
```

### Metadata Filtering

Filter search results based on file metadata:

```json
{
  "filters": {
    "type": "eq",          // Exact match
    "key": "type",         // Metadata field
    "value": "blog"        // Target value
  }
}
```

### Expiration Policies

Manage vector store lifecycle:

```json
{
  "expiresAfter": {
    "anchor": "last_active_at",
    "days": 7
  }
}
```

## Benefits of Web Search Integration

1. Real-time Information
   - Augment stored knowledge with current data
   - Access latest updates and developments
   - Incorporate time-sensitive information

2. Broader Context
   - Expand search scope beyond stored documents
   - Fill knowledge gaps in vector store
   - Provide comprehensive answers

3. Enhanced Accuracy
   - Cross-validate information from multiple sources
   - Reduce outdated or incorrect responses
   - Improve answer confidence scores

4. Dynamic Results
   - Adapt to changing information landscapes
   - Stay current with evolving topics
   - Provide fresh perspectives

## System Limits

- Project total size: 100GB
- Vector stores per project: 10,000 files
- Individual file size: 512MB (~5M tokens)
- Token budgets:
  - GPT-3.5: 4,000 tokens
  - GPT-4: 16,000 tokens
- Web search:
  - Max results per query: 10
  - Max domains per query: 5
  - Rate limit: 100 requests/minute

## Supported File Types

- Text: .txt, .md
- Code: .py, .js, .ts, .c, .cpp, .cs, .java, .rb, .go
- Documents: .pdf, .doc, .docx, .pptx
- Web: .html, .css
- Data: .json

Text encoding must be UTF-8, UTF-16, or ASCII.

## Error Handling

The function returns standard HTTP status codes:
- 200: Success
- 400: Bad request (invalid parameters)
- 401: Unauthorized
- 500: Server error

Error responses include a message:
```json
{
  "error": "Error message here"
}
```

## Security Considerations

- Use environment variables for API keys
- Implement proper access control
- Validate file types and sizes
- Monitor usage and implement rate limiting
- First 1GB vector storage is free
- Beyond 1GB: $0.10/GB/day
- Web search usage: $0.01 per request
