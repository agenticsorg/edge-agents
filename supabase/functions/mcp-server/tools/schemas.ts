// tools/schemas.ts

// Database query tool schema — uses structured filters, no raw SQL
export const databaseQuerySchema = {
  type: 'object',
  properties: {
    table: {
      type: 'string',
      description: 'Table name',
    },
    select: {
      type: 'array',
      description: 'Columns to select (defaults to all)',
    },
    filter: {
      type: 'object',
      description: 'Filter conditions as key-value pairs (column: value)',
    },
    order: {
      type: 'object',
      description: 'Order by config: { column: string, ascending: boolean }',
    },
    limit: {
      type: 'number',
      description: 'Maximum number of results to return (max 1000)',
    },
  },
  required: ['table'],
};

// Messaging tool schema
export const sendMessageSchema = {
  type: 'object',
  properties: {
    agent: {
      type: 'string',
      description: 'Agent name',
    },
    message: {
      type: 'string',
      description: 'Message content',
    },
  },
  required: ['agent', 'message'],
};

// System info tool schema
export const systemInfoSchema = {
  type: 'object',
  properties: {
    type: {
      type: 'string',
      description: 'Type of system information to retrieve',
      enum: ['memory', 'cpu', 'disk', 'network', 'all'],
    },
  },
  required: ['type'],
};