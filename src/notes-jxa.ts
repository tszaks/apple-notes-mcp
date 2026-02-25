export const NOTES_JXA_SCRIPT = String.raw`
ObjC.import('Foundation');

function getEnv(name) {
  try {
    var env = $.NSProcessInfo.processInfo.environment;
    var raw = env.objectForKey(name);
    return raw ? ObjC.unwrap(raw) : '';
  } catch (error) {
    return '';
  }
}

function safeCall(fn, fallbackValue) {
  try {
    var value = fn();
    return value === undefined || value === null ? fallbackValue : value;
  } catch (error) {
    return fallbackValue;
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function toIsoDate(value) {
  if (!value) return null;

  try {
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString();
  } catch (error) {
    return null;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function decodeHtml(value) {
  return String(value)
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToText(value) {
  if (!value) return '';

  return decodeHtml(
    String(value)
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\r/g, '')
      .replace(/\n{3,}/g, '\n\n')
  ).trim();
}

function plainTextToHtml(value) {
  var text = String(value || '');
  if (!text.trim()) return '<div><br></div>';

  var lines = text.replace(/\r/g, '').split('\n');
  var htmlLines = [];

  for (var i = 0; i < lines.length; i += 1) {
    var line = lines[i];
    if (line.trim()) {
      htmlLines.push('<div>' + escapeHtml(line) + '</div>');
    } else {
      htmlLines.push('<div><br></div>');
    }
  }

  return htmlLines.join('\n');
}

function composeNoteHtml(title, body, bodyFormat) {
  var hasTitle = typeof title === 'string' && title.trim().length > 0;
  var bodyHtml = bodyFormat === 'html' ? String(body || '') : plainTextToHtml(body || '');

  if (hasTitle) {
    return '<div><h1>' + escapeHtml(title.trim()) + '</h1></div>\n' + bodyHtml;
  }

  return bodyHtml;
}

function injectTitleIntoHtml(html, title) {
  var safeTitle = escapeHtml(String(title || '').trim());
  if (!safeTitle) return String(html || '');

  var nextHtml = String(html || '');
  var h1Regex = /<h1>[^<]*<\/h1>/i;

  if (h1Regex.test(nextHtml)) {
    return nextHtml.replace(h1Regex, '<h1>' + safeTitle + '</h1>');
  }

  return '<div><h1>' + safeTitle + '</h1></div>\n' + nextHtml;
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function toBoolean(value, fallbackValue) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    var normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return fallbackValue;
}

function toInteger(value, fallbackValue, minValue, maxValue) {
  var numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallbackValue;

  var parsed = Math.trunc(numeric);
  if (parsed < minValue) return minValue;
  if (parsed > maxValue) return maxValue;
  return parsed;
}

function requireNonEmptyString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('Missing or invalid "' + fieldName + '".');
  }

  return value.trim();
}

function requireConfirmAndReason(payload) {
  if (!toBoolean(payload.confirm, false)) {
    throw new Error('This operation is destructive and requires confirm=true.');
  }

  requireNonEmptyString(payload.reason, 'reason');
}

function buildState(app) {
  var state = {
    accounts: [],
    folders: [],
    notes: [],
    accountsById: {},
    foldersById: {},
    notesById: {},
    defaultAccountId: null,
  };

  var seenFolderIds = {};
  var seenNoteIds = {};

  function pushNote(note, accountEntry, folderEntry) {
    var noteId = safeCall(function () { return note.id(); }, '');
    if (!noteId || seenNoteIds[noteId]) return;

    seenNoteIds[noteId] = true;

    var noteEntry = {
      obj: note,
      id: noteId,
      name: safeCall(function () { return note.name(); }, ''),
      bodyHtml: null,
      bodyText: null,
      accountId: accountEntry.id,
      accountName: accountEntry.name,
      folderId: folderEntry.id,
      folderName: folderEntry.name,
      folderPath: folderEntry.path,
      creationDate: toIsoDate(safeCall(function () { return note.creationDate(); }, null)),
      modificationDate: toIsoDate(safeCall(function () { return note.modificationDate(); }, null)),
      shared: toBoolean(safeCall(function () { return note.shared(); }, false), false),
      passwordProtected: toBoolean(
        safeCall(function () { return note.passwordProtected(); }, false),
        false
      ),
      attachmentsCount: ensureArray(safeCall(function () { return note.attachments(); }, [])).length,
    };

    state.notes.push(noteEntry);
    state.notesById[noteEntry.id] = noteEntry;
  }

  function walkFolder(folder, accountEntry, parentPath) {
    var folderId = safeCall(function () { return folder.id(); }, '');
    if (!folderId || seenFolderIds[folderId]) return;

    seenFolderIds[folderId] = true;

    var folderName = safeCall(function () { return folder.name(); }, '(Untitled Folder)');
    var path = parentPath ? parentPath + '/' + folderName : folderName;

    var folderEntry = {
      obj: folder,
      id: folderId,
      name: folderName,
      path: path,
      accountId: accountEntry.id,
      accountName: accountEntry.name,
      parentPath: parentPath || null,
      creationDate: toIsoDate(safeCall(function () { return folder.creationDate(); }, null)),
      modificationDate: toIsoDate(safeCall(function () { return folder.modificationDate(); }, null)),
      noteCount: 0,
    };

    state.folders.push(folderEntry);
    state.foldersById[folderEntry.id] = folderEntry;

    var notes = ensureArray(safeCall(function () { return folder.notes(); }, []));
    folderEntry.noteCount = notes.length;

    for (var noteIndex = 0; noteIndex < notes.length; noteIndex += 1) {
      pushNote(notes[noteIndex], accountEntry, folderEntry);
    }

    var subfolders = ensureArray(safeCall(function () { return folder.folders(); }, []));
    for (var folderIndex = 0; folderIndex < subfolders.length; folderIndex += 1) {
      walkFolder(subfolders[folderIndex], accountEntry, path);
    }
  }

  var defaultAccountId = safeCall(function () {
    var defaultAccount = app.defaultAccount();
    return defaultAccount && defaultAccount.id ? defaultAccount.id() : null;
  }, null);

  if (defaultAccountId) {
    state.defaultAccountId = defaultAccountId;
  }

  var accounts = ensureArray(safeCall(function () { return app.accounts(); }, []));

  for (var accountIndex = 0; accountIndex < accounts.length; accountIndex += 1) {
    var account = accounts[accountIndex];
    var accountEntry = {
      obj: account,
      id: safeCall(function () { return account.id(); }, ''),
      name: safeCall(function () { return account.name(); }, '(Unnamed Account)'),
      defaultFolderName: safeCall(function () { return account.defaultFolder().name(); }, null),
      foldersCount: 0,
    };

    state.accounts.push(accountEntry);
    state.accountsById[accountEntry.id] = accountEntry;

    var accountFolders = ensureArray(safeCall(function () { return account.folders(); }, []));
    accountEntry.foldersCount = accountFolders.length;

    for (var i = 0; i < accountFolders.length; i += 1) {
      walkFolder(accountFolders[i], accountEntry, '');
    }
  }

  return state;
}

function resolveAccount(state, payload, options) {
  var required = options && options.required;
  var accountId = typeof payload.account_id === 'string' ? payload.account_id.trim() : '';
  var accountName = typeof payload.account_name === 'string' ? payload.account_name.trim() : '';

  if (accountId) {
    var byId = state.accountsById[accountId];
    if (!byId) {
      throw new Error('No account found for account_id: ' + accountId);
    }
    return byId;
  }

  if (accountName) {
    var exactNameMatches = state.accounts.filter(function (entry) {
      return normalize(entry.name) === normalize(accountName);
    });

    if (exactNameMatches.length === 1) {
      return exactNameMatches[0];
    }

    if (exactNameMatches.length > 1) {
      throw new Error('Multiple accounts found with account_name: ' + accountName);
    }

    var fuzzyMatches = state.accounts.filter(function (entry) {
      return normalize(entry.name).indexOf(normalize(accountName)) >= 0;
    });

    if (fuzzyMatches.length === 1) {
      return fuzzyMatches[0];
    }

    if (fuzzyMatches.length > 1) {
      throw new Error('Multiple account matches for account_name: ' + accountName);
    }

    throw new Error('No account found for account_name: ' + accountName);
  }

  if (required) {
    if (state.defaultAccountId && state.accountsById[state.defaultAccountId]) {
      return state.accountsById[state.defaultAccountId];
    }

    if (state.accounts.length > 0) {
      return state.accounts[0];
    }

    throw new Error('No Notes accounts available.');
  }

  return null;
}

function pickFolderCandidates(state, accountEntry) {
  if (!accountEntry) {
    return state.folders.slice();
  }

  return state.folders.filter(function (entry) {
    return entry.accountId === accountEntry.id;
  });
}

function resolveFolder(state, payload, options) {
  var required = options && options.required;
  var folderIdField = (options && options.folderIdField) || 'folder_id';
  var folderNameField = (options && options.folderNameField) || 'folder_name';

  var accountEntry = resolveAccount(state, payload, { required: false });

  var folderId = typeof payload[folderIdField] === 'string' ? payload[folderIdField].trim() : '';
  var folderName = typeof payload[folderNameField] === 'string' ? payload[folderNameField].trim() : '';

  if (folderId) {
    var byId = state.foldersById[folderId];
    if (!byId) {
      throw new Error('No folder found for ' + folderIdField + ': ' + folderId);
    }

    if (accountEntry && byId.accountId !== accountEntry.id) {
      throw new Error('Folder does not belong to selected account.');
    }

    return byId;
  }

  if (folderName) {
    var candidates = pickFolderCandidates(state, accountEntry);
    var normalizedName = normalize(folderName);

    var exactMatches = candidates.filter(function (entry) {
      return normalize(entry.name) === normalizedName || normalize(entry.path) === normalizedName;
    });

    if (exactMatches.length === 1) {
      return exactMatches[0];
    }

    if (exactMatches.length > 1) {
      throw new Error('Multiple folders matched by name/path: ' + folderName + '. Use folder_id.');
    }

    var fuzzyMatches = candidates.filter(function (entry) {
      return (
        normalize(entry.name).indexOf(normalizedName) >= 0 ||
        normalize(entry.path).indexOf(normalizedName) >= 0
      );
    });

    if (fuzzyMatches.length === 1) {
      return fuzzyMatches[0];
    }

    if (fuzzyMatches.length > 1) {
      throw new Error('Multiple folders matched by name/path: ' + folderName + '. Use folder_id.');
    }

    throw new Error('No folder found for ' + folderNameField + ': ' + folderName);
  }

  if (required) {
    throw new Error('Missing folder reference. Provide ' + folderIdField + ' or ' + folderNameField + '.');
  }

  return null;
}

function resolveNote(state, payload, options) {
  var required = options && options.required;
  var noteId = typeof payload.note_id === 'string' ? payload.note_id.trim() : '';

  if (noteId) {
    var byId = state.notesById[noteId];
    if (!byId) {
      throw new Error('No note found for note_id: ' + noteId);
    }

    return byId;
  }

  var noteName = typeof payload.note_name === 'string' ? payload.note_name.trim() : '';
  if (noteName) {
    var accountEntry = resolveAccount(state, payload, { required: false });
    var folderEntry = resolveFolder(state, payload, {
      required: false,
      folderIdField: 'folder_id',
      folderNameField: 'folder_name',
    });

    var candidates = state.notes.filter(function (entry) {
      if (accountEntry && entry.accountId !== accountEntry.id) return false;
      if (folderEntry && entry.folderId !== folderEntry.id) return false;
      return true;
    });

    var normalizedName = normalize(noteName);

    var exactMatches = candidates.filter(function (entry) {
      return normalize(entry.name) === normalizedName;
    });

    if (exactMatches.length === 1) {
      return exactMatches[0];
    }

    if (exactMatches.length > 1) {
      throw new Error('Multiple notes matched note_name. Use note_id.');
    }

    var fuzzyMatches = candidates.filter(function (entry) {
      return normalize(entry.name).indexOf(normalizedName) >= 0;
    });

    if (fuzzyMatches.length === 1) {
      return fuzzyMatches[0];
    }

    if (fuzzyMatches.length > 1) {
      throw new Error('Multiple notes matched note_name. Use note_id.');
    }

    throw new Error('No note found for note_name: ' + noteName);
  }

  if (required) {
    throw new Error('Missing note reference. Provide note_id.');
  }

  return null;
}

function sortNotesByModificationDate(notes) {
  return notes.sort(function (a, b) {
    var left = a.modificationDate ? Date.parse(a.modificationDate) : 0;
    var right = b.modificationDate ? Date.parse(b.modificationDate) : 0;
    return right - left;
  });
}

function serializeAccount(entry, state) {
  var noteCount = state.notes.filter(function (noteEntry) {
    return noteEntry.accountId === entry.id;
  }).length;

  var folderCount = state.folders.filter(function (folderEntry) {
    return folderEntry.accountId === entry.id;
  }).length;

  return {
    id: entry.id,
    name: entry.name,
    default_folder_name: entry.defaultFolderName,
    is_default: state.defaultAccountId === entry.id,
    folder_count: folderCount,
    note_count: noteCount,
  };
}

function serializeFolder(entry) {
  return {
    id: entry.id,
    name: entry.name,
    path: entry.path,
    account_id: entry.accountId,
    account_name: entry.accountName,
    parent_path: entry.parentPath,
    note_count: entry.noteCount,
    creation_date: entry.creationDate,
    modification_date: entry.modificationDate,
  };
}

function serializeNote(entry, includeBody, previewChars) {
  var previewLimit = typeof previewChars === 'number' ? previewChars : 220;

  function hydrateBody() {
    if (typeof entry.bodyHtml === 'string' && typeof entry.bodyText === 'string') {
      return;
    }

    if (entry.passwordProtected) {
      entry.bodyHtml = '';
      entry.bodyText = '';
      return;
    }

    var bodyHtml = safeCall(function () { return entry.obj.body(); }, '');
    entry.bodyHtml = typeof bodyHtml === 'string' ? bodyHtml : '';
    entry.bodyText = htmlToText(entry.bodyHtml);
  }

  hydrateBody();

  var bodyPreview = entry.bodyText;

  if (bodyPreview.length > previewLimit) {
    bodyPreview = bodyPreview.slice(0, previewLimit) + '...';
  }

  var payload = {
    id: entry.id,
    name: entry.name,
    title: entry.name,
    account_id: entry.accountId,
    account_name: entry.accountName,
    folder_id: entry.folderId,
    folder_name: entry.folderName,
    folder_path: entry.folderPath,
    creation_date: entry.creationDate,
    modification_date: entry.modificationDate,
    shared: entry.shared,
    password_protected: entry.passwordProtected,
    attachments_count: entry.attachmentsCount,
    body_preview: bodyPreview,
  };

  if (includeBody) {
    payload.body_html = entry.bodyHtml;
    payload.body_text = entry.bodyText;
  }

  return payload;
}

function serializeAttachment(attachment) {
  return {
    id: safeCall(function () { return attachment.id(); }, null),
    name: safeCall(function () { return attachment.name(); }, null),
    creation_date: toIsoDate(safeCall(function () { return attachment.creationDate(); }, null)),
    modification_date: toIsoDate(safeCall(function () { return attachment.modificationDate(); }, null)),
    content_identifier: safeCall(function () { return attachment.contentIdentifier(); }, null),
    content_type: safeCall(function () { return attachment.contentType(); }, null),
    url: safeCall(function () { return attachment.URL(); }, null),
  };
}

function listAccounts(state) {
  return {
    accounts: state.accounts.map(function (entry) {
      return serializeAccount(entry, state);
    }),
    total_accounts: state.accounts.length,
  };
}

function listFolders(state, payload) {
  var accountEntry = resolveAccount(state, payload, { required: false });
  var folders = pickFolderCandidates(state, accountEntry);

  folders.sort(function (a, b) {
    var left = (a.accountName + '/' + a.path).toLowerCase();
    var right = (b.accountName + '/' + b.path).toLowerCase();
    if (left < right) return -1;
    if (left > right) return 1;
    return 0;
  });

  return {
    account_scope: accountEntry
      ? { id: accountEntry.id, name: accountEntry.name }
      : { id: null, name: 'all' },
    folders: folders.map(function (entry) {
      return serializeFolder(entry);
    }),
    total_folders: folders.length,
  };
}

function listNotes(state, payload) {
  var accountEntry = resolveAccount(state, payload, { required: false });
  var folderEntry = resolveFolder(state, payload, { required: false });
  var includeBody = toBoolean(payload.include_body, false);
  var limit = toInteger(payload.limit, 50, 1, 500);

  var notes = state.notes.filter(function (entry) {
    if (accountEntry && entry.accountId !== accountEntry.id) return false;
    if (folderEntry && entry.folderId !== folderEntry.id) return false;
    return true;
  });

  sortNotesByModificationDate(notes);
  var selected = notes.slice(0, limit);

  return {
    account_scope: accountEntry
      ? { id: accountEntry.id, name: accountEntry.name }
      : { id: null, name: 'all' },
    folder_scope: folderEntry ? serializeFolder(folderEntry) : null,
    total_matches: notes.length,
    returned: selected.length,
    notes: selected.map(function (entry) {
      return serializeNote(entry, includeBody, 220);
    }),
  };
}

function getRecentNotes(state, payload) {
  var days = toInteger(payload.days, 30, 1, 3650);
  var limit = toInteger(payload.limit, 20, 1, 200);
  var threshold = Date.now() - days * 24 * 60 * 60 * 1000;

  var notes = state.notes.filter(function (entry) {
    if (!entry.modificationDate) return false;
    var modifiedAt = Date.parse(entry.modificationDate);
    return Number.isFinite(modifiedAt) && modifiedAt >= threshold;
  });

  sortNotesByModificationDate(notes);
  var selected = notes.slice(0, limit);

  return {
    days,
    total_matches: notes.length,
    returned: selected.length,
    notes: selected.map(function (entry) {
      return serializeNote(entry, toBoolean(payload.include_body, false), 220);
    }),
  };
}

function getNote(state, payload) {
  var noteEntry = resolveNote(state, payload, { required: true });

  return {
    note: serializeNote(noteEntry, true, 350),
  };
}

function searchNotes(state, payload) {
  var query = requireNonEmptyString(payload.query, 'query');
  var includeBody = toBoolean(payload.include_body, false);
  var limit = toInteger(payload.limit, 50, 1, 500);
  var caseSensitive = toBoolean(payload.case_sensitive, false);

  var accountEntry = resolveAccount(state, payload, { required: false });
  var folderEntry = resolveFolder(state, payload, { required: false });

  var queryValue = caseSensitive ? query : query.toLowerCase();

  function matches(value) {
    var haystack = String(value || '');
    if (!caseSensitive) haystack = haystack.toLowerCase();
    return haystack.indexOf(queryValue) >= 0;
  }

  var notes = state.notes.filter(function (entry) {
    if (accountEntry && entry.accountId !== accountEntry.id) return false;
    if (folderEntry && entry.folderId !== folderEntry.id) return false;

    var bodyText = '';
    if (!entry.passwordProtected) {
      if (typeof entry.bodyText !== 'string') {
        var bodyHtml = safeCall(function () { return entry.obj.body(); }, '');
        entry.bodyHtml = typeof bodyHtml === 'string' ? bodyHtml : '';
        entry.bodyText = htmlToText(entry.bodyHtml);
      }
      bodyText = entry.bodyText;
    }

    return matches(entry.name) || matches(bodyText) || matches(entry.folderPath) || matches(entry.accountName);
  });

  sortNotesByModificationDate(notes);
  var selected = notes.slice(0, limit);

  return {
    query: query,
    case_sensitive: caseSensitive,
    account_scope: accountEntry
      ? { id: accountEntry.id, name: accountEntry.name }
      : { id: null, name: 'all' },
    folder_scope: folderEntry ? serializeFolder(folderEntry) : null,
    total_matches: notes.length,
    returned: selected.length,
    notes: selected.map(function (entry) {
      return serializeNote(entry, includeBody, 260);
    }),
  };
}

function resolveTargetFolderForCreate(state, app, payload) {
  var explicitFolder = resolveFolder(state, payload, { required: false });
  if (explicitFolder) return explicitFolder.obj;

  var accountEntry = resolveAccount(state, payload, { required: false });

  if (!accountEntry) {
    accountEntry = resolveAccount(state, payload, { required: true });
  }

  var notesFolder = state.folders.find(function (entry) {
    return entry.accountId === accountEntry.id && normalize(entry.name) === 'notes';
  });

  if (notesFolder) {
    return notesFolder.obj;
  }

  var firstFolder = state.folders.find(function (entry) {
    return entry.accountId === accountEntry.id;
  });

  if (firstFolder) {
    return firstFolder.obj;
  }

  var fallbackFolder = app.Folder({ name: 'Notes' });
  accountEntry.obj.folders.push(fallbackFolder);
  return fallbackFolder;
}

function createNote(app, payload) {
  var state = buildState(app);
  var title = typeof payload.title === 'string' ? payload.title.trim() : '';
  var body = typeof payload.body === 'string' ? payload.body : '';
  var bodyFormat = normalize(payload.body_format) === 'html' ? 'html' : 'plain';

  if (!title && !body.trim()) {
    throw new Error('Provide at least one of title or body when creating a note.');
  }

  var targetFolder = resolveTargetFolderForCreate(state, app, payload);
  var html = composeNoteHtml(title, body, bodyFormat);
  var note = app.Note({ body: html });
  targetFolder.notes.push(note);

  var refreshed = buildState(app);
  var createdNote = refreshed.notesById[safeCall(function () { return note.id(); }, '')];

  if (!createdNote) {
    throw new Error('Note was created but could not be reloaded from Notes.');
  }

  return {
    note: serializeNote(createdNote, true, 350),
    created_at: new Date().toISOString(),
  };
}

function updateNote(app, payload) {
  var state = buildState(app);
  var noteEntry = resolveNote(state, payload, { required: true });

  var hasTitle = typeof payload.title === 'string' && payload.title.trim().length > 0;
  var hasBody = typeof payload.body === 'string';

  if (!hasTitle && !hasBody) {
    throw new Error('Provide at least one of title or body to update a note.');
  }

  var bodyFormat = normalize(payload.body_format) === 'html' ? 'html' : 'plain';
  var nextHtml = noteEntry.bodyHtml;

  if (typeof nextHtml !== 'string') {
    nextHtml = safeCall(function () { return noteEntry.obj.body(); }, '');
  }

  if (hasBody) {
    if (bodyFormat === 'html') {
      nextHtml = String(payload.body || '');
      if (hasTitle) {
        nextHtml = injectTitleIntoHtml(nextHtml, payload.title);
      }
    } else {
      nextHtml = composeNoteHtml(hasTitle ? payload.title : '', payload.body, 'plain');
      if (!hasTitle && noteEntry.name) {
        nextHtml = injectTitleIntoHtml(nextHtml, noteEntry.name);
      }
    }
  } else if (hasTitle) {
    nextHtml = injectTitleIntoHtml(nextHtml, payload.title);
  }

  noteEntry.obj.body = nextHtml;

  var refreshed = buildState(app);
  var updated = refreshed.notesById[noteEntry.id];

  if (!updated) {
    throw new Error('Note was updated but could not be reloaded from Notes.');
  }

  return {
    note: serializeNote(updated, true, 350),
    updated_at: new Date().toISOString(),
  };
}

function appendToNote(app, payload) {
  var state = buildState(app);
  var noteEntry = resolveNote(state, payload, { required: true });
  var content = requireNonEmptyString(payload.content, 'content');
  var contentFormat = normalize(payload.content_format) === 'html' ? 'html' : 'plain';

  var appendHtml = contentFormat === 'html' ? content : plainTextToHtml(content);
  var joinWithBreak = toBoolean(payload.insert_blank_line, true);
  var currentHtml = noteEntry.bodyHtml;

  if (typeof currentHtml !== 'string') {
    currentHtml = safeCall(function () { return noteEntry.obj.body(); }, '');
  }

  var separator = joinWithBreak ? '\n<div><br></div>\n' : '\n';
  noteEntry.obj.body = String(currentHtml || '') + separator + appendHtml;

  var refreshed = buildState(app);
  var updated = refreshed.notesById[noteEntry.id];

  if (!updated) {
    throw new Error('Note was appended but could not be reloaded from Notes.');
  }

  return {
    note: serializeNote(updated, true, 350),
    appended_at: new Date().toISOString(),
  };
}

function deleteNote(app, payload) {
  requireConfirmAndReason(payload);

  var state = buildState(app);
  var noteEntry = resolveNote(state, payload, { required: true });

  var snapshot = serializeNote(noteEntry, false, 220);
  noteEntry.obj.delete();

  return {
    deleted: true,
    note: snapshot,
    reason: String(payload.reason || ''),
    deleted_at: new Date().toISOString(),
  };
}

function createFolder(app, payload) {
  var folderName = requireNonEmptyString(payload.name, 'name');
  var state = buildState(app);

  var parentFolder = resolveFolder(state, payload, {
    required: false,
    folderIdField: 'parent_folder_id',
    folderNameField: 'parent_folder_name',
  });

  var accountEntry = resolveAccount(state, payload, { required: true });

  if (parentFolder && parentFolder.accountId !== accountEntry.id) {
    throw new Error('Parent folder does not belong to selected account.');
  }

  var folder = app.Folder({ name: folderName });

  if (parentFolder) {
    parentFolder.obj.folders.push(folder);
  } else {
    accountEntry.obj.folders.push(folder);
  }

  var refreshed = buildState(app);
  var createdFolder = refreshed.foldersById[safeCall(function () { return folder.id(); }, '')];

  if (!createdFolder) {
    throw new Error('Folder was created but could not be reloaded from Notes.');
  }

  return {
    folder: serializeFolder(createdFolder),
    created_at: new Date().toISOString(),
  };
}

function deleteFolder(app, payload) {
  requireConfirmAndReason(payload);

  var state = buildState(app);
  var folderEntry = resolveFolder(state, payload, { required: true });

  var descendants = state.folders.filter(function (entry) {
    return entry.path.indexOf(folderEntry.path + '/') === 0 && entry.accountId === folderEntry.accountId;
  });

  var notesInScope = state.notes.filter(function (noteEntry) {
    if (noteEntry.accountId !== folderEntry.accountId) return false;
    if (noteEntry.folderId === folderEntry.id) return true;

    return descendants.some(function (descendant) {
      return noteEntry.folderId === descendant.id;
    });
  });

  var snapshot = serializeFolder(folderEntry);

  folderEntry.obj.delete();

  return {
    deleted: true,
    folder: snapshot,
    impacted_note_count: notesInScope.length,
    impacted_subfolder_count: descendants.length,
    reason: String(payload.reason || ''),
    deleted_at: new Date().toISOString(),
  };
}

function moveNote(app, payload) {
  var state = buildState(app);
  var noteEntry = resolveNote(state, payload, { required: true });
  var targetFolder = resolveFolder(state, payload, {
    required: true,
    folderIdField: 'target_folder_id',
    folderNameField: 'target_folder_name',
  });

  if (noteEntry.folderId === targetFolder.id) {
    return {
      moved: false,
      message: 'Note is already in target folder.',
      note: serializeNote(noteEntry, false, 220),
    };
  }

  app.move(noteEntry.obj, { to: targetFolder.obj });

  var refreshed = buildState(app);
  var movedNote = refreshed.notesById[noteEntry.id];

  if (!movedNote) {
    throw new Error('Note was moved but could not be reloaded from Notes.');
  }

  return {
    moved: true,
    note: serializeNote(movedNote, false, 220),
    moved_at: new Date().toISOString(),
  };
}

function listAttachments(state, payload) {
  var noteEntry = resolveNote(state, payload, { required: true });
  var attachments = ensureArray(safeCall(function () { return noteEntry.obj.attachments(); }, []));

  return {
    note_id: noteEntry.id,
    note_title: noteEntry.name,
    attachment_count: attachments.length,
    attachments: attachments.map(function (attachment) {
      return serializeAttachment(attachment);
    }),
  };
}

function handle(app, operation, payload) {
  switch (operation) {
    case 'list_accounts':
      return listAccounts(buildState(app));

    case 'list_folders':
      return listFolders(buildState(app), payload);

    case 'list_notes':
      return listNotes(buildState(app), payload);

    case 'get_note':
      return getNote(buildState(app), payload);

    case 'search_notes':
      return searchNotes(buildState(app), payload);

    case 'get_recent_notes':
      return getRecentNotes(buildState(app), payload);

    case 'create_note':
      return createNote(app, payload);

    case 'update_note':
      return updateNote(app, payload);

    case 'append_to_note':
      return appendToNote(app, payload);

    case 'delete_note':
      return deleteNote(app, payload);

    case 'create_folder':
      return createFolder(app, payload);

    case 'delete_folder':
      return deleteFolder(app, payload);

    case 'move_note':
      return moveNote(app, payload);

    case 'list_attachments':
      return listAttachments(buildState(app), payload);

    default:
      throw new Error('Unsupported operation: ' + operation);
  }
}

function run(argv) {
  try {
    var operation = getEnv('MCP_NOTES_OPERATION');
    if (!operation) {
      throw new Error('Missing MCP_NOTES_OPERATION environment variable.');
    }

    var rawPayload = getEnv('MCP_NOTES_PAYLOAD') || '{}';
    var payload = JSON.parse(rawPayload);

    var app = Application('Notes');
    app.includeStandardAdditions = true;

    var result = handle(app, operation, payload || {});

    return JSON.stringify({ ok: true, result: result });
  } catch (error) {
    return JSON.stringify({ ok: false, error: String(error) });
  }
}
`;
