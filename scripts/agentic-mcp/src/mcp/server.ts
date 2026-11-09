import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';

import { MCPServerConfig, MCPTool, Context } from '../types';
import { MCPContext } from './context';
import { ToolRegistry } from './tools/registry';
import { ResearchTool } from './tools/research';
import { DatabaseTool } from './tools/database';
import { SupportTool } from './tools/support';
import { SummarizeTool } from './tools/summarize';
import { WebSearchTool } from './tools/websearch';
import { toToolDefinitions } from './tool-definitions';

export class OpenAIAgentMCPServer {
  private server: Server;
  private toolRegistry: ToolRegistry;
  private tracingEnabled: boolean;
  private config: MCPServerConfig;

  constructor(config: MCPServerConfig) {
    this.config = config;
    this.server = new Server(
      {
        name: config.name,
        version: config.version,
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.toolRegistry = new ToolRegistry();
    this.tracingEnabled = config.tracing?.enabled || false;

    // Initialize tools based on configuration
    this.initializeTools(config);

    // Set up request handlers
    this.setupRequestHandlers();

    // Set up error handling
    this.setupErrorHandling();
  }

  private initializeTools(config: MCPServerConfig): void {
    if (this.tracingEnabled) {
      console.error('Initializing tools with config:', {
        enabled: config.tools.enabled,
        openai: !!config.openai.apiKey,
        database: !!config.tools.config?.database
      });
    }

    for (const toolName of config.tools.enabled) {
      if (this.tracingEnabled) {
        console.error(`Attempting to register tool: ${toolName}`);
      }

      try {
        switch (toolName) {
          case 'research':
            this.toolRegistry.registerTool(new ResearchTool(config.openai.apiKey));
            break;
          case 'database_query':
            const dbConfig = config.tools.config.database;
            this.toolRegistry.registerTool(new DatabaseTool(dbConfig.projectId, dbConfig.key));
            break;
          case 'customer_support':
            this.toolRegistry.registerTool(new SupportTool(config.openai.apiKey));
            break;
          case 'summarize':
            const summarizeTool = new SummarizeTool(config.openai.apiKey);
            if (this.tracingEnabled) {
              console.error('Attempting to register tool: summarize');
            }
            this.toolRegistry.registerTool(summarizeTool);
            break;
          case 'websearch':
            this.toolRegistry.registerTool(new WebSearchTool(config.openai.apiKey));
            break;
          default:
            if (this.tracingEnabled) {
              console.error(`Unknown tool: ${toolName}`);
            }
        }

        if (this.tracingEnabled) {
          console.error(`Successfully registered tool: ${toolName}`);
        }
      } catch (error) {
        console.error(`Failed to register tool ${toolName}:`, error);
      }
    }

    if (this.tracingEnabled) {
      console.error('Final registered tools:', this.toolRegistry.listTools().map(t => t.name));
    }
  }

  private setupRequestHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      const tools = this.toolRegistry.listTools();
      if (this.tracingEnabled) {
        console.error('Available tools:', tools.map(t => t.name));
      }
      return { tools: toToolDefinitions(tools) };
    });

    // Execute tool
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      if (this.tracingEnabled) {
        console.error('Executing tool request:', {
          name: request.params.name,
          arguments: request.params.arguments
        });
        console.error('Available tools:', this.toolRegistry.listTools().map(t => t.name));
      }
      const context = new MCPContext();

      try {
        // Initialize workflow if not exists
        if (!context.getWorkflowId()) {
          context.initializeWorkflow();
          if (this.tracingEnabled) {
            console.error(`Initialized workflow: ${context.getWorkflowId()}`);
          }
        }

        // Validate tool exists
        if (!request.params.name) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'Tool name is required'
          );
        }

        // Execute tool with validation
        const result = await this.toolRegistry.executeToolWithValidation(
          request.params.name,
          request.params.arguments,
          context
        );

        // Check for handoff request
        if (request.params.name === 'handoff_to_agent') {
          const handoffResult = result as { status: string; metadata: { target_agent: string } };
          if (handoffResult.status === 'success') {
            // Create child context for handoff
            const handoffContext = new MCPContext(context);
            handoffContext.setState('workflow_id', context.getWorkflowId());
            
            // Execute tool with new agent
            const targetResult = await this.toolRegistry.executeToolWithValidation(
              handoffResult.metadata.target_agent,
              request.params.arguments,
              handoffContext
            );

            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(targetResult)
                }
              ]
            };
          }
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result)
            }
          ]
        };
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${errorMessage}`
        );
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error: Error) => {
      if (this.tracingEnabled) {
        console.error('[MCP Error]', error);
      }
    };
  }

  public registerTool(tool: MCPTool): void {
    this.toolRegistry.registerTool(tool);
  }

  public async serve(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    if (this.tracingEnabled) {
      console.error(`${this.config.name} MCP server running on stdio`);
    }

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }
}
