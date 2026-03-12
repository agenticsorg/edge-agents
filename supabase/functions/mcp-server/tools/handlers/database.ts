// tools/handlers/database.ts
import { createClient } from '@supabase/supabase-js';
import { ToolHandler } from '../registry.ts';

// Get environment variables
// @ts-ignore - Deno is available in Supabase Edge Functions
const SUPABASE_URL = (Deno as any).env.get('SUPABASE_URL') || '';
// @ts-ignore - Deno is available in Supabase Edge Functions
const SUPABASE_KEY = (Deno as any).env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

// Create Supabase client
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function validateIdentifier(name: string, label: string): void {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid ${label}: ${name}`);
  }
}

// Query database handler — uses only parameterized Supabase queries (no raw SQL)
async function queryDatabase(args: any): Promise<any> {
  const { table, select, filter, order, limit = 100 } = args;

  validateIdentifier(table, 'table name');

  try {
    const columns = Array.isArray(select) ? select.join(',') : '*';
    let queryBuilder = supabase.from(table).select(columns);

    // Apply structured filters (parameterized, no SQL injection possible)
    if (filter && typeof filter === 'object') {
      for (const [column, value] of Object.entries(filter)) {
        validateIdentifier(column, 'column name');
        queryBuilder = queryBuilder.eq(column, value);
      }
    }

    // Apply ordering
    if (order && typeof order === 'object' && order.column) {
      validateIdentifier(order.column, 'order column');
      queryBuilder = queryBuilder.order(order.column, {
        ascending: order.ascending !== false,
      });
    }

    // Enforce max limit
    const safeLimit = Math.min(Math.max(1, Number(limit) || 100), 1000);
    const { data, error } = await queryBuilder.limit(safeLimit);

    if (error) throw new Error(error.message);
    return {
      data,
      metadata: {
        table,
        row_count: Array.isArray(data) ? data.length : 0,
        limit: safeLimit,
      },
    };
  } catch (error) {
    throw new Error(`Database query error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Insert data handler
async function insertData(args: any): Promise<any> {
  const { table, data } = args;

  validateIdentifier(table, 'table name');

  if (!data || typeof data !== 'object') {
    throw new Error('Data must be a non-null object');
  }

  try {
    const { data: result, error } = await supabase
      .from(table)
      .insert(data)
      .select();

    if (error) throw new Error(error.message);
    return result;
  } catch (error) {
    throw new Error(`Database insert error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Update data handler
async function updateData(args: any): Promise<any> {
  const { table, data, match } = args;

  validateIdentifier(table, 'table name');

  if (!data || typeof data !== 'object') {
    throw new Error('Data must be a non-null object');
  }

  if (!match || typeof match !== 'object' || Object.keys(match).length === 0) {
    throw new Error('Match conditions are required for updates to prevent accidental full-table updates');
  }

  try {
    let query = supabase.from(table).update(data);

    for (const [key, value] of Object.entries(match)) {
      validateIdentifier(key, 'match column');
      query = query.eq(key, value);
    }

    const { data: result, error } = await query.select();

    if (error) throw new Error(error.message);
    return result;
  } catch (error) {
    throw new Error(`Database update error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Updated schema: structured filters instead of raw SQL
const safeQuerySchema = {
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
      description: 'Maximum number of results (max 1000)',
    },
  },
  required: ['table'],
};

// Export all database tools
export const databaseTools: ToolHandler[] = [
  {
    name: 'query_database',
    description: 'Query the Supabase database using structured filters (no raw SQL)',
    inputSchema: safeQuerySchema,
    handler: queryDatabase
  },
  {
    name: 'insert_data',
    description: 'Insert data into the Supabase database',
    inputSchema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'Table name',
        },
        data: {
          type: 'object',
          description: 'Data to insert',
        },
      },
      required: ['table', 'data'],
    },
    handler: insertData
  },
  {
    name: 'update_data',
    description: 'Update data in the Supabase database (match conditions required)',
    inputSchema: {
      type: 'object',
      properties: {
        table: {
          type: 'string',
          description: 'Table name',
        },
        data: {
          type: 'object',
          description: 'Data to update',
        },
        match: {
          type: 'object',
          description: 'Match conditions (required)',
        },
      },
      required: ['table', 'data', 'match'],
    },
    handler: updateData
  }
];
