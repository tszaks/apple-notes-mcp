#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { AppleNotesBridge } from './notes.js';

function textResult(text: string): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text,
      },
    ],
  };
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Missing or invalid '${field}'`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return undefined;
}

function optionalBoolean(value: unknown, field: string): boolean | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes'].includes(normalized)) return true;
    if (['false', '0', 'no'].includes(normalized)) return false;
  }

  throw new Error(`Missing or invalid '${field}'`);
}

function optionalInt(
  value: unknown,
  field: string,
  minValue: number,
  maxValue: number,
): number | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  let parsed: number | null = null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    parsed = Math.trunc(value);
  } else if (typeof value === 'string' && value.trim()) {
    parsed = Number.parseInt(value.trim(), 10);
  }

  if (parsed === null || !Number.isInteger(parsed)) {
    throw new Error(`Missing or invalid '${field}'`);
  }

  if (parsed < minValue || parsed > maxValue) {
    throw new Error(`'${field}' must be between ${minValue} and ${maxValue}`);
  }

  return parsed;
}

function optionalEnum<T extends string>(
  value: unknown,
  field: string,
  allowed: readonly T[],
): T | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`Missing or invalid '${field}'`);
  }

  const normalized = value.trim().toLowerCase();
  const matched = allowed.find((item) => item.toLowerCase() === normalized);

  if (!matched) {
    throw new Error(`'${field}' must be one of: ${allowed.join(', ')}`);
  }

  return matched;
}

function formatJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

const bridge = new AppleNotesBridge();

const server = new Server(
  {
    name: 'apple-notes-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'notes_list_accounts',
      description: 'List all Apple Notes accounts available on this Mac.',
      inputSchema: {
        type: 'object',
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: 'notes_list_folders',
      description:
        'List folders across Apple Notes. Optionally scope by account_id or account_name.',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: { type: 'string' },
          account_name: { type: 'string' },
        },
      },
    },
    {
      name: 'notes_list_notes',
      description:
        'List notes with optional scoping by account/folder and optional full body output.',
      inputSchema: {
        type: 'object',
        properties: {
          account_id: { type: 'string' },
          account_name: { type: 'string' },
          folder_id: { type: 'string' },
          folder_name: { type: 'string' },
          limit: { type: 'number' },
          include_body: { type: 'boolean' },
        },
      },
    },
    {
      name: 'notes_get_recent_notes',
      description: 'List recently modified notes from the last N days.',
      inputSchema: {
        type: 'object',
        properties: {
          days: { type: 'number' },
          limit: { type: 'number' },
          include_body: { type: 'boolean' },
        },
      },
    },
    {
      name: 'notes_get_note',
      description: 'Get a specific note by note_id with full HTML + text body.',
      inputSchema: {
        type: 'object',
        properties: {
          note_id: { type: 'string' },
        },
        required: ['note_id'],
      },
    },
    {
      name: 'notes_search_notes',
      description:
        'Search notes by keyword across title, body, folder path, and account. Optionally scoped to account/folder.',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          account_id: { type: 'string' },
          account_name: { type: 'string' },
          folder_id: { type: 'string' },
          folder_name: { type: 'string' },
          limit: { type: 'number' },
          include_body: { type: 'boolean' },
          case_sensitive: { type: 'boolean' },
        },
        required: ['query'],
      },
    },
    {
      name: 'notes_create_folder',
      description:
        'Create a folder in Apple Notes. You can target an account and optionally create it inside a parent folder.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          account_id: { type: 'string' },
          account_name: { type: 'string' },
          parent_folder_id: { type: 'string' },
          parent_folder_name: { type: 'string' },
        },
        required: ['name'],
      },
    },
    {
      name: 'notes_delete_folder',
      description:
        'Delete a folder (destructive). Requires confirm=true and reason. Can be targeted by folder_id or folder_name (+ account scope).',
      inputSchema: {
        type: 'object',
        properties: {
          folder_id: { type: 'string' },
          folder_name: { type: 'string' },
          account_id: { type: 'string' },
          account_name: { type: 'string' },
          confirm: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['confirm', 'reason'],
      },
    },
    {
      name: 'notes_create_note',
      description:
        'Create a note in Apple Notes. Supports plain text or HTML body and optional title.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
          body_format: { type: 'string', enum: ['plain', 'html'] },
          account_id: { type: 'string' },
          account_name: { type: 'string' },
          folder_id: { type: 'string' },
          folder_name: { type: 'string' },
        },
      },
    },
    {
      name: 'notes_update_note',
      description:
        'Update an existing note by note_id. You can set title, body, or both. Body supports plain text or HTML.',
      inputSchema: {
        type: 'object',
        properties: {
          note_id: { type: 'string' },
          title: { type: 'string' },
          body: { type: 'string' },
          body_format: { type: 'string', enum: ['plain', 'html'] },
        },
        required: ['note_id'],
      },
    },
    {
      name: 'notes_append_to_note',
      description:
        'Append content to an existing note by note_id. Supports plain text or HTML append mode.',
      inputSchema: {
        type: 'object',
        properties: {
          note_id: { type: 'string' },
          content: { type: 'string' },
          content_format: { type: 'string', enum: ['plain', 'html'] },
          insert_blank_line: { type: 'boolean' },
        },
        required: ['note_id', 'content'],
      },
    },
    {
      name: 'notes_move_note',
      description:
        'Move a note to another folder by note_id + target_folder_id/target_folder_name.',
      inputSchema: {
        type: 'object',
        properties: {
          note_id: { type: 'string' },
          target_folder_id: { type: 'string' },
          target_folder_name: { type: 'string' },
          account_id: { type: 'string' },
          account_name: { type: 'string' },
        },
        required: ['note_id'],
      },
    },
    {
      name: 'notes_delete_note',
      description:
        'Delete a note (destructive). Requires confirm=true and reason.',
      inputSchema: {
        type: 'object',
        properties: {
          note_id: { type: 'string' },
          confirm: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['note_id', 'confirm', 'reason'],
      },
    },
    {
      name: 'notes_list_attachments',
      description: 'List metadata for all attachments in a specific note.',
      inputSchema: {
        type: 'object',
        properties: {
          note_id: { type: 'string' },
        },
        required: ['note_id'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = (request.params.arguments ?? {}) as Record<string, unknown>;

  try {
    switch (request.params.name) {
      case 'notes_list_accounts': {
        const result = await bridge.execute('list_accounts', {});
        return textResult(formatJson(result));
      }

      case 'notes_list_folders': {
        const result = await bridge.execute('list_folders', {
          account_id: optionalString(args.account_id),
          account_name: optionalString(args.account_name),
        });
        return textResult(formatJson(result));
      }

      case 'notes_list_notes': {
        const result = await bridge.execute('list_notes', {
          account_id: optionalString(args.account_id),
          account_name: optionalString(args.account_name),
          folder_id: optionalString(args.folder_id),
          folder_name: optionalString(args.folder_name),
          limit: optionalInt(args.limit, 'limit', 1, 500),
          include_body: optionalBoolean(args.include_body, 'include_body'),
        });
        return textResult(formatJson(result));
      }

      case 'notes_get_recent_notes': {
        const result = await bridge.execute('get_recent_notes', {
          days: optionalInt(args.days, 'days', 1, 3650),
          limit: optionalInt(args.limit, 'limit', 1, 200),
          include_body: optionalBoolean(args.include_body, 'include_body'),
        });
        return textResult(formatJson(result));
      }

      case 'notes_get_note': {
        const result = await bridge.execute('get_note', {
          note_id: requireString(args.note_id, 'note_id'),
        });
        return textResult(formatJson(result));
      }

      case 'notes_search_notes': {
        const result = await bridge.execute('search_notes', {
          query: requireString(args.query, 'query'),
          account_id: optionalString(args.account_id),
          account_name: optionalString(args.account_name),
          folder_id: optionalString(args.folder_id),
          folder_name: optionalString(args.folder_name),
          limit: optionalInt(args.limit, 'limit', 1, 500),
          include_body: optionalBoolean(args.include_body, 'include_body'),
          case_sensitive: optionalBoolean(args.case_sensitive, 'case_sensitive'),
        });
        return textResult(formatJson(result));
      }

      case 'notes_create_folder': {
        const result = await bridge.execute('create_folder', {
          name: requireString(args.name, 'name'),
          account_id: optionalString(args.account_id),
          account_name: optionalString(args.account_name),
          parent_folder_id: optionalString(args.parent_folder_id),
          parent_folder_name: optionalString(args.parent_folder_name),
        });
        return textResult(formatJson(result));
      }

      case 'notes_delete_folder': {
        const result = await bridge.execute('delete_folder', {
          folder_id: optionalString(args.folder_id),
          folder_name: optionalString(args.folder_name),
          account_id: optionalString(args.account_id),
          account_name: optionalString(args.account_name),
          confirm: optionalBoolean(args.confirm, 'confirm'),
          reason: requireString(args.reason, 'reason'),
        });
        return textResult(formatJson(result));
      }

      case 'notes_create_note': {
        const result = await bridge.execute('create_note', {
          title: optionalString(args.title),
          body: optionalString(args.body),
          body_format: optionalEnum(args.body_format, 'body_format', ['plain', 'html'] as const),
          account_id: optionalString(args.account_id),
          account_name: optionalString(args.account_name),
          folder_id: optionalString(args.folder_id),
          folder_name: optionalString(args.folder_name),
        });
        return textResult(formatJson(result));
      }

      case 'notes_update_note': {
        const result = await bridge.execute('update_note', {
          note_id: requireString(args.note_id, 'note_id'),
          title: optionalString(args.title),
          body: optionalString(args.body),
          body_format: optionalEnum(args.body_format, 'body_format', ['plain', 'html'] as const),
        });
        return textResult(formatJson(result));
      }

      case 'notes_append_to_note': {
        const result = await bridge.execute('append_to_note', {
          note_id: requireString(args.note_id, 'note_id'),
          content: requireString(args.content, 'content'),
          content_format: optionalEnum(args.content_format, 'content_format', [
            'plain',
            'html',
          ] as const),
          insert_blank_line: optionalBoolean(args.insert_blank_line, 'insert_blank_line'),
        });
        return textResult(formatJson(result));
      }

      case 'notes_move_note': {
        const result = await bridge.execute('move_note', {
          note_id: requireString(args.note_id, 'note_id'),
          target_folder_id: optionalString(args.target_folder_id),
          target_folder_name: optionalString(args.target_folder_name),
          account_id: optionalString(args.account_id),
          account_name: optionalString(args.account_name),
        });
        return textResult(formatJson(result));
      }

      case 'notes_delete_note': {
        const result = await bridge.execute('delete_note', {
          note_id: requireString(args.note_id, 'note_id'),
          confirm: optionalBoolean(args.confirm, 'confirm'),
          reason: requireString(args.reason, 'reason'),
        });
        return textResult(formatJson(result));
      }

      case 'notes_list_attachments': {
        const result = await bridge.execute('list_attachments', {
          note_id: requireString(args.note_id, 'note_id'),
        });
        return textResult(formatJson(result));
      }

      default:
        return textResult(`Unknown tool: ${request.params.name}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: true,
    };
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

server.onerror = (error) => {
  console.error('[apple-notes-mcp] MCP error:', error);
};

process.on('SIGINT', async () => {
  await server.close();
  process.exit(0);
});

void main();
