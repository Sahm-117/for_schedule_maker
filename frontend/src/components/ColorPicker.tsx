import React, { useState } from 'react';

interface ColorPickerProps {
  value: string;
  onChange: (color: string) => void;
  label?: string;
}

// Predefined color options (8 colors)
const PRESET_COLORS = [
  { name: 'Red', hex: '#EF4444' },
  { name: 'Orange', hex: '#F59E0B' },
  { name: 'Yellow', hex: '#FBBF24' },
  { name: 'Green', hex: '#10B981' },
  { name: 'Blue', hex: '#3B82F6' },
  { name: 'Purple', hex: '#8B5CF6' },
  { name: 'Pink', hex: '#EC4899' },
  { name: 'Gray', hex: '#6B7280' },
];

const ColorPicker: React.FC<ColorPickerProps> = ({ value, onChange, label = 'Color' }) => {
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customColor, setCustomColor] = useState(value);

  const handlePresetClick = (color: string) => {
    onChange(color);
    setShowCustomPicker(false);
  };

  const handleCustomColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newColor = e.target.value;
    setCustomColor(newColor);
    onChange(newColor);
  };

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {label}
      </label>

      {/* Preset Color Pills */}
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            onClick={() => handlePresetClick(color.hex)}
            className={`
              w-10 h-10 rounded-lg border-2 transition-all
              ${value === color.hex ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-2' : 'border-gray-300 hover:border-gray-400'}
            `}
            style={{ backgroundColor: color.hex }}
            title={color.name}
          >
            {value === color.hex && (
              <svg className="w-5 h-5 mx-auto text-white drop-shadow" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </button>
        ))}

        {/* Custom Color Button */}
        <button
          type="button"
          onClick={() => setShowCustomPicker(!showCustomPicker)}
          className={`
            w-10 h-10 rounded-lg border-2 transition-all flex items-center justify-center
            ${showCustomPicker ? 'border-gray-900 ring-2 ring-gray-900 ring-offset-2' : 'border-gray-300 hover:border-gray-400'}
          `}
          style={{
            backgroundColor: !PRESET_COLORS.some(c => c.hex === value) ? value : '#ffffff',
          }}
          title="Custom Color"
        >
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
        </button>
      </div>

      {/* Custom Color Picker */}
      {showCustomPicker && (
        <div className="mt-3 p-3 border border-gray-300 rounded-lg bg-gray-50">
          <label className="block text-xs font-medium text-gray-600 mb-2">
            Custom Color
          </label>
          <div className="flex items-center gap-3">
            <input
              type="color"
              value={customColor}
              onChange={handleCustomColorChange}
              className="w-16 h-10 rounded border border-gray-300 cursor-pointer"
            />
            <input
              type="text"
              value={customColor.toUpperCase()}
              onChange={(e) => {
                const val = e.target.value;
                if (/^#[0-9A-Fa-f]{0,6}$/.test(val)) {
                  setCustomColor(val);
                  if (val.length === 7) {
                    onChange(val);
                  }
                }
              }}
              placeholder="#FF5733"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm font-mono"
              maxLength={7}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Enter a hex color code (e.g., #FF5733)
          </p>
        </div>
      )}

      {/* Selected Color Preview */}
      <div className="flex items-center gap-2 text-sm text-gray-600">
        <span className="font-medium">Selected:</span>
        <div
          className="w-6 h-6 rounded border border-gray-300"
          style={{ backgroundColor: value }}
        />
        <span className="font-mono text-xs">{value.toUpperCase()}</span>
      </div>
    </div>
  );
};

export default ColorPicker;
