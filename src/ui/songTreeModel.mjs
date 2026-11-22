import { normalizeFolderPath } from '../storage/localStore.mjs';

function makeFolderNode(key, label, path, { isBuiltin = false, isRootUploads = false, isOpen = true } = {}) {
  return {
    key,
    label,
    path,
    isBuiltin,
    isRootUploads,
    children: [],
    songs: [],
    totalSongCount: 0,
    isOpen,
  };
}

function songMatchesQuery(song, query) {
  const fields = [song.title, song.subtitle, song.fileName, song.folderPath].filter(Boolean);
  return fields.some((value) => String(value).toLowerCase().includes(query));
}

function finalizeNode(node, query, collapsedSet, ancestorMatched = false) {
  const isFiltering = query.length > 0;
  const selfMatched = isFiltering && node.label.toLowerCase().includes(query);
  const keepAllChildren = ancestorMatched || selfMatched;

  const filteredSongs =
    isFiltering && !keepAllChildren ? node.songs.filter((s) => songMatchesQuery(s, query)) : [...node.songs];

  const filteredChildren = [];
  for (const child of node.children) {
    const finalizedChild = finalizeNode(child, query, collapsedSet, keepAllChildren);
    if (finalizedChild) {
      filteredChildren.push(finalizedChild);
    }
  }

  const childSongTotal = filteredChildren.reduce((sum, c) => sum + c.totalSongCount, 0);
  const totalSongCount = filteredSongs.length + childSongTotal;

  if (isFiltering && totalSongCount === 0 && !selfMatched) {
    return null;
  }

  return {
    ...node,
    songs: filteredSongs.toSorted((a, b) => a.title.localeCompare(b.title)),
    children: filteredChildren.toSorted((a, b) => a.label.localeCompare(b.label)),
    totalSongCount,
    isOpen: isFiltering ? true : !collapsedSet.has(node.key),
  };
}

/**
 * Build a hierarchical, filterable FileTree model of built-in songs, user-created
 * nested folders, and uncategorized uploaded MIDI songs.
 */
export function buildSongTree({
  builtinSongs = [],
  customSongs = [],
  customFolders = [],
  collapsedFolders = [],
  filterQuery = '',
} = {}) {
  const collapsedSet = new Set(Array.isArray(collapsedFolders) ? collapsedFolders : []);
  const query = String(filterQuery || '')
    .trim()
    .toLowerCase();

  // 1. Built-in Songs folder
  const builtinNode = makeFolderNode('builtin', 'Built-in Songs', '', { isBuiltin: true });
  for (const song of builtinSongs) {
    builtinNode.songs.push({
      id: song.id,
      title: song.title,
      subtitle: song.subtitle || '',
      bpm: song.parsed?.bpm ?? 120,
      isCustom: false,
      folderPath: '',
    });
  }

  // 2. User-defined nested folders (from saved folders + any folderPath present on songs)
  const folderNodesByPath = new Map();
  const rootUserFolders = [];

  const ensureFolderPath = (rawPath) => {
    const norm = normalizeFolderPath(rawPath);
    if (!norm) return null;
    const parts = norm.split('/');
    let runningPath = '';
    let parentNode = null;

    for (const part of parts) {
      runningPath = runningPath ? `${runningPath}/${part}` : part;
      let existing = folderNodesByPath.get(runningPath);
      if (!existing) {
        existing = makeFolderNode(`folder:${runningPath}`, part, runningPath);
        folderNodesByPath.set(runningPath, existing);
        if (parentNode) {
          parentNode.children.push(existing);
        } else {
          rootUserFolders.push(existing);
        }
      }
      parentNode = existing;
    }
    return parentNode;
  };

  for (const folderPath of customFolders) {
    ensureFolderPath(folderPath);
  }

  const rootUploadsNode = makeFolderNode('uploaded', 'Uploaded Songs', '', { isRootUploads: true });

  for (const song of customSongs) {
    const normPath = normalizeFolderPath(song.folderPath ?? '');
    const entry = {
      id: song.id,
      title: song.title,
      subtitle: `${Math.round(song.bpm || 120)} BPM · ${song.trackCount || 1} track(s)`,
      fileName: song.fileName || '',
      bpm: song.bpm ?? 120,
      isCustom: true,
      folderPath: normPath,
    };

    if (normPath) {
      const targetFolder = ensureFolderPath(normPath);
      if (targetFolder) {
        targetFolder.songs.push(entry);
        continue;
      }
    }
    rootUploadsNode.songs.push(entry);
  }

  const candidateRoots = [];
  if (rootUploadsNode.songs.length > 0) {
    candidateRoots.push(rootUploadsNode);
  }
  candidateRoots.push(...rootUserFolders.toSorted((a, b) => a.label.localeCompare(b.label)));
  candidateRoots.push(builtinNode);

  const roots = [];
  let totalMatches = 0;
  for (const candidate of candidateRoots) {
    const finalized = finalizeNode(candidate, query, collapsedSet, false);
    if (finalized) {
      roots.push(finalized);
      totalMatches += finalized.totalSongCount;
    }
  }

  return {
    roots,
    totalMatches,
    isFiltering: query.length > 0,
  };
}
