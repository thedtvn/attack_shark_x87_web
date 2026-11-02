import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, ChevronUp, Palette, RotateCcw, Sparkles } from 'lucide-react';
import {
  PRESET_CHARCOAL,
  PRESET_CREAM,
  isValidHex,
  type CustomizableColorKey,
} from '../theme/appearance';
import { useAppearance } from '../theme/AppearanceContext';

interface ColorFieldConfig {
  key: CustomizableColorKey;
  label: string;
  desc: string;
}

const COLOR_FIELDS: ColorFieldConfig[] = [
  { key: 'caseColor', label: 'Case / Shell', desc: 'Outer chassis and bezel' },
  { key: 'mainKeyColor', label: 'Main Keys', desc: 'Alphanumerics and F1-F4, F9-F12' },
  { key: 'subKeyColor', label: 'Modifiers & Nav', desc: 'Shift, Ctrl, Alt, Nav cluster, F5-F8' },
  { key: 'accentKeyColor', label: 'Accent Keys', desc: 'Esc, Enter, Space, and Arrow keys' },
  { key: 'legendColor', label: 'Legends', desc: 'Key labels and symbol markings' },
];

interface ColorInputProps {
  label: string;
  desc?: string;
  value: string;
  onChange: (hex: string) => void;
  id: string;
}

function ColorInputItem({ label, desc, value, onChange, id }: ColorInputProps) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(value);

  const displayValue = focused ? draft : value;

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDraft(val);
    if (isValidHex(val)) {
      onChange(val);
    }
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setDraft(val);
    onChange(val);
  };

  const hexVal = isValidHex(displayValue)
    ? (displayValue.length === 4
        ? `#${displayValue[1]}${displayValue[1]}${displayValue[2]}${displayValue[2]}${displayValue[3]}${displayValue[3]}`
        : displayValue)
    : value;

  return (
    <div className="color-field-row">
      <div className="color-field-meta">
        <label htmlFor={`${id}-color`} className="color-field-label">
          {label}
        </label>
        {desc && <span className="color-field-desc">{desc}</span>}
      </div>
      <div className="color-picker-control">
        <label
          htmlFor={`${id}-color`}
          className="color-swatch-btn"
          style={{ backgroundColor: isValidHex(displayValue) ? displayValue : value }}
          title={`Choose ${label} color`}
        >
          <input
            id={`${id}-color`}
            type="color"
            value={hexVal}
            onChange={handleColorChange}
            className="color-native-input"
          />
        </label>
        <input
          id={`${id}-hex`}
          type="text"
          value={displayValue.toUpperCase()}
          onFocus={() => {
            setFocused(true);
            setDraft(value);
          }}
          onChange={handleTextChange}
          onBlur={() => {
            setFocused(false);
            if (!isValidHex(draft)) setDraft(value);
          }}
          className="color-hex-input"
          maxLength={7}
          spellCheck={false}
          aria-label={`${label} hex code`}
        />
      </div>
    </div>
  );
}

interface SwatchPreviewProps {
  caseColor: string;
  mainColor: string;
  subColor: string;
  accentColor: string;
}

function SwatchPreview({ caseColor, mainColor, subColor, accentColor }: SwatchPreviewProps) {
  return (
    <div className="swatch-strip" style={{ borderColor: caseColor }}>
      <span className="swatch-chip" style={{ backgroundColor: caseColor }} title="Case" />
      <span className="swatch-chip" style={{ backgroundColor: mainColor }} title="Main keys" />
      <span className="swatch-chip" style={{ backgroundColor: subColor }} title="Modifiers" />
      <span className="swatch-chip" style={{ backgroundColor: accentColor }} title="Accent keys" />
    </div>
  );
}

