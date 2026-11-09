# @agentics.org/agentic-mcp

[![npm version](https://img.shields.io/npm/v/@agentics.org/agentic-mcp.svg)](https://www.npmjs.com/package/@agentics.org/agentic-mcp)
[![GitHub Repository](https://img.shields.io/badge/GitHub-Repository-blue.svg)](https://github.com/agenticsorg/edge-agents/tree/main/scripts/agentic-mcp)

![Agentics Foundation](https://img.shields.io/badge/Agentics-Foundation-blue)
![Version](https://img.shields.io/npm/v/@agentics.org/agentic-mcp)
![License](https://img.shields.io/npm/l/@agentics.org/agentic-mcp)

# ♾️ Agentic MCP

A powerful Model Context Protocol server with advanced AI capabilities by the Agentics Foundation. Built on the OpenAI Agents API/SDK using TypeScript, this package implements a comprehensive MCP server that enhances AI agents with sophisticated tools and orchestration capabilities:

## 🌟 Core Capabilities

- **🔍 Web Search Research**: Generate comprehensive reports with up-to-date information from the web using `gpt-4o-search-preview`
- **📝 Smart Summarization**: Create concise, well-structured summaries with key points and citations
- **🗄️ Database Integration**: Query and analyze data from Supabase databases with structured results
- **👥 Customer Support**: Handle inquiries and provide assistance with natural language understanding
- **🔄 Agent Orchestration**: Seamlessly transfer control between specialized agents based on query needs
- **🔀 Multi-Agent Workflows**: Create complex agent networks with parent-child relationships and shared context
- **🧠 Context Management**: Sophisticated state tracking with memory, resources, and workflow management
- **🛡️ Guardrails System**: Configurable input and output validation to ensure safe and appropriate responses
- **📊 Tracing & Debugging**: Comprehensive logging and debugging capabilities for development
- **🔌 Edge Function Deployment**: Ready for deployment as Supabase Edge Functions
- **🔄 Streaming Support**: Real-time streaming responses for interactive applications

## 🚀 Installation

```bash
# Install globally
npm install -g @agentics.org/agentic-mcp

# Or as a project dependency
npm install @agentics.org/agentic-mcp
```

**Supported environments:** Node.js ≥ 20 on Linux, macOS or Windows. It speaks MCP over stdio, so any MCP client (Claude Desktop, Claude Code, Cursor) can launch it. The `research`, `websearch`, `summarize` and `customer_support` tools need `OPENAI_API_KEY`. `database_query` also needs Supabase credentials.

### Quick check

List the tools over MCP stdio. Listing makes no OpenAI call, so a placeholder key is enough:

```bash
(printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"check","version":"1"}}}'; sleep 1
 printf '%s\n' '{"jsonrpc":"2.0","method":"notifications/initialized"}' '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'; sleep 2) \
 | OPENAI_API_KEY=sk-placeholder npx -y @agentics.org/agentic-mcp 2>/dev/null | grep '"id":2' | jq -c '[.result.tools[].name]'
```

Output (1.0.5, Node 22, clean install):

```text
["research","customer_support","summarize","websearch"]
```

## 🏗️ Architecture

The Agentic MCP server is built on a modular architecture that enables seamless integration between AI agents and external tools:

### Core Components

- **MCP Server**: The central server that registers and routes tool execution requests
- **Tool Registry**: Manages the available tools, ensuring each tool is validated and can be executed
- **Context System**: Sophisticated state management with parent-child relationships for complex workflows
- **Agent Orchestration**: Intelligent routing between specialized agents based on query requirements
- **Guardrails System**: Configurable input and output validation to ensure safe and appropriate responses

### Agent Types

- **Research Agent**: Utilizes web search to gather and analyze information with citations
- **Database Agent**: Queries and analyzes data from Supabase databases
- **Customer Support Agent**: Handles user inquiries with natural language understanding
- **Specialized Agents**: Extensible framework for creating domain-specific agents

## 🔧 Configuration

Create a configuration file for the MCP server. Here's a sample configuration:

```json
{
  "mcpServers": {
    "openai-agent": {
      "command": "node",
      "args": [
        "dist/index.js"
      ],
      "env": {
        "OPENAI_API_KEY": "YOUR_API_KEY_HERE",
        "SUPABASE_URL": "https://your-supabase-project.supabase.co",
        "SUPABASE_KEY": "YOUR_SUPABASE_KEY_HERE",
        "LLM_DEBUG": "true",
        "AGENT_LIFECYCLE": "true",
        "TOOL_DEBUG": "true"
      },
      "disabled": false,
      "autoApprove": [
        "research",
        "support",
        "customer_support",
        "database_query",
        "handoff_to_agent",
        "summarize"
      ]
    }
  }
}
```

## 🏃‍♂️ Usage

### As a Command Line Tool

```bash
# Set required environment variables
export OPENAI_API_KEY=your_api_key_here
export SUPABASE_PROJECT_ID=your_project_id
export SUPABASE_ACCESS_TOKEN=your_access_token

# Run the MCP server
agentic-mcp
```

### As a Library

```javascript
import { OpenAIAgentMCPServer } from '@agentics.org/agentic-mcp';

const server = new OpenAIAgentMCPServer({
  name: 'openai-agent',
  version: '1.0.0',
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: 'gpt-4o-mini'
  },
  tracing: {
    enabled: true,
    level: 'debug'
  },
  tools: {
    enabled: ['research', 'database_query', 'customer_support', 'handoff_to_agent', 'summarize'],
    config: {
      database: {
        projectId: process.env.SUPABASE_PROJECT_ID,
        key: process.env.SUPABASE_ACCESS_TOKEN
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY
      }
    }
  },
  guardrails: {
    enabled: true,
    rules: []
  }
});

server.serve().catch(error => {
  console.error("❌ Server error:", error);
  process.exit(1);
});
```

## 🧩 Advanced Features

### Context Management System

The Agentic MCP includes a sophisticated context management system that enables:

- **Hierarchical Context**: Parent-child relationships for complex agent workflows
- **State Tracking**: Persistent state across multiple interactions
- **Memory Management**: Store and retrieve information across agent calls
- **Resource Sharing**: Share resources between agents in a workflow
- **Action Tracking**: Monitor and log agent actions for auditing and debugging

```javascript
// Example of context management
const context = new Context();
context.initializeWorkflow();
context.remember('user_preference', { theme: 'dark' });
context.trackAction('research_initiated');
```

### Agent Orchestration

The system supports sophisticated agent orchestration patterns:

- **Dynamic Routing**: Automatically route queries to the most appropriate agent
- **Handoff Protocol**: Seamlessly transfer control between specialized agents
- **Workflow Tracking**: Maintain context and state across agent transitions
- **Multi-Agent Collaboration**: Enable multiple agents to work together on complex tasks

```javascript
// Example of agent handoff
const handoffTool = {
  name: "handoff_to_agent",
  description: "Transfer the conversation to another specialized agent",
  parameters: {
    type: "object",
    properties: {
      agent_name: {
        type: "string",
        enum: ["researcher", "database_expert", "customer_support"]
      },
      reason: {
        type: "string"
      }
    },
    required: ["agent_name", "reason"]
  },
  execute: async (params) => {
    // Handoff logic
  }
};
```

### Guardrails System

The Agentic MCP includes a configurable guardrails system for ensuring safe and appropriate responses:

- **Input Validation**: Filter and validate user inputs before processing
- **Output Validation**: Ensure agent responses meet safety and quality standards
- **Custom Rules**: Define custom validation rules for specific use cases
- **Failure Handling**: Graceful handling of guardrail violations

```javascript
// Example guardrail implementation
const customGuardrail = {
  async check(msgs, context) {
    // Validation logic
    return true;
  },
  onFailure(msgs, context) {
    // Failure handling
  }
};
```

### Streaming Support

The system supports real-time streaming responses for interactive applications:

- **Partial Results**: Stream partial results as they become available
- **Tool Call Events**: Stream tool call events for visibility into agent actions
- **Progress Indicators**: Provide progress updates during long-running operations

```javascript
// Example of streaming usage
const streamIterator = AgentRunner.run_streamed(agent, [input]);
for await (const event of streamIterator) {
  // Process streaming event
  console.log(event.delta);
}
```

## 🛠️ Creating and Using Tools

### Creating a New Tool

1. **Create a New Module**: Add a new TypeScript file in the `src/mcp/tools/` directory
2. **Implement the Interface**: Your tool should implement the `MCPTool` interface
3. **Register the Tool**: Update the tool registration logic in `src/mcp/server.ts` to include the new tool

```typescript
// Example tool implementation
export class CustomTool implements MCPTool {
  name = 'custom_tool';
  description = 'Description of your custom tool';
  inputSchema = {
    type: 'object',
    properties: {
      param1: {
        type: 'string',
        description: 'Description of parameter 1'
      }
    },
    required: ['param1']
  };

  async execute(params: any, context: Context): Promise<any> {
    // Tool implementation
    return { result: 'Success' };
  }
}
```

### Using the Tools

- **Tool Requests**: MCP clients issue requests by specifying the tool name and parameters
- **Web Search Integration**: The research tool utilizes the `gpt-4o-search-preview` model with web search enabled
- **Approval**: Tools must be listed in the `autoApprove` section of the MCP settings

## 🔍 Troubleshooting and Debugging

- **Logging**: The server is configured with tracing options (LLM_DEBUG, AGENT_LIFECYCLE, TOOL_DEBUG)
- **Registry Debugging**: The `ToolRegistry` class logs tool registration and execution details
- **Web Search**: For the research tool, ensure that the model `gpt-4o-search-preview` is used
- **Context Inspection**: Examine the context state for debugging complex workflows
- **Action Tracking**: Review tracked actions to understand agent behavior

## 📄 License

MIT

## 👥 Contributors

- Agentics Foundation ([@agenticsorg](https://github.com/agenticsorg))
- rUv ([@ruvnet](https://github.com/ruvnet))

---

Created by the Agentics Foundation
