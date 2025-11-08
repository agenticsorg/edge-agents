# AgentDB Quick Start Guide

AgentDB is a frontier memory database for AI agents with vector search, causal reasoning, reflexion memory, and skill learning capabilities.

## Installation Complete ✅

- **Database Location**: `./agentdb.db`
- **Dimension**: 1536 (OpenAI standard)
- **Preset**: Medium (10K-100K vectors)
- **Tables Created**: 25 (episodes, embeddings, causal graphs, skills, etc.)

## Configuration

Environment variables are configured in `.env`:

```bash
# AgentDB database path
AGENTDB_PATH=./agentdb.db

# Optional: Add embedding provider API keys for production
# HUGGINGFACE_API_KEY=hf_your_api_key_here
# OPENAI_API_KEY=sk-your_openai_key_here
```

## Quick Commands

### Store an Episode (Reflexion Memory)
```bash
npx agentdb reflexion store "session-1" "implement_auth" 0.95 true "Used OAuth2 successfully"
```

### Retrieve Past Episodes
```bash
npx agentdb reflexion retrieve "authentication" --k 10 --synthesize-context
```

### Create a Skill
```bash
npx agentdb skill create "jwt_auth" "Generate JWT tokens" "code here..."
```

### Search Skills
```bash
npx agentdb skill search "authentication" 5
```

### Add Causal Edge
```bash
npx agentdb causal add-edge "add_tests" "code_quality" 0.25 0.95 100
```

### Auto-Discover Patterns
```bash
npx agentdb learner run 3 0.6 0.7
```

### Consolidate Skills from Successful Episodes
```bash
npx agentdb skill consolidate 3 0.7 7 true
```

### Database Statistics
```bash
npx agentdb db stats
```

## Advanced Features

### QUIC Synchronization (Multi-Agent Coordination)

Start a sync server:
```bash
npx agentdb sync start-server --port 4433 --auth-token secret123
```

Connect from another agent:
```bash
npx agentdb sync connect 192.168.1.100 4433 --auth-token secret123
npx agentdb sync push --server 192.168.1.100:4433 --incremental
npx agentdb sync pull --server 192.168.1.100:4433 --incremental
```

### Vector Search

Direct vector similarity search:
```bash
npx agentdb vector-search ./agentdb.db "[0.1,0.2,0.3]" -k 10 -m cosine --mmr 0.7
```

### Export/Import

Export database:
```bash
npx agentdb export ./agentdb.db ./backup.json --compress
```

Import from backup:
```bash
npx agentdb import ./backup.json.gz ./new-agentdb.db --decompress
```

### MCP Server (Claude Desktop Integration)

Start MCP server:
```bash
npx agentdb mcp start
```

## Integration with Agentic Flow

AgentDB is automatically used by agentic-flow agents:

```bash
# Start MCP servers (includes agentdb tools)
npx agentic-flow mcp start

# Run an agent that uses AgentDB memory
npx agentic-flow --agent coder --task "Build authentication system"
```

## Current Status

- ✅ Database initialized (25 tables)
- ✅ Configuration file created (.env)
- ✅ Test episode stored and retrieved successfully
- ⚠️ Using mock embeddings (set HUGGINGFACE_API_KEY for production)

## Next Steps

1. **Add API Keys**: Edit `.env` to add your embedding provider API keys
2. **Start Using**: Begin storing episodes as you work on tasks
3. **Enable MCP**: Start the MCP server for Claude Desktop integration
4. **Multi-Agent Sync**: Set up QUIC sync for distributed agent coordination

## Resources

- **AgentDB Docs**: Run `npx agentdb --help`
- **Agentic Flow Docs**: Run `npx agentic-flow --help`
- **GitHub**: https://github.com/ruvnet/agentic-flow