export function AppearancePopover() {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const { appearance, setPreset, setColor, resetToDefault, isCustom } = useAppearance();

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className="appearance-popover-wrapper">
      <button
        ref={buttonRef}
        className={`icon-btn ${open ? 'active' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        title="Keyboard Appearance & Colorway"
        aria-label="Keyboard Appearance & Colorway"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Palette size={18} />
      </button>

      {open && (
        <div ref={popoverRef} className="appearance-popover" role="dialog" aria-label="Keyboard appearance">
          <div className="popover-header">
            <div className="popover-title-row">
              <span className="popover-title">Keyboard Colorway</span>
              {isCustom ? (
                <span className="pill-badge custom">Custom</span>
              ) : appearance.preset === 'charcoal' ? (
                <span className="pill-badge factory">Default</span>
              ) : (
                <span className="pill-badge">Factory</span>
              )}
            </div>
            <p className="popover-subtitle">Visual style of the keyboard on screen</p>
          </div>

          <div className="preset-cards-grid">
            {/* Preset 1: Charcoal & Yellow (Default Black) */}
            <button
              className={`preset-card ${appearance.preset === 'charcoal' ? 'selected' : ''}`}
              onClick={() => {
                setPreset('charcoal');
              }}
              type="button"
            >
              <div className="preset-card-top">
                <SwatchPreview
                  caseColor={PRESET_CHARCOAL.caseColor}
                  mainColor={PRESET_CHARCOAL.mainKeyColor}
                  subColor={PRESET_CHARCOAL.subKeyColor}
                  accentColor={PRESET_CHARCOAL.accentKeyColor}
                />
                {appearance.preset === 'charcoal' && <Check size={16} className="check-icon" />}
              </div>
              <div className="preset-card-body">
                <span className="preset-name">Charcoal & Yellow</span>
                <span className="preset-desc">Stealth chassis with cyber yellow</span>
              </div>
            </button>

            {/* Preset 2: Retro Cream */}
            <button
              className={`preset-card ${appearance.preset === 'cream' ? 'selected' : ''}`}
              onClick={() => {
                setPreset('cream');
              }}
              type="button"
            >
              <div className="preset-card-top">
                <SwatchPreview
                  caseColor={PRESET_CREAM.caseColor}
                  mainColor={PRESET_CREAM.mainKeyColor}
                  subColor={PRESET_CREAM.subKeyColor}
                  accentColor={PRESET_CREAM.accentKeyColor}
                />
                {appearance.preset === 'cream' && <Check size={16} className="check-icon" />}
              </div>
              <div className="preset-card-body">
                <span className="preset-name">Retro Cream</span>
                <span className="preset-desc">Classic warm beige & slate</span>
              </div>
            </button>
          </div>

          {/* Collapsible Custom Palette Section */}
          <div className="popover-custom-toggle-wrap">
            <button
              className="popover-toggle-btn"
              onClick={() => setShowCustom((s) => !s)}
              type="button"
              aria-expanded={showCustom}
            >
              <Sparkles size={14} />
              <span>{isCustom ? 'Custom Colors (Active)' : 'Customize Palette'}</span>
              {showCustom ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          </div>

          {showCustom && (
            <div className="popover-custom-section">
              {COLOR_FIELDS.map((field) => (
                <ColorInputItem
                  key={field.key}
                  id={`pop-${field.key}`}
                  label={field.label}
                  value={appearance[field.key]}
                  onChange={(hex) => setColor(field.key, hex)}
                />
              ))}
            </div>
          )}

          <div className="popover-footer">
            <button
              className="btn btn-sm text-btn"
              onClick={resetToDefault}
              type="button"
              title="Reset to Charcoal & Yellow (Default)"
            >
              <RotateCcw size={13} /> Reset default
            </button>
            <span className="popover-hint">Saved in this browser</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppearanceSettingsCard() {
  const { appearance, setPreset, setColor, resetToPreset, resetToDefault, isCustom } = useAppearance();

  return (
    <section className="card appearance-card">
      <div className="card-header-row">
        <div>
          <h3>Keyboard Appearance</h3>
          <p className="note">
            Select an official Attack Shark X87 colorway or craft a custom palette. Changes are saved
            locally and update the visualizer without altering hardware lighting.
          </p>
        </div>
        {isCustom && <span className="pill-badge custom">Custom Palette</span>}
      </div>

      <div className="setting-block">
        <label className="section-subheading">Color Presets</label>
        <div className="preset-cards-grid settings-grid">
          {/* Preset 1: Charcoal & Yellow */}
          <button
            className={`preset-card lg ${appearance.preset === 'charcoal' ? 'selected' : ''}`}
            onClick={() => setPreset('charcoal')}
            type="button"
          >
            <div className="preset-card-top">
              <SwatchPreview
                caseColor={PRESET_CHARCOAL.caseColor}
                mainColor={PRESET_CHARCOAL.mainKeyColor}
                subColor={PRESET_CHARCOAL.subKeyColor}
                accentColor={PRESET_CHARCOAL.accentKeyColor}
              />
              <span className="tag factory">Default</span>
              {appearance.preset === 'charcoal' && <Check size={18} className="check-icon" />}
            </div>
            <div className="preset-card-body">
              <strong className="preset-name">Charcoal & Yellow</strong>
              <span className="preset-desc">
                Dark stealth shell, medium slate alphas, deep modifiers, and vivid yellow accents.
              </span>
            </div>
          </button>

          {/* Preset 2: Retro Cream */}
          <button
            className={`preset-card lg ${appearance.preset === 'cream' ? 'selected' : ''}`}
            onClick={() => setPreset('cream')}
            type="button"
          >
            <div className="preset-card-top">
              <SwatchPreview
                caseColor={PRESET_CREAM.caseColor}
                mainColor={PRESET_CREAM.mainKeyColor}
                subColor={PRESET_CREAM.subKeyColor}
                accentColor={PRESET_CREAM.accentKeyColor}
              />
              <span className="tag">Factory</span>
              {appearance.preset === 'cream' && <Check size={18} className="check-icon" />}
            </div>
            <div className="preset-card-body">
              <strong className="preset-name">Retro Cream</strong>
              <span className="preset-desc">
                Warm vintage cream chassis, dark charcoal alphas, cream modifiers, and tan accents.
              </span>
            </div>
          </button>
        </div>
      </div>

      <div className="setting-block custom-colors-block">
        <div className="custom-block-header">
          <div>
            <label className="section-subheading">Palette Customization</label>
            <p className="note" style={{ margin: 0 }}>
              Adjust individual key groups or shell colors to match your physical setup.
            </p>
          </div>
          <div className="custom-actions">
            <button
              className="btn btn-sm"
              onClick={() => resetToPreset('charcoal')}
              type="button"
            >
              <RotateCcw size={13} /> Charcoal
            </button>
            <button
              className="btn btn-sm"
              onClick={() => resetToPreset('cream')}
              type="button"
            >
              <RotateCcw size={13} /> Cream
            </button>
            <button
              className="btn btn-sm"
              onClick={resetToDefault}
              type="button"
            >
              <RotateCcw size={13} /> Reset default
            </button>
          </div>
        </div>

        <div className="color-fields-grid">
          {COLOR_FIELDS.map((field) => (
            <ColorInputItem
              key={field.key}
              id={`settings-${field.key}`}
              label={field.label}
              desc={field.desc}
              value={appearance[field.key]}
              onChange={(hex) => setColor(field.key, hex)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
