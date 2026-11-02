import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  Copy,
  Download,
  Play,
  Plus,
  RotateCcw,
  ShieldAlert,
  Square,
  Timer,
  Trash2,
  Upload,
  Workflow,
  X,
} from 'lucide-react';
import type { X87 } from '../hid/keyboard';
import { MACRO_BANK_SIZE, MAX_DELAY_MS, MAX_MACROS, type MacroDefinition, type MacroEvent } from '../hid/macros';
import { KEY_USAGES } from '../hid/usages';
import {
  type MacroDraft,
  browserCodeToHidUsage,
  calculateMacroDuration,
  describeMacroEvent,
  estimateBankSize,
  exportDraftsToJsonFile,
  parseImportedJsonDrafts,
  validateMacroDraft,
  validateMacroName,
} from './macroDrafts';
import type { Run } from './useBusy';
import { MACRO_BANK_BACKUP_KEY, uploadMacroBank } from './macroUpload';
import { bankToEditor, macroBankSnapshot, changedMacroSlots } from './macroBankEditor';
import { useUnsavedChanges } from './UnsavedChanges';
import { ConfirmDialog } from './ConfirmDialog';
import { usePopup } from './PopupProvider';

interface Props {
  kb: X87;
  run: Run;
}

export function MacroPanel({ kb, run }: Props) {
  const popup = usePopup();
  const [drafts, setDrafts] = useState<MacroDraft[]>([]);
  const [savedBank, setSavedBank] = useState<MacroDraft[] | null>(null);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedIdx, setSelectedIdx] = useState<number>(0);
  const [editingName, setEditingName] = useState<boolean>(false);
  const [nameInput, setNameInput] = useState<string>('');

  // Recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const recordStartTime = useRef<number>(0);
  const lastEventTime = useRef<number>(0);
  const recordingContainerRef = useRef<HTMLDivElement>(null);

  // Dialog & status state
  const [showConfirmUpload, setShowConfirmUpload] = useState<boolean>(false);
  const [deleteIndex, setDeleteIndex] = useState<number | null>(null);
  const [wirelessAckConfirmed, setWirelessAckConfirmed] = useState<boolean>(false);
  const [replacementConfirmed, setReplacementConfirmed] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<{ type: 'ok' | 'warn' | 'err'; message: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = savedBank !== null && macroBankSnapshot(drafts) !== macroBankSnapshot(savedBank);
  const changedSlots = savedBank ? changedMacroSlots(drafts, savedBank) : 0;
  const pendingRename = editingName && nameInput !== (drafts[selectedIdx]?.name ?? '');
  const { barRef } = useUnsavedChanges(dirty || isRecording || pendingRename);

  useEffect(() => {
    let active = true;
    run('Reading macro bank', async () => {
      try {
        const bank = bankToEditor(await kb.macroBank());
        if (!active) return;
        setDrafts(bank);
        setSavedBank(bank);
        setLoadState('ready');
      } catch (e) {
        if (active) { setLoadState('error'); setUploadStatus({ type: 'err', message: `Could not read keyboard macros. ${e instanceof Error ? e.message : String(e)}` }); }
      }
    });
    return () => { active = false; };
  }, [kb, run]);

  // Keep selected index clamped and valid
  const safeSelectedIdx = selectedIdx >= drafts.length ? Math.max(0, drafts.length - 1) : selectedIdx;
  const activeDraft = drafts[safeSelectedIdx] ?? drafts[0];

  // Calculate current bank usage
  const bankBytesUsed = useMemo(() => estimateBankSize(drafts), [drafts]);
  const bankPercent = Math.min(100, Math.round((bankBytesUsed / MACRO_BANK_SIZE) * 100));

  // Current macro validation
  const activeValidationErrors = useMemo(() => {
    return activeDraft ? validateMacroDraft(activeDraft) : [];
  }, [activeDraft]);

  // Handle draft mutations
  const updateActiveDraft = (updater: (prev: MacroDraft) => MacroDraft) => {
    setDrafts((cur) => {
      const next = [...cur];
      if (next[safeSelectedIdx]) {
        next[safeSelectedIdx] = updater(next[safeSelectedIdx]);
      }
      return next;
    });
  };

  const handleCreateDraft = () => {
    if (drafts.length >= MAX_MACROS) {
      popup.alert(`Maximum of ${MAX_MACROS} macros allowed.`);
      return;
    }
    const newDraft: MacroDraft = {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `Macro ${drafts.length + 1}`,
      events: [
        { type: 'key', value: 0x04, down: true, delayMs: 0 },
        { type: 'key', value: 0x04, down: false, delayMs: 50 },
      ],
      repeat: { mode: 'times', count: 1 },
      updatedAt: Date.now(),
    };
    setDrafts((cur) => [...cur, newDraft]);
    setSelectedIdx(drafts.length);
    setNameInput(newDraft.name);
    setEditingName(false);
  };

  const handleDuplicateDraft = (index: number) => {
    if (drafts.length >= MAX_MACROS) {
      popup.alert(`Maximum of ${MAX_MACROS} macros allowed.`);
      return;
    }
    const src = drafts[index];
    if (!src) return;
    const copy: MacroDraft = {
      ...src,
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `${src.name} (Copy)`.slice(0, 30),
      events: src.events.map((e) => ({ ...e })),
      updatedAt: Date.now(),
    };
    setDrafts((cur) => [...cur.slice(0, index + 1), copy, ...cur.slice(index + 1)]);
    setSelectedIdx(index + 1);
    setNameInput(copy.name);
    setEditingName(false);
  };

  const handleDeleteDraft = (index: number) => {
    setDrafts((cur) => cur.filter((_, i) => i !== index));
    setDeleteIndex(null);
    if (selectedIdx >= index && selectedIdx > 0) {
      setSelectedIdx((i) => i - 1);
    }
  };

  const handleSaveName = () => {
    const err = validateMacroName(nameInput);
    if (err) {
      popup.alert(err);
      return;
    }
    updateActiveDraft((d) => ({ ...d, name: nameInput.trim(), updatedAt: Date.now() }));
    setEditingName(false);
  };

  // Event list operations
  const handleAddEvent = (type: MacroEvent['type'] = 'key') => {
    let newEv: MacroEvent;
    if (type === 'key') {
      newEv = { type: 'key', value: 0x04, down: true, delayMs: 40 };
    } else if (type === 'mouseButton') {
      newEv = { type: 'mouseButton', value: 1, down: true, delayMs: 40 };
    } else if (type === 'moveX') {
      newEv = { type: 'moveX', value: 10, down: false, delayMs: 20 };
    } else if (type === 'moveY') {
      newEv = { type: 'moveY', value: 10, down: false, delayMs: 20 };
    } else {
      newEv = { type: 'wheel', value: 1, down: false, delayMs: 20 };
    }

    updateActiveDraft((d) => ({
      ...d,
      events: [...d.events, newEv],
      updatedAt: Date.now(),
    }));
  };

  const handleUpdateEvent = (evIndex: number, patch: Partial<MacroEvent>) => {
    updateActiveDraft((d) => {
      const nextEvents = [...d.events];
      nextEvents[evIndex] = { ...nextEvents[evIndex], ...patch };
      return { ...d, events: nextEvents, updatedAt: Date.now() };
    });
  };

  const handleDeleteEvent = (evIndex: number) => {
    if (activeDraft.events.length <= 1) {
      popup.alert('A macro must contain at least 1 event.');
      return;
    }
    updateActiveDraft((d) => ({
      ...d,
      events: d.events.filter((_, i) => i !== evIndex),
      updatedAt: Date.now(),
    }));
  };

  const handleMoveEvent = (evIndex: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? evIndex - 1 : evIndex + 1;
    if (targetIndex < 0 || targetIndex >= activeDraft.events.length) return;

    updateActiveDraft((d) => {
      const list = [...d.events];
      const temp = list[evIndex];
      list[evIndex] = list[targetIndex];
      list[targetIndex] = temp;
      return { ...d, events: list, updatedAt: Date.now() };
    });
  };

  // In-app Key Recorder (Explicit focus only, no global shortcuts interception)
  const startRecording = () => {
    setIsRecording(true);
    recordStartTime.current = Date.now();
    lastEventTime.current = Date.now();
    setTimeout(() => {
      recordingContainerRef.current?.focus();
    }, 50);
  };

  const stopRecording = () => {
    setIsRecording(false);
  };

  useEffect(() => {
    const stopOnBlur = () => setIsRecording(false);
    window.addEventListener('blur', stopOnBlur);
    return () => window.removeEventListener('blur', stopOnBlur);
  }, []);

  const handleKeyDownRecorder = (e: React.KeyboardEvent) => {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.repeat) return;
    if (e.code === 'Escape' && e.shiftKey) {
      stopRecording();
      return;
    }

    const hidUsage = browserCodeToHidUsage(e.code);
    if (!hidUsage) {
      setUploadStatus({ type: 'warn', message: `Recorder does not support ${e.code || 'this key'}; it was not recorded.` });
      return;
    }

    const now = Date.now();
    const delayMs = Math.min(Math.max(0, now - lastEventTime.current), MAX_DELAY_MS);
    lastEventTime.current = now;

    const newEv: MacroEvent = {
      type: 'key',
      value: hidUsage,
      down: true,
      delayMs,
    };

    updateActiveDraft((d) => ({
      ...d,
      events: [...d.events, newEv],
      updatedAt: Date.now(),
    }));
  };

  const handleKeyUpRecorder = (e: React.KeyboardEvent) => {
    if (!isRecording) return;
    e.preventDefault();
    e.stopPropagation();

    const hidUsage = browserCodeToHidUsage(e.code);
    if (!hidUsage) {
      setUploadStatus({ type: 'warn', message: `Recorder does not support ${e.code || 'this key'}; it was not recorded.` });
      return;
    }

    const now = Date.now();
    const delayMs = Math.min(Math.max(0, now - lastEventTime.current), MAX_DELAY_MS);
    lastEventTime.current = now;

    const newEv: MacroEvent = {
      type: 'key',
      value: hidUsage,
      down: false,
      delayMs,
    };

    updateActiveDraft((d) => ({
      ...d,
      events: [...d.events, newEv],
      updatedAt: Date.now(),
    }));
  };

  // JSON Import & Export
  const handleExportJson = () => {
    exportDraftsToJsonFile(drafts);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result as string;
        const imported = parseImportedJsonDrafts(text);
        const preview = imported.map((d, i) => `${i + 1}: ${d.name}`).join('\n');
        if (await popup.confirm({ title: 'Import macro bank?', confirmLabel: 'Import', message: `Replace the unsaved editor with these ${imported.length} slots?\n${preview}\n\nCurrent unsaved edits will be discarded; hardware is not changed until Save. Export first if needed.` })) {
          setDrafts(imported);
          setSelectedIdx(0);
          setUploadStatus({ type: 'warn', message: 'Imported slots into memory in file order. Nothing has been saved to the keyboard.' });
        }
      } catch (err) {
        popup.alert(`Failed to import JSON: ${err instanceof Error ? err.message : String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // Upload Preflight & Execute
  const initiateUploadFlow = () => {
    // Validate all drafts
    for (let i = 0; i < drafts.length; i++) {
      const errs = validateMacroDraft(drafts[i]);
      if (errs.length) {
        popup.alert(`Draft #${i + 1} ("${drafts[i].name}") has errors:\n• ${errs.join('\n• ')}`);
        setSelectedIdx(i);
        return;
      }
    }

    if (bankBytesUsed > MACRO_BANK_SIZE) {
      popup.alert(`Total macro bank size (${bankBytesUsed} bytes) exceeds keyboard capacity (${MACRO_BANK_SIZE} bytes). Please remove or shorten macros.`);
      return;
    }


    setIsRecording(false);
    setWirelessAckConfirmed(false);
    setReplacementConfirmed(false);
    setShowConfirmUpload(true);
  };

  const handleConfirmUpload = async () => {
    if (!replacementConfirmed || (kb.connection !== 'wired' && !wirelessAckConfirmed)) return;
    setShowConfirmUpload(false);

    const definitions: MacroDefinition[] = drafts.map((d) => ({
      name: d.name,
      events: d.events,
    }));

    await run('Uploading macro bank to keyboard', async () => {
      // 1. Upload macro bank with firmware preflight
      let res: { verified: boolean };
      try {
        res = await uploadMacroBank(kb, definitions, (previous) => {
          const backup = JSON.stringify({
            type: 'macro-drafts-export', version: 1, count: previous.length,
            exportedAt: new Date().toISOString(),
            drafts: previous.map((m) => ({ ...m, repeat: { mode: 'times', count: 1 } })),
          });
          localStorage.setItem(MACRO_BANK_BACKUP_KEY, backup);
          if (localStorage.getItem(MACRO_BANK_BACKUP_KEY) !== backup) throw new Error('Could not persist the previous bank');
        });
      } catch (e) {
        setUploadStatus({ type: 'err', message: e instanceof Error ? e.message : String(e) });
        throw e;
      }

      setSavedBank(drafts);
      if (res.verified) {
        setUploadStatus({
          type: 'ok',
          message: `Verified: Bank with ${definitions.length} macros uploaded and verified with hardware. No key bindings were changed.`,
        });
      } else {
        setUploadStatus({
          type: 'warn',
          message: `Bank with ${definitions.length} macros sent without a verified read-back. No key bindings were changed.`,
        });
      }
    });
  };

  const isWired = kb.connection === 'wired';
  const discard = () => {
    if (!savedBank) return;
    setIsRecording(false);
    setDrafts(savedBank);
    setSelectedIdx(0);
    setEditingName(false);
    setUploadStatus(null);
  };

  if (loadState === 'loading') return <section className="card" role="status">Reading macros from keyboard memory…</section>;
  if (loadState === 'error') return <section className="card" role="alert">{uploadStatus?.message} Reconnect the keyboard or reopen Macros to try again. No local data was substituted.</section>;

  return (
    <div className="macro-container">
      <p className="note"><strong>Experimental:</strong> Macro encoding is based on reverse engineering. Playback and indefinite repeat behavior have not been hardware-validated. Back up before replacing the shared bank.</p>
      {/* Hidden file input for JSON import */}
      <input type="file" ref={fileInputRef} accept=".json,application/json" style={{ display: 'none' }} onChange={handleImportJson} />

      {/* Top Banner Status (if any) */}
      {uploadStatus && (
        <div className={`macro-banner ${uploadStatus.type}`}>
          {uploadStatus.type === 'ok' ? (
            <CheckCircle2 size={18} className="text-ok" />
          ) : (
            <AlertTriangle size={18} className="text-accent" />
          )}
          <span style={{ flex: 1 }}>{uploadStatus.message}</span>
          <button className="icon-btn" onClick={() => setUploadStatus(null)} title="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main Grid: Left sidebar (Macro list & actions) + Right stage (Editor & Assignment) */}
      <div className="macro-grid">
        {/* ================= LEFT SIDEBAR: MACRO LIST ================= */}
        <aside className="macro-sidebar">
          <div className="macro-sidebar-header">
            <div>
              <h3 className="macro-sidebar-title">Macro Library</h3>
              <p className="macro-sidebar-desc">
                {drafts.length}/{MAX_MACROS} slots used • Loaded from keyboard
              </p>
            </div>
            <button className="btn ink btn-sm" onClick={handleCreateDraft} title="Create new macro draft">
              <Plus size={14} /> New
            </button>
          </div>

          {/* Bank Capacity Meter */}
          <div className="macro-bank-meter">
            <div className="macro-bank-labels">
              <span>Shared Memory</span>
              <span>
                {bankBytesUsed} / {MACRO_BANK_SIZE} B ({bankPercent}%)
              </span>
            </div>
            <div className="macro-bank-bar">
              <div
                className={`macro-bank-bar-fill ${bankPercent > 90 ? 'danger' : bankPercent > 70 ? 'warn' : ''}`}
                style={{ width: `${bankPercent}%` }}
              />
            </div>
          </div>

          {/* Draft List */}
          <div className="macro-list-scroll">
            {drafts.map((d, idx) => {
              const isSelected = idx === safeSelectedIdx;
              const duration = calculateMacroDuration(d.events);
              return (
                <div
                  key={d.id}
                  className={`macro-list-item ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    setSelectedIdx(idx);
                    setNameInput(d.name);
                    setEditingName(false);
                  }}
                >
                  <div className="macro-list-item-top">
                    <span className="macro-slot-badge">Slot {idx + 1}</span>
                    <span className="macro-item-duration">{duration} ms</span>
                  </div>
                  <div className="macro-item-name">{d.name}</div>
                  <div className="macro-item-meta">
                    <span>{d.events.length} event{d.events.length !== 1 ? 's' : ''}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Bottom Utility Bar (Hardware Read / JSON Export-Import) */}
          <div className="macro-sidebar-foot">
            <div className="macro-foot-actions">
              <button className="btn btn-sm" onClick={handleExportJson} title="Export drafts to portable JSON file">
                <Download size={13} /> Export JSON
              </button>
              <button className="btn btn-sm" onClick={() => fileInputRef.current?.click()} title="Import macro drafts from JSON file">
                <Upload size={13} /> Import
              </button>
            </div>
            <button className="btn btn-sm" onClick={() => {
              const backup = localStorage.getItem(MACRO_BANK_BACKUP_KEY);
              if (!backup) { popup.alert('No automatic USB bank backup has been saved in this browser yet.'); return; }
              const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }));
              const a = document.createElement('a');
              a.href = url;
              a.download = 'x87-macro-bank-backup.json';
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}><Download size={13} /> Export bank backup</button>
            <div className="macro-foot-note">
              {isWired ? (
                <span className="text-ok">● USB connected: Direct bank read & verify supported</span>
              ) : (
                <span className="text-warn">▲ 2.4G: bank read/verify supported; saving takes ~20 s, keep keyboard awake</span>
              )}
            </div>
          </div>
        </aside>

        {/* ================= RIGHT WORKSPACE: EDITOR & ASSIGNMENT ================= */}
        <main className="macro-main">
          {activeDraft ? (
            <>
              {/* Macro Header / Meta Card */}
              <section className="card macro-header-card">
                <div className="macro-header-row">
                  <div className="macro-title-group">
                    {editingName ? (
                      <div className="macro-name-edit-form">
                        <input
                          type="text"
                          maxLength={30}
                          value={nameInput}
                          className="search macro-name-input"
                          autoFocus
                          onChange={(e) => setNameInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveName();
                            if (e.key === 'Escape') setEditingName(false);
                          }}
                        />
                        <button className="btn ink btn-sm" onClick={handleSaveName}>
                          Done
                        </button>
                        <button className="btn btn-sm" onClick={() => setEditingName(false)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="macro-name-display" onClick={() => setEditingName(true)} title="Click to rename">
                        <h2>{activeDraft.name}</h2>
                        <span className="macro-badge-slot">Slot {safeSelectedIdx + 1}</span>
                        <span className="macro-edit-hint">Click to rename</span>
                      </div>
                    )}
                    <div className="macro-tags">
                      <span className="tag">
                        <Timer size={12} /> {calculateMacroDuration(activeDraft.events)} ms total
                      </span>
                      <span className="tag">
                        {activeDraft.events.length} event{activeDraft.events.length !== 1 ? 's' : ''}
                      </span>
                      <span className="tag draft-tag">{dirty ? 'Unsaved changes' : 'Saved on keyboard'}</span>
                    </div>
                  </div>

                  {/* Actions: Duplicate, Delete */}
                  <div className="macro-actions-top">
                    <button className="btn btn-sm" onClick={() => handleDuplicateDraft(safeSelectedIdx)} title="Duplicate this macro">
                      <Copy size={14} /> Duplicate
                    </button>
                    <button
                      className="btn btn-sm text-danger"
                      onClick={() => setDeleteIndex(safeSelectedIdx)}
                      title="Delete this macro"
                    >
                      <Trash2 size={14} /> Delete
                    </button>
                  </div>
                </div>

                {/* Validation Warnings if any */}
                {activeValidationErrors.length > 0 && (
                  <div className="macro-error-callout">
                    <AlertCircle size={16} />
                    <div>
                      <strong>Cannot compile macro:</strong>
                      <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
                        {activeValidationErrors.map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                <p className="note">Repeat mode belongs to each key binding. Set it in Key remap → Macro after saving the bank.</p>
              </section>

              {/* Event Editor & Recorder Section */}
              <section className="card macro-events-section">
                <div className="macro-section-header">
                  <div>
                    <h3>Macro Sequence</h3>
                    <p className="note">
                      Each event has a delay (in milliseconds) before it executes in the timeline.
                    </p>
                  </div>
                  <div className="macro-event-tools">
                    {/* Key Recorder Control */}
                    {!isRecording ? (
                      <button className="btn ink btn-sm" onClick={startRecording} title="Record physical keystrokes">
                        <Play size={13} fill="currentColor" /> Record Keys
                      </button>
                    ) : (
                      <button className="btn danger btn-sm" onMouseDown={(e) => e.preventDefault()} onClick={stopRecording} title="Stop recording">
                        <Square size={13} fill="currentColor" /> Stop Recording
                      </button>
                    )}

                    {/* Manual Add Buttons */}
                    <div className="macro-add-dropdown">
                      <button className="btn btn-sm" onClick={() => handleAddEvent('key')}>
                        <Plus size={13} /> Add Key
                      </button>
                      <button className="btn btn-sm" onClick={() => handleAddEvent('mouseButton')}>
                        <Plus size={13} /> Mouse Button
                      </button>
                      <button className="btn btn-sm" onClick={() => handleAddEvent('moveX')}>
                        <Plus size={13} /> Cursor Move
                      </button>
                    </div>
                  </div>
                </div>

                {/* Recorder Capture Box (Active only during recording) */}
                {isRecording && (
                  <div
                    ref={recordingContainerRef}
                    tabIndex={0}
                    className="macro-recorder-box"
                    onKeyDown={handleKeyDownRecorder}
                    onKeyUp={handleKeyUpRecorder}
                    onBlur={stopRecording}
                  >
                    <div className="macro-recorder-indicator">
                      <span className="record-dot" />
                      <strong>Recording active... Press keyboard keys to capture down & up events with delays.</strong>
                    </div>
                    <div className="macro-recorder-sub">
                      Recording stops when this box loses focus. Check that every press has a release before uploading. Click Stop or press <strong>Shift + Esc</strong> to finish.
                    </div>
                  </div>
                )}

                {/* Event Items List */}
                <div className="macro-events-list">
                  {activeDraft.events.map((ev, evIndex) => {
                    const desc = describeMacroEvent(ev);
                    return (
                      <div key={evIndex} className="macro-event-row">
                        {/* Event Index & Order Arrows */}
                        <div className="macro-event-reorder">
                          <button
                            className="event-order-btn"
                            disabled={evIndex === 0}
                            onClick={() => handleMoveEvent(evIndex, 'up')}
                            title="Move event up"
                          >
                            <ArrowUp size={13} />
                          </button>
                          <span className="macro-event-index">#{evIndex + 1}</span>
                          <button
                            className="event-order-btn"
                            disabled={evIndex === activeDraft.events.length - 1}
                            onClick={() => handleMoveEvent(evIndex, 'down')}
                            title="Move event down"
                          >
                            <ArrowDown size={13} />
                          </button>
                        </div>

                        {/* Delay Input */}
                        <div className="macro-event-delay">
                          <label className="macro-field-label">Delay before</label>
                          <div className="macro-delay-input-wrap">
                            <input
                              type="number"
                              min="0"
                              max={MAX_DELAY_MS}
                              value={ev.delayMs}
                              className="search"
                              style={{ width: 80, height: 32, padding: '0 8px' }}
                              onChange={(e) =>
                                handleUpdateEvent(evIndex, {
                                  delayMs: Math.max(0, Math.min(MAX_DELAY_MS, parseInt(e.target.value) || 0)),
                                })
                              }
                            />
                            <span className="unit">ms</span>
                          </div>
                        </div>

                        {/* Event Type & Value Editors */}
                        <div className="macro-event-content">
                          <div className="macro-event-desc">
                            <span className="macro-event-title">{desc.title}</span>
                            <span className="macro-event-subtitle">{desc.subtitle}</span>
                          </div>

                          <div className="macro-event-fields">
                            {/* Key Usage Picker */}
                            {ev.type === 'key' && (
                              <select
                                className="search macro-select"
                                value={ev.value}
                                onChange={(e) => handleUpdateEvent(evIndex, { value: parseInt(e.target.value) })}
                              >
                                {KEY_USAGES.map(([code, name]) => (
                                  <option key={code} value={code}>
                                    {name}
                                  </option>
                                ))}
                              </select>
                            )}

                            {/* Mouse Button Picker */}
                            {ev.type === 'mouseButton' && (
                              <select
                                className="search macro-select"
                                value={ev.value}
                                onChange={(e) => handleUpdateEvent(evIndex, { value: parseInt(e.target.value) })}
                              >
                                <option value={1}>Left Button</option>
                                <option value={2}>Right Button</option>
                                <option value={4}>Middle Button</option>
                                <option value={8}>Back Button (Btn 4)</option>
                                <option value={16}>Forward Button (Btn 5)</option>
                              </select>
                            )}

                            {/* Motion / Wheel Value */}
                            {(ev.type === 'moveX' || ev.type === 'moveY' || ev.type === 'wheel') && (
                              <div className="macro-motion-wrap">
                                <select
                                  aria-label={`Movement axis for event ${evIndex + 1}`}
                                  className="search"
                                  value={ev.type}
                                  onChange={(e) => handleUpdateEvent(evIndex, { type: e.target.value as 'moveX' | 'moveY' | 'wheel', down: false })}
                                >
                                  <option value="moveX">X (horizontal)</option>
                                  <option value="moveY">Y (vertical)</option>
                                  <option value="wheel">Wheel</option>
                                </select>
                                <span className="sub">Delta:</span>
                                <input
                                  type="number"
                                  min="-128"
                                  max="127"
                                  value={ev.value}
                                  className="search"
                                  style={{ width: 70, height: 32, padding: '0 6px' }}
                                  onChange={(e) => {
                                    const val = Math.max(-128, Math.min(127, parseInt(e.target.value) || 0));
                                    handleUpdateEvent(evIndex, { value: val });
                                  }}
                                />
                              </div>
                            )}

                            {/* State: Press or Release (for Key & MouseButton) */}
                            {(ev.type === 'key' || ev.type === 'mouseButton') && (
                              <div className="segmented" style={{ width: 140 }}>
                                <button
                                  className={ev.down ? 'on' : ''}
                                  onClick={() => handleUpdateEvent(evIndex, { down: true })}
                                >
                                  Press
                                </button>
                                <button
                                  className={!ev.down ? 'on' : ''}
                                  onClick={() => handleUpdateEvent(evIndex, { down: false })}
                                >
                                  Release
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Delete Event Button */}
                        <button
                          className="icon-btn text-danger"
                          title="Remove event"
                          disabled={activeDraft.events.length <= 1}
                          onClick={() => handleDeleteEvent(evIndex)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </section>

              <p className="note">Uploading here changes only the macro bank, never key bindings. To assign a macro, open <strong>Key remap → Macro</strong> after uploading.</p>


            </>
          ) : (
            <div className="empty-pick">
              <Workflow size={32} />
              <div>No macros in this bank</div>
              <button className="btn ink" onClick={handleCreateDraft}>
                <Plus size={14} /> Create macro
              </button>
            </div>
          )}
        </main>
      </div>

      {(dirty || isRecording || pendingRename) && <div className="savebar" ref={barRef} tabIndex={-1} role="status" aria-live="polite">
        <span>{isRecording ? 'Recording — unsaved changes' : pendingRename ? 'Unsaved macro name — finish renaming first' : `${changedSlots} macro slot${changedSlots === 1 ? '' : 's'} changed`}</span>
        <span className="spacer" />
        <button className="btn" onClick={discard}><RotateCcw size={15} /> Discard</button>
        <button className="btn primary" disabled={isRecording || pendingRename} onClick={initiateUploadFlow}>Save</button>
      </div>}
      {deleteIndex !== null && drafts[deleteIndex] && <ConfirmDialog
        title={`Delete “${drafts[deleteIndex].name}”?`} confirmLabel="Delete"
        onCancel={() => setDeleteIndex(null)} onConfirm={() => handleDeleteDraft(deleteIndex)}>
        <p>This removes slot {deleteIndex + 1} from the unsaved bank. The keyboard stays unchanged until Save.</p>
        <p>Later slots shift down. Existing key bindings may then refer to a different macro. Saving is blocked if any layer references a slot removed from the bank.</p>
      </ConfirmDialog>}
      {/* ================= CONFIRMATION MODAL ================= */}
      {showConfirmUpload && (
        <div className="macro-modal-backdrop" onClick={() => setShowConfirmUpload(false)}>
          <div className="macro-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="macro-modal-head">
              <div className="macro-modal-title-row">
                <ShieldAlert size={22} className="text-accent" />
                <h3>Save Macro Bank</h3>
              </div>
              <button className="icon-btn" onClick={() => setShowConfirmUpload(false)}>
                <X size={16} />
              </button>
            </div>

            <div className="macro-modal-body">
              <div className="macro-modal-warning-box">
                <AlertTriangle size={20} className="text-warn flex-shrink-0" />
                <div>
                  <strong>Shared Bank Replacement Notice:</strong>
                  <p style={{ margin: '4px 0 0', lineHeight: 1.45 }}>
                    Uploading replaces the keyboard's <strong>entire shared macro bank</strong> for all 4 layers (Default, FN1, FN2, Tap).
                    Existing slot contents will be overwritten. Any key assigned to a modified slot on any layer will immediately execute the new macro.
                  </p>
                </div>
              </div>

              <div className="macro-modal-checklist">
                <div className="macro-check-item">
                  <Check size={16} className="text-ok" />
                  <span>
                    Bank size: <strong>{bankBytesUsed}</strong> / {MACRO_BANK_SIZE} bytes ({drafts.length} macros).
                  </span>
                </div>
                <div className="macro-check-item">
                  <Check size={16} className="text-ok" />
                  <span>
                    Preflight: All 4 matrix layers will be validated against macro slots before writing.
                  </span>
                </div>
                <p className="note">No key bindings will be written. Assign macros separately in Key remap.</p>
              </div>

              <label className="macro-ack-checkbox">
                <input type="checkbox" checked={replacementConfirmed} onChange={(e) => setReplacementConfirmed(e.target.checked)} />
                <span>I authorize replacing the shared slots on all layers. Uploads are not atomic.</span>
              </label>
              <p className="note">The current decoded bank will be saved in this browser before upload. If reading or saving fails, upload stops. Key bindings are not included. Export the backup to keep a separate copy.</p>
              {!isWired && (
                <div className="macro-wireless-ack-box">
                  <div className="macro-wireless-title">
                    <AlertCircle size={16} className="text-danger" />
                    <strong>Wireless 2.4G Connection Detected</strong>
                  </div>
                  <p className="note" style={{ margin: '4px 0 8px' }}>
                    Wireless macro paging is experimental. Keep the keyboard awake and close other keyboard apps. Saving requires a backup read and a full byte-for-byte read-back comparison; a failed save can leave a partially changed bank.
                  </p>
                  <label className="macro-ack-checkbox">
                    <input
                      type="checkbox"
                      checked={wirelessAckConfirmed}
                      onChange={(e) => setWirelessAckConfirmed(e.target.checked)}
                    />
                    <span>I understand and wish to proceed over 2.4G wireless</span>
                  </label>
                </div>
              )}
            </div>

            <div className="macro-modal-footer">
              <button className="btn" onClick={() => setShowConfirmUpload(false)}>
                Cancel
              </button>
              <button
                className="btn primary"
                disabled={!replacementConfirmed || (!isWired && !wirelessAckConfirmed)}
                onClick={handleConfirmUpload}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
