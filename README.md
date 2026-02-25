# Apple Notes MCP

Comprehensive Apple Notes MCP server for local macOS note management.

## Scope

This server exposes a full practical Apple Notes toolset across accounts, folders, notes, search, attachments, and destructive actions with explicit confirmation fields.

- Account discovery
- Folder listing/create/delete
- Note listing/read/search/recent
- Note create/update/append/move/delete
- Attachment metadata listing

## Prerequisites

- macOS with Apple Notes app
- Node.js 20+
- Apple Notes content synced locally (iCloud/IMAP)

## Setup

1. Install dependencies and build:

```bash
cd /Users/tyler/Projects/MCP-Servers/apple-notes-mcp
npm install
npm run build
```

2. Add to MCP config (`~/.mcp.json` or your client MCP config):

```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "node",
      "args": [
        "/Users/tyler/Projects/MCP-Servers/apple-notes-mcp/dist/index.js"
      ]
    }
  }
}
```

3. First run permission prompt:

On first use, macOS will prompt for Automation access so `osascript` can control Notes. Approve access.

## Run

```bash
node /Users/tyler/Projects/MCP-Servers/apple-notes-mcp/dist/index.js
```

## Available Tools

- `notes_list_accounts` `{}`
- `notes_list_folders` `{ account_id?, account_name? }`
- `notes_list_notes` `{ account_id?, account_name?, folder_id?, folder_name?, limit?, include_body? }`
- `notes_get_recent_notes` `{ days?, limit?, include_body? }`
- `notes_get_note` `{ note_id }`
- `notes_search_notes` `{ query, account_id?, account_name?, folder_id?, folder_name?, limit?, include_body?, case_sensitive? }`
- `notes_create_folder` `{ name, account_id?, account_name?, parent_folder_id?, parent_folder_name? }`
- `notes_delete_folder` `{ folder_id?, folder_name?, account_id?, account_name?, confirm, reason }` (destructive)
- `notes_create_note` `{ title?, body?, body_format?: "plain"|"html", account_id?, account_name?, folder_id?, folder_name? }`
- `notes_update_note` `{ note_id, title?, body?, body_format?: "plain"|"html" }`
- `notes_append_to_note` `{ note_id, content, content_format?: "plain"|"html", insert_blank_line? }`
- `notes_move_note` `{ note_id, target_folder_id?, target_folder_name?, account_id?, account_name? }`
- `notes_delete_note` `{ note_id, confirm, reason }` (destructive)
- `notes_list_attachments` `{ note_id }`

## Destructive Safety

Destructive operations require both:

- `confirm: true`
- non-empty `reason`

This applies to:

- `notes_delete_note`
- `notes_delete_folder`

## Notes

- The server uses native Apple Notes scripting via `osascript -l JavaScript` (JXA).
- Apple Notes does not need to be manually open. macOS auto-launches it when tools are called.
- `note_id`, `folder_id`, and `account_id` are stable identifiers from Apple Notes and are recommended over names.
- Attachment file export is not provided by Notes scripting directly. This server returns attachment metadata.

## License

MIT

## Quickstart TL;DR

```bash
npm install
npm run build
node dist/index.js
```

Add to MCP config:

```json
{
  "mcpServers": {
    "apple-notes": {
      "command": "node",
      "args": ["/absolute/path/to/apple-notes-mcp/dist/index.js"]
    }
  }
}
```

## How It Works (TL;DR)

- MCP client calls tool -> Node MCP server receives request
- Server invokes native macOS JXA (`osascript -l JavaScript`) against Apple Notes
- Response is normalized into JSON and returned to the MCP client
- Destructive operations require `confirm: true` and `reason`

## LLM Quick Copy

Use the copy button on this code block in GitHub.

```txt
Repo: apple-notes-mcp
Goal: Local Apple Notes MCP server for macOS.
Setup:
1) npm install
2) npm run build
3) Add MCP config entry pointing to dist/index.js
4) Start your MCP client and call notes_list_accounts
How to use:
- Discover: notes_list_accounts, notes_list_folders, notes_list_notes
- Read/search: notes_get_note, notes_search_notes, notes_get_recent_notes
- Write: notes_create_note, notes_update_note, notes_append_to_note, notes_move_note
- Destructive: notes_delete_note / notes_delete_folder require confirm=true and reason
How it works:
- Node MCP wrapper -> JXA via osascript -> Apple Notes automation API
```
