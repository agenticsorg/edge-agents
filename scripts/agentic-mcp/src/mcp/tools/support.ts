import { MCPTool, Context } from '../../types';
import OpenAI from 'openai';

export class SupportTool implements MCPTool {
  name = 'customer_support';
  description = 'Handle customer support inquiries and provide assistance';
  inputSchema = {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Customer inquiry or issue'
      },
      context: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          previousInteractions: { type: 'array' },
          category: {
            type: 'string',
            enum: ['technical', 'billing', 'product', 'general']
          }
        },
        description: 'Additional context about the customer and their history'
      },
      priority: {
        type: 'string',
        enum: ['low', 'medium', 'high', 'urgent'],
        description: 'Priority level of the support request'
      }
    },
    required: ['query']
  };

  private openai: OpenAI;

  constructor(apiKey: string) {
    this.openai = new OpenAI({ apiKey });
  }

  async execute(params: {
    query: string;
    context?: {
      userId?: string;
      previousInteractions?: any[];
      category?: 'technical' | 'billing' | 'product' | 'general';
    };
    priority?: 'low' | 'medium' | 'high' | 'urgent';
  }, context: Context): Promise<any> {
    try {
      // Create system message with support context
      const systemMessage = this.createSystemMessage(params);

      // Call OpenAI for support response
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemMessage },
          { role: 'user', content: params.query }
        ]
      });

      // Extract and format the response
      const result = response.choices[0].message.content;

      // Track the support interaction
      context.trackAction('support_query_handled');
      context.remember(`support_${Date.now()}`, {
        query: params.query,
        category: params.context?.category,
        priority: params.priority,
        response: result
      });

      return {
        response: result,
        metadata: {
          category: params.context?.category || 'general',
          priority: params.priority || 'medium',
          timestamp: new Date().toISOString(),
          interactionId: `support_${Date.now()}`
        }
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Support tool failed: ${errorMessage}`);
    }
  }

  private createSystemMessage(params: any): string {
    let systemMessage = 'You are a customer support agent providing assistance. ';
    systemMessage += 'Be professional, helpful, and empathetic in your responses. ';

    if (params.context?.category) {
      systemMessage += `You are handling a ${params.context.category} support request. `;
    }

    if (params.priority === 'urgent' || params.priority === 'high') {
      systemMessage += 'This is a high-priority request requiring immediate attention. ';
    }

    if (params.context?.previousInteractions?.length) {
      systemMessage += 'Consider previous interactions in your response. ';
    }

    systemMessage += 'Provide clear, actionable solutions when possible.';
    return systemMessage;
  }

  // Utility methods for support operations
  async categorizeQuery(query: string): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Categorize this support query as either: technical, billing, product, or general.'
        },
        { role: 'user', content: query }
      ]
    });

    return response.choices[0].message.content || 'general';
  }

  async determinePriority(query: string): Promise<string> {
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Determine the priority of this support query as: low, medium, high, or urgent.'
        },
        { role: 'user', content: query }
      ]
    });

    return response.choices[0].message.content || 'medium';
  }

  async suggestEscalation(query: string, responseText: string): Promise<boolean> {
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'Determine if this support interaction should be escalated to a human agent. Consider complexity, severity, and customer satisfaction.'
        },
        {
          role: 'user',
          content: `Query: ${query}\nResponse: ${responseText}`
        }
      ]
    });

    return completion.choices[0].message.content?.toLowerCase().includes('yes') || false;
  }
}
